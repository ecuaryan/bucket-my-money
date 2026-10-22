# Bucket My Money — Project Context for Cursor

This document contains the full product brief, technical stack, architecture decisions, and build instructions for Bucket My Money. Feed this into Cursor at the start of every session to maintain full context.

---

## What Is Bucket My Money?

**Production URL:** https://bucketmymoney.com — custom domain on Vercel. The legacy
`bucket-fund.vercel.app` hostname 308-redirects to the apex domain.

**Registrar / DNS:** Cloudflare → Vercel (A + CNAME). Supabase Auth Site URL
should use `https://bucketmymoney.com`.

Bucket My Money is a **bank-agnostic virtual bucket budgeting PWA** for **you alone or a shared household**. It sits on top of real bank accounts (read via SimpleFIN; see [docs/BANK_PROVIDERS.md](./docs/BANK_PROVIDERS.md)) and helps you **organize** your cash into buckets for an at-a-glance view: label what is reserved, see **Unbucketed** (cash not in buckets — the running balance paydays and bills flow through), and when the bank balance moves, decide which bucket covers it (negative Unbucketed → move money from buckets on purpose). Brand voice and naming notes live in [docs/BRAND.md](./docs/BRAND.md); user-facing strings in `src/lib/brand.ts` (`FLOAT_LABEL` is `'Unbucketed'`, `APP_TAGLINE`, login copy). Full product narrative (word-for-word): [docs/BRAND.md § Product narrative](./docs/BRAND.md#product-narrative).

The primary use case is: **open app → move money from one bucket to another → done. Target: 4 taps from a cold open.**

### Product philosophy

**Organize first.** The core job is **bucket budgeting**: label cash, see **Unbucketed**, move money between buckets in a few taps. That invariant (`cash − credit card balances = buckets + Unbucketed` across the household) must stay rock solid. **Household features** (roles, linked kid accounts, Send to kids without a linked account) support multi-person use but are secondary — they must not add ledger layers that compete with bank truth or complicate the Buckets tab.

**Intentional friction, minimal automation.** When you overspend, you should come in and consciously face the trade-off — moving money from a bucket back into **Unbucketed** — rather than having the app auto-fix or auto-rebalance. The at-a-glance view surfaces reality so you decide; balance refresh is user-initiated, not background polling. This is a clarity tool, not a transaction tracker: one small move when you spend keeps Unbucketed honest.

### Product stage

**Now:** The builder’s family is the first user group — real daily use, discover
issues in the wild, iterate on UX and sync. Integrity for budgeting gaps is
**red negative Unbucketed** in the Buckets tab (bank cash moved; bucket labels did not —
rebalance by moving money between buckets and Unbucketed).

**Later (if this becomes a paid product):** Harden operator-side ledger checks
(automated SQL or cron, logging, optional admin-only alerts) to catch
implementation bugs before support tickets — **not** a second user-facing alarm
for the same situation as negative unbucketed cash. See [Data Integrity](#data-integrity).

---

## Product Brief

### Problem
Bank-native bucketing (e.g. Ally buckets) is bank-locked. Switching banks means rebuilding your entire budgeting system. This app provides a fast, universal mental accounting layer that works across any bank—for solo use or a shared household.

---

### Users & Roles

UI labels: **Admin**, **Shared**, **Kid** (`memberRoles.ts`). DB/API values remain
`admin`, `member`, `child`.

**Admin** (`admin`)
- Full control
- Links/unlinks bank accounts via SimpleFIN
- Creates and deletes buckets for the family pool
- Manages household members (add/remove people, assign roles, set PINs) and assigns linked accounts to kids
- Funds kids via Send; sees all family sends and shared-pool history
- Views family-level transaction history
- On the **shared balance** with Shared-role members (same Unbucketed in Buckets)
- **Admin screen:** join code, household members, and linked accounts (admin-only). The **admin sign-in** card (email display + password reset via email link) lives on the **Settings screen** alongside PIN and biometric, and shows only to the email account owner.

**Account owner** (subset of Admin)
- The person who signed up with email and password (`bootstrap_family` at signup)
- Marked `is_account_owner = true` on their `family_members` row; shown as **Account owner** in Admin → household members
- Cannot be removed or demoted; keeps real email sign-in
- Every household has exactly one account owner

**Co-admin** (`admin`, not account owner)
- Added by an admin with full admin powers; signs in with PIN only (same as Shared/Kid add flow)
- Can be removed by another admin; account owner cannot be removed

**Shared** (`member`, e.g. spouse or co-budgeter)
- Operational access only
- Moves money between buckets
- Shares one **family Unbucketed** number with admin in the Buckets tab (same shared balance)
- Funds kids via Send; sees all family sends and shared-pool history
- Cannot send to admin (shared-balance members share money — use buckets for shared goals)
- Cannot link/unlink accounts or create/delete buckets
- Cannot manage other members

**Kid** (`child`)
- Scoped entirely to their own buckets and balance
- Cannot see family pool buckets or balances
- Can create and manage (rename, delete, reorder) **their own** buckets — people on the shared balance never see these in the Buckets tab
- Can set up and run **their own Auto-bucket rules** (organize / top-up / save-off, scheduled or Run now) over their own buckets and Unbucketed — invisible to admins and shared members, same as their buckets
- Sends to people on the shared balance (returns money to the pool) or other kids; sees
  only sends they participate in

---

### Accounts
- **Money sources** are rows in `accounts`: **linked banks** (SimpleFIN for
  everyone; Plaid behind the `plaid` feature flag for the owner's household;
  quiesced Teller rows persist with frozen balances — see
  [docs/BANK_PROVIDERS.md](./docs/BANK_PROVIDERS.md)) and/or one or more
  **manual amounts** (admin-entered; no bank connection). They sum into the
  family cash pool.
- Only the **admin** links or unlinks banks and adds/edits/removes manual sources (**Admin → Money sources**).
- **Link a bank (SimpleFIN):** the admin subscribes at SimpleFIN Bridge (paid to
  SimpleFIN directly), connects banks there, creates a one-time **Setup Token**,
  and pastes it into Admin. A confirm step picks which discovered accounts to
  import and marks each **cash vs card** (SimpleFIN doesn't classify types).
- **Reconnect** = a fresh Setup Token (SimpleFIN has no update-mode modal). A
  connection that SimpleFIN rejects (402/403) is marked `disconnected` and stops
  refreshing until re-linked.
- **Change which accounts** are shared: manage the connection on the Bridge
  site, then unlink and re-import in Admin (or re-run the confirm step).
- **New links** default to the **family pool** (`accounts.owner_member_id` null). The admin may
  assign an account to a **kid** only (many accounts can belong to one kid). People on the
  shared balance (admin and Shared role) share the family pool in the Buckets tab — assigning to a spouse is not in v1 UI.
- Kids may have zero, one, or multiple linked checking/savings accounts (multiple supported).
- **Two kid money models (do not mix on one kid):**
  - **Virtual-only** (no linked account): balance = net sends − bucket allocations. Adults can **Take** back up to the kid's **total** balance — bucket labels don't shield money from a Take (`return_from_child`, migration 85). If labels exceed what's left, the kid's Unbucketed goes red and *they* pick which bucket covers it, same as an adult overspend. Taking more than the kid's total stays blocked (no negative kid balances). Card-less kids live here — spending is logged via **Send** (e.g. kid → shared balance when someone fronts a purchase). Birthday/earnings: kid hands cash over; shared balance credits them with a **shared → kid send**. Back every credit with real cash (deposit to a linked account or bump a **manual money source**) so shared Unbucketed does not drift red.
  - **Linked** (bank account assigned to the kid): balance = linked bank cash − bucket allocations. Debit-card spending auto-reflects via the bank sync. Money in/out happens at the **real bank** (transfers, allowance deposits) — **no virtual sends in or out** for that kid (`give_money` blocks both directions; the Give UI omits linked kids and shows an explanation card). Admin shows a confirmation sheet before assigning a linked account to a kid (`ADMIN_ASSIGN_ACCOUNT_TO_KID_*` in `brand.ts`).
- Virtual siblings can still send to each other; linked ↔ anyone requires a real bank transfer.
- The family as a whole must have at least one money source (linked bank or manual amount)
- **Manual money sources:** admin-only, family-pool only (`owner_member_id` null), user-edited amounts (no auto-refresh). Coexist with linked banks; Buckets breakdown shows linked cash and manual cash separately when both are present.
- Re-importing the same SimpleFIN account updates one row (unique on
  `family_id` + `simplefin_account_id`), preserving the prior child assignment.
- Real balances are kept in sync two ways: a pg_cron **cadence sweep**
  (`simplefin-scheduled-refresh` re-pulls any linked balance older than
  `SCHEDULED_REFRESH_CADENCE_HOURS`, default 6h — SimpleFIN has no webhooks),
  and the manual Refresh button ("I just moved money, update now"), throttled
  server-side at 30 min to respect SimpleFIN's ~24 requests/day budget.
- **RLS:** kids see only accounts where `owner_member_id` is their member id; shared balance sees all family accounts

---

### Balance Model

**Naming:** Users see **Unbucketed** (`FLOAT_LABEL` in `brand.ts`) — everyday
cash not in buckets. Code, SQL, RPC JSON, and DB columns use **`float`**
(same pool; `NULL` bucket id in `move_money`). See [docs/BRAND.md § Naming](./docs/BRAND.md#naming-display-vs-code).

**The invariant:**
> Sum of all bucket allocations + sum of all unbucketed balances across every member = total cash from all money sources (linked bank balances + manual amounts) − credit card balances (linked or manual).

Every dollar lives in exactly one place — either in a named bucket or in someone's unbucketed balance. Card debt is money already spoken for, so it comes off the top before anything is bucketed (see [docs/CREDIT_CARDS.md](./docs/CREDIT_CARDS.md)).

Unbucketed is **derived** from linked cash, card balances, bucket allocations,
sends, and role rules (`member_float` in SQL). When cash drops or card debt
rises but buckets do not (a debit purchase posts, a card swipe syncs),
Unbucketed goes **negative and red** — that is the intended “something needs
rebalancing” signal, not a separate system-error banner. Paying a linked card's
statement nets to zero: cash and debt fall together.

**Shared balance (admin + Shared role in the Buckets tab):**
- **Unbucketed** (derived via `member_float()` in SQL) is one number for both: family cash minus
  shared-balance bucket allocations minus each kid's total funded balance
  (their linked cash plus net sends). How a kid splits that between their
  own buckets and their own unbucketed cash does not change the shared-balance number.
- **Buckets breakdown (admin + Shared):** one card shows the math — linked cash,
  allocated to buckets, then one line per kid with funds (not a single wrapped total).
- Shared-balance ↔ shared-balance sends are not allowed — they would not move the pool anyway.
- Unbucketed ≥ 0 → green; negative → red — move money from bucket(s) into Unbucketed until the pool matches your intent (every spend should come from somewhere).

**Kid:**
- Unbucketed = their cash accounts + net sends − their bucket allocations
- Virtual-only kids (no linked accounts) are funded entirely by sends from the shared balance
- **Buckets / Send breakdown:** total balance (linked cash + net sends), in your buckets,
  then unbucketed cash — without exposing other members’ balances

**Members with their own linked accounts (future / optional):**
- Per-person linked balances may exist in the schema; Buckets still presents the
  shared adult pool for admin/member roles. See `member_float` in SQL.

**When a bank sync lands a new balance:**
- Real balance updates automatically
- Unbucketed adjusts with it
- Buckets are untouched until the user deliberately moves money
- Every dollar spent has to come from somewhere — user decides which bucket absorbs it

**Set aside (manual):** All roles may move Unbucketed → bucket even when Unbucketed would go
red. **Bucket → anything** still requires enough in the source bucket. **`give_money`**
unchanged. Manual **Set aside** that crosses Unbucketed from ≥ 0 to negative uses a confirm
sheet; automatic **Auto-bucket** runs do not. See [docs/AUTO_ORGANIZE.md](./docs/AUTO_ORGANIZE.md).

---

### Buckets
- Named allocations against a member's or family pool's balance
- **Admin** creates and manages family-pool and shared-balance buckets
- **Shared** moves money and reorders buckets (no create/delete of bucket structure)
- **Kid** creates and manages only their own buckets (hidden from the shared-balance Buckets tab); moves
  money between their unbucketed cash and their own buckets only
- See [README.md § Implementation status](./README.md) for what is shipped on `main`
- No targets — just current allocated amounts
- Buckets start at zero and are funded by moving money from unbucketed cash or via a send from another member

---

### Transactions

**Bucket moves**
- Move $X from one bucket to another, or between a bucket and Unbucketed
- Core interaction — must be achievable in 4 taps from a cold open
- Logged with: amount, from, to, timestamp, optional note

**Virtual sends**
- **Shared balance → virtual kids:** fund a kid's personal unbucketed balance (birthday money, earnings, etc.). Not allowed to **linked** kids — their money moves at the bank.
- **Shared balance ↔ shared balance:** not supported — same pool; use **buckets** instead.
- **Virtual kids → anyone:** from the kid's balance; kid → shared balance returns money to
  the pool (digital "handing over cash" when someone fronts a purchase).
- **Linked kids:** Send is disabled in both directions — spending is their debit card; transfers settle at the bank. UI hides linked kids from recipient lists and explains why.
- Optional note; instant; logged with amount, sender, recipient, timestamp, note.
- Enforced in UI (Give recipient list) and `give_money` RPC.

**Bank sync (SimpleFIN)**
- A pg_cron cadence sweep (`simplefin-scheduled-refresh`) re-pulls any linked balance
  older than 6h (SimpleFIN has no webhooks); the manual Refresh button covers
  "I just moved money" (30-min server throttle)
- Supabase Realtime pushes balance and transaction updates to all open sessions instantly — no manual refresh needed

---

### Transaction History
- **Admin** sees all `send` rows in the family plus `bucket_move` that are not a
  kid's internal moves (unbucketed cash ↔ their buckets). Shared-balance-initiated moves
  involving a kid's bucket (e.g. funding from the family pool) remain visible.
- **Shared** sees all `send` rows in the family plus `bucket_move` on family-pool
  and shared-balance buckets (each other's moves included). Kids' bucket moves
  stay hidden.
- **Kid** sees only moves involving their own buckets, plus sends they're part of.
- Each entry shows: amount, counterparty or bucket name, timestamp, optional note.
- **Bucket names are snapshotted** on each `bucket_move` (`from_bucket_name` /
  `to_bucket_name`), so history stays accurate after a bucket is renamed or
  deleted instead of collapsing to "Unbucketed → Unbucketed" (uses `FLOAT_LABEL`).
- **Member names are snapshotted** on each `send` (`from_member_name` /
  `to_member_name`), so History keeps "Alex" after a kid is removed (member ids
  null via `ON DELETE SET NULL`, same pattern as buckets).
- **Balance snapshots** (optional muted line per row): bucket `allocated_amount`
  before/after on moves; kid total (`member_child_virtual_balance`) before/after
  on sends. Not bank or shared Unbucketed.
- **Shared balance (admin + Shared) see who moved the money** ("Bucket move · by Jamie")
  so a household can tell who touched the shared pool; kids do not
  see the actor line.

---

### Buckets tab
- Bucket list with allocated amounts per bucket (shared balance: shared set, per-person sort order)
- **Unbucketed card** when at least one money source exists: green if ≥ 0, red if < 0
  (red = rebalance signal — cash dropped but bucket labels did not). Info icon opens guidance sheet.
- **No money sources (shared balance):** “Add a money source” CTA instead of the Unbucketed card —
  admin can enter an amount manually from the Buckets tab or link a bank in Admin; Shared-role
  users are told to ask the household admin. Optional note of total allocated across buckets.
- No separate "real balance" display — Unbucketed (when sources exist) is the signal

---

### Data Integrity

Two different situations — do not conflate them in UX or docs.

**1. Budgeting gap (normal, user-facing)**  
Bank or manual pool balance changed; bucket labels did not. Buckets shows negative Unbucketed
(when money sources exist). The user fixes it with bucket moves. No extra
“integrity” modal. With no money sources, Buckets shows the add-a-money-source CTA instead.

**2. System ledger gap (abnormal, operator-facing)**  
Stored cash, allocations, and per-member math no longer form one consistent
ledger (bug, migration mistake, bypass of `move_money` / `give_money`). Rare
when all writes go through RPCs and Buckets uses one SQL definition. **Deferred**
for family beta; revisit before charging strangers — automated check + operator
alert (see `check-invariant` stub), not a duplicate of red Unbucketed.

**Today:** Money writes only via `move_money` and `give_money`; database tests
in `tests/db/`. Scaffolding for a family-wide checker exists but is not wired.

---

### Multi-Tenancy
- The **Family** is the top-level tenant
- All members, accounts, buckets, and transactions belong to a family
- Families are completely isolated from each other via Supabase Row Level Security (RLS)
- Every table has a `family_id` column
- Admin role is scoped to a family, not the platform
- Designed to support future SaaS monetization — add a `plan` field to the family record and gate features accordingly

---

### Security
- Supabase Row Level Security enforced on every table
- Queries filtered by authenticated user and role at the database level — not the application level
- Child role locked to their own data only — no query can return another member's balances, buckets, or transactions
- Family-wide totals and adult shared-pool math run server-side in SQL (`SECURITY DEFINER` helpers); child clients never receive other members’ balances via RLS
- Multi-tenant isolation via `family_id` on every table

#### Supabase Advisor (accepted findings)
Supabase Security Advisor flags generic patterns that are often accidental. This
app uses several **on purpose** after review and DB tests (`tests/db/`). Do not
“Autofix” or revoke grants without reading the migration comments and tests.

| Lint | Finding | Status |
|------|---------|--------|
| **0010** | Security definer view (`transactions_client`) | **Fixed** in migration 57 — `security_invoker` view + `client_float_balance_*` helpers + column grants on `transactions` |
| **0029** | Signed-in users can execute `SECURITY DEFINER` RPCs (`move_money`, `give_money`, `auth_*`, etc.) | **Accepted** — intentional client API; money writes only via RPCs; migration 56 revoked `anon` and internal helpers |
| **0029** | `client_float_balance_*`, `transaction_visible_to_caller` | **Accepted** — needed for History redaction and RLS; visibility checks inside definer bodies |
| **Auth** | Leaked password protection disabled | **Deferred** — Pro plan; enable in Dashboard when available (account-owner email/password only) |

RPC surface hardening lives in `00000000000056_db_linter_security_hardening.sql`;
History view hardening in `00000000000057_transactions_client_security_invoker.sql`.

---

### Authentication
- **Admin (setup & bank):** email + password via Supabase Auth. Sign-up
  collects **only email + password** (no name or household fields) to keep
  onboarding frictionless and set up a future one-click OAuth path. Sign-up sets
  `bootstrap_family` metadata so only the first admin creates a tenant (PIN
  users do not spawn extra families). The `handle_new_user` trigger defaults the
  member display name to the **email local-part** (e.g. `ryan`) and the family
  name to `<email>'s Family`; neither is prompted for at signup. The admin keeps
  a **real email** on `auth.users` (shown on Settings → Admin sign-in; password
  reset via the same forgot-password email flow as login).
- **Member display names:** admin-managed. Names must be **unique within a
  family** (case-insensitive) so PIN sign-in, Send, and the admin roster stay
  unambiguous. Admins inline-rename **any** member (including their own row) on
  Admin → members; the guarded `family_members.update({ name })` is allowed only
  for admins by the `family_members_update_admin` RLS policy. Non-admins
  (member/child) cannot rename anyone. Renaming the admin's own row refreshes
  the auth `member` so the header updates immediately.
- **Household name (deferred):** the auto-generated family name is **no longer
  surfaced** in the solo UI — the PIN roster shows `APP_NAME` instead of the
  stored family name. Collecting and naming a real household moves to a future
  sharing/invite flow (likely a paid surface). The **family-of-one tenant model
  and RLS are unchanged**: every row still carries `family_id` and is scoped by
  `auth_family_id()`.
- **Admin / Member / Child (day-to-day):** bind device once with an unguessable
  **family join code** or QR (`/join?code=…`), then avatar + **4-digit PIN**.
  Devices with a stored join code redirect to `/login/family` when signed out
  (email `/login` remains for account setup and `?signup=1`).
  Each person gets an `auth.users` row. **PIN-only members and children** use
  an internal `{memberId}@pin.bucketmymoney.internal` address (never shown in UI).
  **Admin PIN login** still uses the admin’s real email — the `pin-login` Edge
  Function issues a session via magic link without rotating the email password.
- **PIN management:** two surfaces. (1) **Admin page → household members** —
  admins set/reset any member's PIN (initial setup for Shared/Kid, re-secure,
  unlock). (2) **Settings → PIN** — every signed-in member sets or changes
  **their own** PIN via the `set-own-pin` Edge Function (`requireMember`, touches
  only the caller's row; no current-PIN required). Non-admins always already have
  a PIN (an admin set it before they could sign in) so they see "Change PIN"; the
  email account owner may have none yet, so they see "Set a PIN". Only the
  **account owner** sees **Remove PIN** (`clear-own-pin`, owner-guarded) — they
  keep email + password, whereas a PIN-only member removing theirs would be
  locked out. A self change keeps the member's passkey; an **admin** resetting
  **another** member's PIN
  deletes that member's passkey (re-secure). Resetting **another** member's PIN
  signs them out on every device. Resetting **your own** PIN (either surface)
  signs you out on every **other** device (revoked on save via
  `signOut({ scope: 'others' })`); the device where you save stays signed in.
  Other devices drop on the next refresh or activity — JWTs can linger until expiry.
- **Lockout:** 6 failed PIN attempts → locked until admin clears.
- **Join code rotation:** admin can rotate; only affects **new** device binds.
- **Sessions:** independent per person — logout on one device does not sign out others.
- **Shared phones:** all signed-in sessions sign out locally after **60 seconds** hidden
  (browser tab or installed PWA via `visibilitychange`; elapsed time checked on return
  because mobile OSes often suspend background timers). On hide, a branded gate (app icon +
  loading spinner) covers balances; on return under 60s the gate clears; after 60s re-auth
  via family PIN when the device has a join code. Manual header Sign out remains available.
- **Kill / cold start:** auth tokens are stored in `sessionStorage`, not `localStorage`, so
  force-quitting or reopening the PWA after the process ends requires sign-in again (tab
  reload keeps the session). Legacy `localStorage` tokens are migrated only on reload, not on
  navigate.
- **Buckets tab bucket visibility:** admin and member see family-pool + adult-owned buckets
  only (not children's buckets). Each adult orders that list independently via
  `member_bucket_order`. Children see only their own buckets.
- **Bucket groups (v1.15):** each person can visually group their Buckets tab
  (e.g. Cruise, Kids) — names optional, empty groups allowed, groups collapse
  (state saved) and reorder like buckets. Per-member only (`member_bucket_groups`,
  `member_bucket_order.group_id`); never affects balances, History, or anyone
  else's view. An `is_ungrouped` row stores where the implicit **Ungrouped**
  section sits; new groups are appended at the bottom (next to the New group button). Deleting a group only ungroups its
  buckets. Writes go through `create/rename/delete_bucket_group`,
  `set_bucket_group_collapsed`, and `save_bucket_layout`.
- **Bank tab card order (v1.16):** each person can reorder the institution cards
  on the Bank tab (grip, long-press the card heading, or the heading menu) —
  whole institutions only, never the accounts inside. Per-member only
  (`member_bank_order`, keyed by lower-cased institution name; written by
  `save_bank_order`); unlisted institutions follow in first-seen order.
- **Pending card payments (v1.16.4):** while a card payment is pending, checking
  may already be lower while the card still shows the old balance, so the payment
  would be subtracted twice. For Plaid, the refresh path nets in-flight payments
  against card debt (`accounts.pending_payment_credit`, applied by
  `card_effective_debt` in `member_float` / the breakdown) — conservatively, and
  only when both feeds clearly agree. Details and limits:
  [docs/CREDIT_CARDS.md § Pending payments](./docs/CREDIT_CARDS.md#pending-payments-plaid).
- **Biometric (passkey) fast path:** any member can enroll a **WebAuthn passkey**
  on their **own device** (Settings → Biometric unlock) so they open the app with
  Face ID / Touch ID instead of typing their PIN (or, for the admin, email +
  password). Each member already has an independent `auth.users` identity, so this
  works for everyone — the admin, a shared spouse, and kids alike. A passkey only
  replaces the credential-exchange step; sessions are minted by the **same**
  `issueSessionForMember` helper that PIN login uses (`_shared/session.ts`). The
  affordance is a **fingerprint icon** on both the member's **PIN screen** (the
  enrolled member lands there directly — no separate "tap to unlock" gate) and the
  **email/password page** (for an admin who never sets a PIN), shown only when a
  passkey is bound to this device and a platform authenticator exists. On load
  the screen shows a **spinner** while it confirms the server still has the
  passkey (`webauthn-has-passkey`, pre-auth); it reveals the fingerprint only if
  so, and silently drops a stale binding if not. If the server is unreachable it
  stays optimistic and a bad tap self-heals. (This is why a dev reseed no longer
  shows a dead print.) The page offers **exactly the fast methods that exist**:
  fingerprint only when this device enrolled biometric (the binding) + the server
  confirms the passkey; a small **"PIN" button** whenever the device's member has
  a PIN. The member is remembered per device on **any** sign-in (`deviceMember`
  in `localStorage`, set in `auth.tsx`), so a member who only ever set a PIN (no
  biometric) still gets the PIN button — `webauthn-has-passkey` returns both
  `exists` and `hasPin`. PIN routes through `pin-login` (same 6-attempt lockout,
  no new brute-force surface, no join code), so the owner can have any of
  biometric / PIN / email+password on their own device.
  **PIN/password fallback** is always one tap away (so a kid handed a parent's
  phone picks their own avatar + PIN). WebAuthn returns one ambiguous error for
  cancel / wrong-finger / timeout, so failures show a friendly "That didn't work —
  try again or use your PIN" (never the raw W3C text; see `passkeyErrorMessage` in
  `src/lib/passkey.ts`). Credentials live in `member_passkeys` (public key
  written only by Edge Functions via the service role, like `pin_hash`); a device
  binds to exactly one member (`bucketmymoney_biometric` in `localStorage`), so a
  borrowed phone's blast radius is that one account. Edge Functions:
  `webauthn-register-options/-verify` (authenticated) and
  `webauthn-login-options/-verify` (pre-session, like pin-login). Verification
  uses `@simplewebauthn/server` with **user-verification required**, single-use
  short-TTL challenges, origin/RP-ID checks, and signature-counter replay
  protection. RP-ID/origins come from `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGINS` env
  (default `localhost` for dev). **Lifecycle rules (keep these coherent):**
  (1) **one passkey per member** — enrolling replaces any prior (latest device
  wins), so re-enrolling never dead-ends even if a device's local binding was
  lost; (2) the biometric binding is **independent of the join code** —
  unlinking the household device does not remove a passkey; (3) an admin
  **resetting another member's PIN** also deletes that member's passkey (a reset
  re-secures, so an old passkey must not bypass the new PIN); resetting your own
  PIN keeps your passkey; (4) removing a member cascades their passkeys; a login
  against a revoked credential returns `noPasskey`, and the client clears the
  stale binding. **Security ceiling:** biometric strength == the device's OS lock
  — only enroll on a device whose lock is private to that member.
- **Deferred:** optional member email, children-first polish.

### Hide amounts (Settings)

Per-member preference stored in `localStorage` (`HideAmountsProvider`). Masks
dollar amounts across the app while bucket names, member names, and money flows
stay visible.

**Peek:** when hide amounts is on, a fixed **Peek** control appears at the
bottom-right on normal screens. On sheets it moves to the backdrop **below the
panel** so it does not cover action buttons. Press and hold to temporarily show
all masked dollar amounts; release to mask again. Tap Peek for a short hint.

Implementation: `HideAmountsPeekFab`, `hideAmountsPeekLogic.ts`, peek state in
`HideAmountsProvider`; strings in `src/lib/brand.ts` (`HIDE_AMOUNTS_*`).

### Auto-bucket (shipped — v1)

**Auto-bucket** — automatically organize money from Unbucketed into buckets on calendar days the
user chooses (default **3 AM local**). Admin configures the **household pool** (Shared sees it
read-only); each **kid self-serves their own** Auto-bucket rules over their own buckets and Unbucketed —
invisible to admins and shared members, same as kids' own buckets, and identical for linked and
virtual kids. Create, pause, **Run now**, edit; server runs due rules via
**pg_cron → `run_due_auto_organizes`**. Schema: `auto_organizes` / `auto_organize_*`
(migrations `00000000000048`–`50`; kinds `58`; kid scope via `owner_member_id` in `76`). Full
spec: [docs/AUTO_ORGANIZE.md](./docs/AUTO_ORGANIZE.md).

**Run policy (v1):** at most one **scheduled** run per Auto-bucket rule per local day;
**Run now** may execute multiple times the same day; a manual run on a due day blocks
cron that day. **Paused** blocks both scheduled and manual runs until **Resume**.

Kid **Auto-bucket rules** shipped (migration `76`, `owner_member_id` scope). Deferred after v1:
scheduled **Give to a kid** (`give_money` via a future Auto-bucket `give` kind), bucket-row
“+$X in Auto-bucket” hints, editor review step before save, local seed scenario.

---

### Feature flags (shipped — plumbing only)

**Owner-controlled, per-household feature flags** so the app owner can enable an
in-progress feature for a **single household** without shipping it to everyone.
Not an in-app admin toggle: the owner sets a row directly in Supabase (service
role); the client only **reads** flags. Per household (`family_id`), **default
off** (no row → registry default), so other households are unaffected. Table
`feature_flags` (migration `82`): whole family may `SELECT`; no authenticated
writes (mirrors `teller_events`). Registry + `useFeatureFlag` in
`src/lib/featureFlags.ts` / `src/hooks/FeatureFlagsProvider.tsx`. The `bitcoin`
flag is registered (off) but **not yet consumed** — it will gate future Bitcoin
features for kids. Full spec: [docs/FEATURE_FLAGS.md](./docs/FEATURE_FLAGS.md).

---

### Out of Scope (defer these)
- Push notifications
- Transaction history free-text search (the gives/takes and per-bucket filters shipped)
- Super-admin / platform management UI
- Automated operator ledger monitoring (family-wide invariant job, violation
  table, in-app admin integrity banner) — family beta first; add if this ships
  as a paid multi-tenant product

### Credit cards & linked liabilities (shipped)

**Credit cards integrate as liabilities** (migration `79`): card balances
subtract from the household balance, making the ledger identity
**cash − credit card balances = bucket allocations + Unbucketed**. Cards only
(no loans/mortgages), household-scoped (never assigned to a kid — enforced by
a database trigger), manual card balances supported alongside bank-linked
ones, and one notice sheet when a link brings card debt in — then truth, even
when it turns Unbucketed deep red. Card spending behaves like debit spending:
the swipe dips Unbucketed and the user covers it from a bucket; paying the
statement nets to zero. Design and rationale: [docs/CREDIT_CARDS.md](./docs/CREDIT_CARDS.md).

---

## Technical Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React + Vite | Fast dev, excellent PWA support |
| Language | TypeScript | Non-negotiable for financial logic integrity |
| Styling | Tailwind CSS | Fast, consistent |
| Backend / DB | Supabase | Auth + Postgres + Realtime + Edge Functions, free tier |
| Bank sync | SimpleFIN Bridge | Read-only; user-paid subscription; Teller quiesced (see docs/BANK_PROVIDERS.md) |
| Hosting | Vercel (free tier) | Production: [bucketmymoney.com](https://bucketmymoney.com); `vercel.json` rewrites all routes to `index.html` for SPA deep links |
| PWA | vite-plugin-pwa | Service worker, installable, offline fallback |
| Auth | Supabase Auth + PIN + WebAuthn | Covers all member types and device scenarios |

**No separate Node.js backend.** All server-side logic runs in Supabase Edge Functions (Deno runtime).

### Architecture
```
React PWA (Vercel — bucketmymoney.com)
    ↕
Supabase (Auth + Postgres + Realtime + Edge Functions)
    ↕
SimpleFIN Bridge (pg_cron cadence sweep → Edge Function → Supabase DB)
```

### Deployment

| Environment | URL | Notes |
|---|---|---|
| Production (live) | https://bucketmymoney.com | Auto-deploy from `main` on GitHub |
| Local dev | http://localhost:5173 | `npm run dev` |

- **SPA routing:** Client routes (`/login`, `/login/family`, `/join`, `/admin`, etc.) require `vercel.json` rewrites; without them, refreshing a deep link returns 404 from Vercel.
- **Supabase Auth:** Site URL `https://bucketmymoney.com`. Redirect allow list:
  `https://bucketmymoney.com/**` and `http://localhost:5173/**` (covers `/login/reset`).
- **Family join links:** Admin QR / copy-link use the current origin, e.g.
  `https://bucketmymoney.com/join?code=…`.

### Free Tier Limits (personal use today; revisit at paid-customer scale)
| Service | Relevant Limit |
|---|---|
| Vercel | 100GB bandwidth, unlimited deploys |
| Supabase DB | 500MB storage |
| Supabase Realtime | 200 concurrent connections |
| Supabase Edge Functions | 500k invocations/month |
| SimpleFIN Bridge | User-paid ($1.50/mo or $15/yr per account holder, direct to SimpleFIN) |

---

## Database Schema (initial)

```sql
-- Families (tenants)
families (
  id uuid primary key,
  name text,
  plan text default 'free',
  created_at timestamptz
)

-- Members
family_members (
  id uuid primary key,
  family_id uuid references families,
  user_id uuid references auth.users nullable, -- null for PIN-only children
  name text,
  role text check (role in ('admin', 'member', 'child')),
  avatar_url text,
  pin_hash text, -- for child PIN login
  created_at timestamptz
)

-- Linked bank accounts
accounts (
  id uuid primary key,
  family_id uuid references families,
  owner_member_id uuid references family_members nullable, -- null = family pool
  source text, -- 'teller' | 'manual' | 'simplefin' | 'plaid'
  teller_account_id text,      -- + teller_enrollment_id (quiesced provider)
  simplefin_account_id text,   -- + simplefin_connection_id
  institution_name text,
  account_name text,
  account_type text,
  current_balance numeric,
  last_synced_at timestamptz,
  created_at timestamptz
)

-- Buckets
buckets (
  id uuid primary key,
  family_id uuid references families,
  owner_member_id uuid references family_members nullable, -- null = family pool bucket
  name text,
  allocated_amount numeric default 0,
  created_at timestamptz
)

-- Virtual transactions (bucket moves and sends)
transactions (
  id uuid primary key,
  family_id uuid references families,
  type text check (type in ('bucket_move', 'send')),
  amount numeric,
  from_bucket_id uuid references buckets nullable,
  to_bucket_id uuid references buckets nullable,
  from_member_id uuid references family_members nullable,
  to_member_id uuid references family_members nullable,
  note text,
  created_at timestamptz
)

-- Teller webhook events log
teller_events (
  id uuid primary key,
  family_id uuid references families,
  account_id uuid references accounts,
  event_type text,
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz
)
```

RLS policies are implemented in
`supabase/migrations/00000000000001_rls_and_auth_bootstrap.sql` (replacing
the fail-closed stubs in the initial schema). Every table filters by
`family_id` via `auth_family_id()` with per-role refinements for
admin / member / child.

---

## Folder Structure

```
bucket-my-money/
├── public/
│   ├── icons/              # PWA icons (all required sizes)
│   └── offline.html        # PWA offline fallback
├── src/
│   ├── components/
│   │   ├── ui/             # Reusable primitives (e.g. PinInput)
│   │   └── layout/         # Shell, nav, header (AppShell)
│   ├── features/
│   │   ├── auth/           # Login (email/password, family PIN, passkey/biometric)
│   │   ├── buckets/        # Buckets tab (/) — route `/`, bucket list, move flow, CRUD
│   │   ├── give/           # Give money flow (GivePage + give_money RPC)
│   │   ├── kids/           # Kids tab — kid balances, give/take actions
│   │   ├── accounts/       # Read-only Bank activity view
│   │   ├── history/        # Transaction history
│   │   ├── admin/          # Join code, members, linked accounts
│   │   └── settings/       # PIN, biometric, and admin sign-in account cards
│   ├── lib/
│   │   ├── supabase.ts     # Supabase client
│   │   ├── auth.tsx        # Auth context + Realtime JWT sync
│   │   ├── bankProviders.ts# Provider dispatch (docs/BANK_PROVIDERS.md)
│   │   ├── simplefin.ts    # SimpleFIN client helpers
│   │   ├── teller.ts       # Teller Connect client helpers (quiesced)
│   │   ├── buckets.ts      # move_money RPC + bucket CRUD helpers
│   │   ├── accounts.ts     # Cash filtering, assignAccountOwner (family ↔ child)
│   │   └── invariant.ts    # Client-side invariant helper (optimistic UI only)
│   ├── hooks/              # Shared React hooks
│   ├── types/              # TypeScript types mirroring DB schema
│   ├── index.css           # Tailwind v4 entry (CSS-first config)
│   └── main.tsx
├── supabase/
│   ├── functions/          # Edge Functions
│   │   ├── simplefin-claim/            # Claim Setup Token → store Access URL
│   │   ├── simplefin-accounts-confirm/ # Import + classify chosen accounts
│   │   ├── simplefin-refresh/          # On-demand balances (30-min throttle)
│   │   ├── simplefin-transactions-list/# Bank activity window (not persisted)
│   │   ├── simplefin-disconnect/
│   │   ├── simplefin-scheduled-refresh/# pg_cron cadence balance sweep
│   │   ├── teller-*/       # Quiesced Teller functions (kept for a v2)
│   │   └── check-invariant/# Ledger check stub (deferred until paid SaaS)
│   └── migrations/         # SQL migrations
├── vite.config.ts
└── tsconfig.json
```

> **Tailwind v4:** there is no `tailwind.config.ts`. Theme tokens and
> `@import "tailwindcss"` live in `src/index.css`. See `.cursor/rules/tailwind-v4.mdc`.

---

## Key Implementation Notes for Cursor

### Ledger check (deferred)
- Family beta relies on derived Unbucketed + RPC-only writes + `tests/db/`.
- Before paid SaaS: optional SQL `check_family_ledger`, operator logging/alerts
  after webhooks; reuse `member_float` — do not duplicate formulas in
  the client. `check-invariant` Edge Function remains a stub until then.

### 4-tap bucket move flow
The primary use case must be frictionless:
1. Buckets tab → tap bucket to move from
2. Enter amount
3. Tap destination bucket
4. Confirm → done

Implemented in `src/features/buckets/BucketsPage.tsx` and
`MoveMoneyDialog.tsx` via the `move_money()` Postgres function.

### Child PIN login
- Admin sets PIN for child member (stored as bcrypt hash in `family_members.pin_hash`)
- Login screen shows all family member avatars
- Child taps their avatar → PIN pad appears → on success, create a scoped Supabase session

### WebAuthn biometric
- After first PIN/password login on a device, prompt to register biometric credential
- Use `navigator.credentials.create()` / `navigator.credentials.get()`
- Store public key credential per member per device
- On subsequent logins, biometric replaces PIN/password entry

### Teller webhook Edge Function (quiesced)
- Verify Teller webhook signature (accept any of the `v1` signatures Teller sends —
  it signs with every non-expired secret; reject timestamps older than 3 min)
- On `transactions.processed`, fetch live balances for affected accounts and update
  `accounts.current_balance` (Unbucketed in the Buckets tab updates on next load / Realtime)
- On `enrollment.disconnected`, mark the enrollment inactive

### Scheduled balance refresh (cadence sweep)
- `simplefin-scheduled-refresh` Edge Function, invoked by pg_cron every 10 min
  (migration 84; pattern established in migration 81 for Teller)
- Claims the stalest-due active connections in bounded batches
  (`claim_stale_simplefin_connections`, `FOR UPDATE SKIP LOCKED` so overlapping
  ticks never double-work), re-pulls balances older than the cadence
  (`SCHEDULED_REFRESH_CADENCE_HOURS`, default 6h), writes
  `current_balance` / `last_synced_at` per account
- Needed because SimpleFIN has no webhooks; the sweep keeps balances fresh, and
  one request covers a whole connection (respecting the ~24 req/day budget)
- Inert until `SCHEDULED_REFRESH_SECRET` + Vault `simplefin_scheduled_refresh_url` /
  `scheduled_refresh_secret` are set (see docs/MAINTENANCE.md)

### Supabase Realtime
- Subscribe to balance and transaction changes scoped to the authenticated member's family
- UI updates instantly when any family member makes a move or a bank sync fires
- **App shell (always on):** `useMemberRemovalWatch` — `DELETE` on the signed-in
  member's own `family_members` row so removed users sign out immediately (one
  narrow channel on the existing session websocket — not a second connection).
- **Per tab:** Buckets (`buckets`, `accounts`, `transactions` INSERT,
  `member_bucket_order`), History (`transactions`), Send / nav helpers
  (`family_members`, `accounts`) — channels mount with the route and tear down on leave.
- Requires tables in the `supabase_realtime` publication and `replica identity full`
  on RLS-protected tables (migrations 00000000000006–07, `family_members` in 24).

**Scaling (paid SaaS):** Supabase bills/constrains **concurrent Realtime
connections** (one per open app session), not channel count on that connection.
Early production fits the free tier; growth means a paid Supabase plan and
monitoring connection peaks — not ripping out Realtime. Before very large scale,
optional consolidation: one app-level channel per family instead of several
per-tab channels (complexity trade-off, not required for launch).

### PWA requirements
- Full `manifest.json` with icons at all required sizes (72, 96, 128, 144, 152, 192, 384, 512px)
- Service worker: network-first for API calls, cache-first for static assets
- Offline fallback page
- Tested installable on iOS and Android
- Install from production: https://bucketmymoney.com (Add to Home Screen on mobile)

---

## First Cursor Session — Scaffold Prompt

Use this to kick off the build:

> I am building a PWA called Bucket My Money. Full context is in the attached `CONTEXT.md`. Please scaffold the complete project using the stack and folder structure defined in that document. Start with:
> 1. Initialize Vite + React + TypeScript
> 2. Install and configure Tailwind CSS
> 3. Install and configure vite-plugin-pwa with manifest.json and service worker
> 4. Set up Supabase client with environment variable placeholders
> 5. Create the folder structure as specified
> 6. Set up React Router with routes for: login, home (buckets), send, history, admin
> 7. Create the initial Supabase migration file with the full database schema and RLS policy stubs
> Do not build any UI yet — just the scaffold, config, and routing skeleton.

---

## Environment Variables Needed

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_ANON_KEY=
VITE_TELLER_APPLICATION_ID=   # quiesced Teller provider (docs/BANK_PROVIDERS.md)
TELLER_SIGNING_SECRET=        # Edge Function only, never exposed to client
```
