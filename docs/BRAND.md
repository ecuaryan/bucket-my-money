# Brand and voice

Working notes for product name and user-facing copy. Code imports strings from
[`src/lib/brand.ts`](../src/lib/brand.ts).

## What we’re selling

Not “every dollar lives in a bucket.” Cash sits in **Unbucketed** (the running
balance not yet in a bucket) until you label it; buckets are how you **organize**
the money you already have — label and reserve it for an at-a-glance view that
helps you make day-to-day decisions.

The payoff:

- **Accountability after the bank moves** — Teller updates cash; buckets stay
  until you move money. You pick which bucket covers it.
- **Intentional friction** — minimal automation by design. When you overspend,
  you come in and consciously move money from a bucket back into Unbucketed;
  confronting the trade-off is the value, not a chore to automate away. The
  at-a-glance view surfaces reality so you *decide*; it does not auto-fix.
- **Tradeoffs** — negative Unbucketed means labels don't match your cash minus
  card balances yet — not that income “came from” somewhere new.
- **Organizing, not prescribing** — copy states what Unbucketed and buckets *are* and
  what the numbers mean. Avoid telling people *when* or *why* they should move money
  (no “before the charge clears”, “your bank already took this”, etc.). Factual
  hints (balances, limits) are fine; workflow coaching belongs in optional surfaces
  like onboarding, not every move sheet.
- **Works alone or together** — one person with buckets, or a household sharing
  Unbucketed and optional member PINs.

**Canonical tagline (`APP_TAGLINE`):** *Balance moved? Pick which bucket covers it.*
(“Balance,” not “bank balance” — a card swipe moves the number too.)

## Product narrative

*Canonical product story — reference for marketing, agents, and copy decisions.
Distill for UI; do not paste wholesale into the app.*

Your bank balance is lying to you.

Not intentionally — but when you glance at your account and see $4,000 sitting there, it feels like you have $4,000. You don't. You have rent due Friday, a car insurance payment auto-drafting next week, and a grocery run that needs to happen before the weekend. That $4,000 is already spoken for — you just can't see it yet.

That gap between what your bank shows and what you actually have is where bad spending decisions live.

Bucket My Money closes that gap. It gives your money jobs before you spend it, so you always know the honest answer to the only question that matters in the moment: can I actually afford this?

### How it works

Your money lives in two places: Unbucketed and your buckets.

Unbucketed is the center of gravity. Every paycheck lands there. Every bill, every credit card charge, every automatic payment pulls from there. It's your running balance — the number that tells you the truth about where you stand.

Buckets are money you've deliberately set aside from Unbucketed for a specific purpose. Vacation. Emergency fund. Car maintenance. Christmas. Whatever matters to your life. You decide the buckets, you decide how much goes in each one. Once money is in a bucket, it has a job — it's no longer part of Unbucketed.

### The one rule

When you spend money, decide which bucket covers it — then move that amount back to Unbucketed.

That's it. That single habit is what makes the system work. You swiped your card at the gas station — open the app, move money from your Gasoline bucket back to Unbucketed. Now Unbucketed reflects reality.

Credit cards are part of the same truth. A linked card's balance counts against Unbucketed — money you owe was never really yours to bucket. So a card swipe shows up on its own as the balance syncs, and the habit is the same one: pick the bucket that covers it. When you pay the statement, cash and card debt fall together and Unbucketed doesn't move — you already accounted for that spending when it happened.

If Unbucketed is green, you're living within your means. If it's red, your buckets and card balances add up to more than your cash supports — and you have a decision to make. Which bucket are you pulling from to get back to zero? That's the honest conversation the app forces you to have with yourself.

### What this isn't

Bucket My Money is not a transaction tracker. It won't categorize your Starbucks runs or generate a pie chart of your spending habits. There are plenty of apps that do that, and most people abandon them within a month because they're exhausting to maintain.

This is simpler. It's a clarity tool. It tells you where your money is, so you can make deliberate decisions instead of hopeful ones. The discipline it requires is minimal by design — one small action when you spend, and Unbucketed stays honest.

If you're the kind of person who has ever looked at their bank account two days after a purchase and thought "I didn't realize I had that little" — this app is for you.

## Voice

- Plain, direct, no finance jargon.
- **Do not name Teller** (or other vendors) in user-facing UI — say read-only
  bank connection. For balance freshness say **refresh** (e.g. "Balances refreshed
  5m ago", Refresh button); reserve **read** for the safety assurance
  (`BANK_READ_ONLY_ASSURANCE`: we read balances—we can't transfer, send, or
  withdraw money). Teller stays accurate in this doc and § Bank link for
  implementers.
- Emphasize **which bucket covers a bank move**, not “families only” or income tracing.
- Say **household** in UI when meaning “your group”; **family** is fine in
  internal/schema terms (`family_id`, routes like `/login/family`).
- Say **join code** everywhere users link a device (not “device code”).
- Say **money source** for anything that funds the household pool: a linked bank
  or a manual amount the admin enters (estimate, real balance, or try-it-out
  number). Prefer “Add a money source” over “link a bank” when both paths apply.
  Credit cards are listed alongside money sources in Admin but are always
  described as counting **against** the household balance — never as funding it.
- DB role `member` → UI **Shared**; `child` → **Kid**; `admin` → **Admin**.
  See `src/lib/memberRoles.ts` and Admin strings in `brand.ts`.
- **Household balance** (`HOUSEHOLD_BALANCE_LABEL` in `brand.ts`) is the
  collective money pool the admin + Shared role co-own (the `member` role is
  still UI **Shared**—that’s the person; the pool they share is the **Household
  balance**). Say “household balance”—not “shared balance,” “adults,” or
  “partners”—in **adult/Shared-facing** copy about who shares household buckets
  and Unbucketed. Keep it out of **kid-facing** copy (see below); it’s a pool
  concept a kid doesn’t need.
- Say **household admin** (not “your admin”) when a non-admin needs the person
  who manages Admin. Use **Unbucketed** (`FLOAT_LABEL` in `brand.ts`)
  in the Buckets tab, Move money, History, and related Give copy; **Household
  balance** in Admin assignment dropdowns (`HOUSEHOLD_BALANCE_LABEL`, not “pool”
  in user copy). Matches SQL/RPC: `float`, `member_float()`, etc.
- Kid-facing copy: keep it plain and concrete. Describe money arriving as
  “when someone gives you money” (the Give flow on the Kids tab), and name the
  **household admin** (their name when known)—not “shared balance,” “parent,”
  or “adults,” unless you mean a specific person.
- **Toasts:** ephemeral success/error feedback uses the global toast, fixed below
  the top safe area on every screen (same position signed-in and auth). Keep copy
  short for auto-dismiss (7s); longer text stays in sheets or requires manual
  dismiss. Errors always need manual dismiss. Form field validation stays inline.
  No toast call sites on login flows today — inline banners only.
- **Confirmations:** use the shared `Sheet` for **consequential** actions only—
  money moves, access loss, irreversible structural changes with real impact.
  Skip confirm for low-impact, easily reversible flows (e.g. deleting an empty bucket).
  Never `window.confirm` (unreliable in embedded browsers). Copy in `brand.ts`;
  match member-removal patterns (intro, bullets, Cancel + action).
- **Bank refresh vs buckets:** linked-account balance updates change **Unbucketed only**
  — bucket amounts stay put until someone **moves money** or an **Auto-bucket** run
  fires (admin-configured for the household, kid-configured for a kid's own scope;
  see [AUTO_ORGANIZE.md](./AUTO_ORGANIZE.md)). In-app copy must not
  imply the app moves money at the bank; say *refresh*, *update*, or *when your
  bank balance changes* for Unbucketed. Info sheet bullets stay short (three max for
  adults). Do not say *sync* for bank balances — use **refresh** (see above).
- **Set aside (manual):** moving Unbucketed → bucket may make Unbucketed **negative**.
  **Bucket → anything** still cannot exceed the bucket balance. Applies to all roles;
  **`give_money`** keeps the insufficient-`float` guard. When a manual **Set aside**
  (or a **Run now**) would cross Unbucketed from **≥ 0 to negative**, confirm with a
  consequential `Sheet` first; skip confirm if Unbucketed is already red; automatic
  Auto-bucket runs skip confirm.
- **Auto-bucket:** feature name **Auto-bucket** — subtitle *Organize your money
  into buckets on the days you choose.* Guardrail: *You choose when and how much —
  money moves into buckets automatically.* Not “scheduled set-aside,” “organize Unbucketed,” or
  “automation.” Header **Auto-bucket**; section CTA **Add**; History
  **Scheduled**. Manual dialog keeps **Set aside** (production). Constants:
  `AUTO_ORGANIZE_*`, `HISTORY_SCHEDULED_MOVE_LABEL` in `brand.ts`. Schema:
  `auto_organizes`, `auto_organize_*` (see [AUTO_ORGANIZE.md](./AUTO_ORGANIZE.md)).
  UI says **Auto-bucket**; schema keeps `auto_organize*`.
  User-configured automatic organization ≠ auto-rebalance when the bank moves.

## Display name

**Product:** `Bucket My Money` (`APP_NAME` in `brand.ts`).

**Domain:** [bucketmymoney.com](https://bucketmymoney.com) — production frontend on Vercel.
Supabase Auth Site URL and Teller allowed origins use the same origin.

**Repo / package:** [`bucket-my-money`](https://github.com/ecuaryan/bucket-my-money) on GitHub; npm package name `bucket-my-money`.

**PWA short name:** `Buckets` (`APP_SHORT_NAME`) — home-screen label; matches the Buckets tab and stays short on Android.

**Internal storage keys:** `bucketmymoney_*` and `bucketmymoney:` prefixes
(legacy `bucketfund_*` keys migrate on first load via `localStorageMigrate.ts`).

## Bank link (read-only — must stay accurate)

Bucket My Money uses [Teller](https://teller.io) with Connect products **`balance`**
and **`transactions`** only. Our server calls Teller **GET** endpoints for
accounts and balances; webhooks refresh balances when activity posts, and a
scheduled read-only sweep re-pulls balances on a cadence so they stay current in
quiet periods. We do **not** use Teller payment initiation or any API that moves
money at the bank.

**`give_money` and `move_money` are virtual** — labels inside the app only.

User-facing reassurance: `BANK_READ_ONLY_ASSURANCE`, `SIMPLEFIN_CONNECT_SHEET_INTRO`
(shown when linking), `BUCKETS_LINK_BANK_*` in `brand.ts` — read-only;
we read balances and cannot transfer, send, or withdraw money at the bank.
Balance freshness comes from webhooks, a scheduled read-only cadence sweep, and
the on-demand **Refresh** button — all read-only balance pulls, never money movement.
Do not promise “we never see transactions” if we later fetch transaction history;
today we mainly use the transactions product for balance sync webhooks.

Link copy: **one or more accounts**; **cash account types** count toward
Unbucketed and **credit-card accounts count against it** (see
`src/lib/accountTypes.ts`) — do not limit UI to “checking or savings” only.

## Ubiquitous language: Unbucketed

**UI** says **Unbucketed** (`FLOAT_LABEL` in `brand.ts`). **Code, SQL, and
RPCs** keep `float` (`float` JSON key,
`member_float()`, `float_balance_*` columns). A `NULL` bucket id
in `move_money` means the Unbucketed pool.

## Copy map (auth & admin)

| Surface | String source |
|---------|----------------|
| Login tagline | `LOGIN_TAGLINE_LEAD` + `LOGIN_TAGLINE_PAYOFF` (pre-setup); `APP_TAGLINE` elsewhere |
| Returning sign-in divider | `LOGIN_ALREADY_HAVE_ACCOUNT` |
| Sign-up | `LOGIN_SIGNUP_*`, `LOGIN_HOUSEHOLD_*` |
| PIN path | `LOGIN_SHARED_*` |
| Bank read-only note | `BANK_READ_ONLY_ASSURANCE` in Admin (`ADMIN_LINKED_ACCOUNTS_*`, link-bank confirm) |
| Join code (Admin + PIN) | `JOIN_CODE_*`, `ADMIN_JOIN_CODE_*` |
| Admin people & roles | `ADMIN_HOUSEHOLD_MEMBERS_*`, `memberRoles.ts` |
| Admin linked accounts | `ADMIN_LINKED_ACCOUNTS_*` |
| Assign linked account to kid | `adminAssignAccountToKidSheetTitle()`, `ADMIN_ASSIGN_ACCOUNT_TO_KID_*` |
| Admin link-bank warning | `ADMIN_LINK_BANK_CONFIRM_*` |
| Admin unlink bank | `adminUnlinkInstitutionSheetTitle()`, `ADMIN_UNLINK_INSTITUTION_CONFIRM` |
| Admin remove manual source | `adminRemoveManualSourceSheetTitle()`, `ADMIN_REMOVE_MANUAL_SOURCE_*` |
| Buckets delete bucket | `bucketsDeleteBucketSheetTitle()`, `BUCKETS_DELETE_BUCKET_*` |
| Buckets duplicate name | `BUCKETS_NAME_DUPLICATE` |
| Toast dismiss | `TOAST_DISMISS_LABEL` |
| History note saved | `HISTORY_NOTE_SAVED` |
| Manual source saved | `manualSourceAddedSuccess()`, `manualSourceUpdatedSuccess()` |
| Member actions | `adminMemberAddedSuccess()`, `adminPinSaveSuccess()`, … |
| Admin email & password reset | `ADMIN_ACCOUNT_*` |
| Household admin (hints) | `householdAdminLabel()`, `HOUSEHOLD_ADMIN_PHRASE` fallback |
| Buckets tab: no linked accounts | `bucketsLinkBankMemberBody()` |
| Buckets tab: member empty buckets | `bucketsMemberNoBucketsHint()` |
| Buckets tab: kid Unbucketed hint | `bucketsKidFloatHint()` |
| Unbucketed label (all UI) | `FLOAT_LABEL`, `FLOAT_LABEL_LOWER` |
| Unbucketed over-bucketed hint | `floatOverbucketedHint()`, `FLOAT_NEGATIVE_HINT` |
| Unbucketed short-with-cards hint | `floatShortWithCardsHint()` |
| Unbucketed hero subtitle | `FLOAT_HERO_SUBTITLE`, `FLOAT_HERO_SUBTITLE_WITH_CARDS` |
| Hero cards subtext clause | `floatCardsSubtextClause()` |
| Credit-card surfaces (Admin/Bank) | `ACCOUNT_CARD_OWED_SUFFIX`, `BREAKDOWN_CARD_DEBT_LABEL` |
| Card linked notice | `LINKED_CARDS_NOTICE_*`, `linkedCardsNoticeBody()` |
| Manual credit card forms | `MANUAL_CARD_*`, `ADMIN_ADD_SOURCE_CARD_OPTION` |
| Onboarding coach | `ONBOARDING_COACH_*`, `onboardingCoachStepBody()` |
| Move money intents | `moveMoneyDialogCopy.ts` |
| Product narrative (full text) | [Product narrative](#product-narrative) in this doc |
| History gives/takes filter | `HISTORY_FILTER_GIVES_AND_TAKES` |
| History empty state | `HISTORY_EMPTY_*` |
| PIN sign-in: empty roster | `pinNoMembersYet()` |
| Admin gate (non-admin) | `adminLinkedAccountsMemberGate()` |
| Orphan PIN session | `ORPHAN_MEMBER_MESSAGE` in `pinAuth.ts` (generic fallback) |
| Static HTML | `HTML_META_DESCRIPTION`, `OFFLINE_PAGE_BODY` (sync index + offline manually) |
| PIN join screen | `PIN_JOIN_PAGE_*`, `JOIN_CODE_LABEL` |
