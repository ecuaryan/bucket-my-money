# Brand and voice

Working notes for product name and user-facing copy. Strings live in
[`src/lib/brand/`](../src/lib/brand/), one file per feature; code imports them from
the [`src/lib/brand.ts`](../src/lib/brand.ts) barrel (`@/lib/brand`).

## What we’re selling

Not “every dollar lives in a bucket.” Cash sits in **Unbucketed** (the running
balance not yet in a bucket) until you label it; buckets are how you **organize**
the money you already have — label and reserve it for an at-a-glance view that
helps you make day-to-day decisions.

The payoff:

- **Accountability after the bank moves** — the bank updates cash; buckets stay
  until you move money. You pick which bucket covers it.
- **Intentional friction** — minimal automation by design. When you overspend,
  you come in and consciously move money from a bucket back into Unbucketed;
  confronting the trade-off is the value, not a chore to automate away. The
  at-a-glance view surfaces reality so you *decide*; it does not auto-fix.
- **Tradeoffs** — negative Unbucketed means labels don't match your cash minus
  card balances yet — not that income “came from” somewhere new.
- **Organizing, not prescribing** — copy states what Unbucketed and buckets *are* and
  what the numbers mean. Avoid telling people *when* or *why* they should move money
  (no “before the charge clears”, “your bank already took this”, etc.).
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

- **No subtitles, intros, or helper text.** If a screen needs a sentence to make
  sense, fix the layout instead: a clearer label, a live value or preview (e.g.
  Auto-bucket's per-bucket *Adds $40*), a disabled option, an icon (a linked kid's
  bank icon). Allowed:
  - field labels and section titles;
  - an empty state: one line plus its action;
  - a confirmation's one or two consequence sentences;
  - facts that keep a number honest (card-payment lag, pending payment,
    read-only bank access at connect, frozen Teller balances).
- Plain, direct, no finance jargon.
- **Do not name Teller** (or other vendors) in user-facing UI except where the
  user must act in that vendor (SimpleFIN Bridge setup). Say **refresh** for
  balance freshness (never *sync*); reserve **read** for the read-only assurance.
- Emphasize **which bucket covers a bank move**, not “families only” or income tracing.
- **household** in UI for “your group”; **family** only internally (`family_id`,
  `/login/family`). **join code** everywhere a device links (not “device code”).
- **money source** = anything funding the household: a linked bank or a manual
  amount. Prefer “Add a money source” over “link a bank” when both apply. Credit
  cards always count **against** the household balance — never as funding it.
- Roles: DB `member` → **Shared**, `child` → **Kid**, `admin` → **Admin**
  (`src/lib/memberRoles.ts`). **Household balance** is what admin + Shared co-own
  (not “shared balance,” “adults,” “partners,” or “pool”); keep it out of
  kid-facing copy. Say **household admin** (their name when known), not “your admin.”
- **Unbucketed** (`FLOAT_LABEL`) in Buckets, Move money, History, and Give copy.
- Kid-facing copy: plain and concrete — money arrives “when someone gives you
  money”; name the household admin, not “parent” or “adults.”
- **Toasts** (`toast` from `@/lib/toast`) for feedback far from focus: short copy
  auto-dismisses after 7s; errors and long copy need manual dismiss. Form
  validation stays inline. Login flows use inline banners, not toasts.
- **Sheets:** form and content sheets use `SheetHeader` (title + × close).
  **Consequential** actions (money, access, hard-to-undo structure) confirm with
  `ConfirmSheet`: the title names the action (“Delete Groceries?”), one or two
  sentences give the real effect (“$120 returns to Unbucketed.”), then Cancel and
  the action — no ×, no bullet lists. Skip confirms for low-impact reversible
  actions (deleting an empty bucket). Never `window.confirm`.
- **Bank refresh vs buckets:** a balance refresh changes **Unbucketed only**;
  buckets move only when someone moves money or an Auto-bucket rule runs. Never
  imply the app moves money at the bank.
- **Set aside:** Unbucketed → bucket may make Unbucketed negative; bucket →
  anything cannot exceed the bucket balance; `give_money` keeps its
  insufficient-`float` guard. Confirm (consequential sheet) when a manual Set aside
  or Run now would take Unbucketed from ≥ 0 to negative; skip when already red;
  automatic runs never confirm.
- **Auto-bucket:** the feature name (schema keeps `auto_organize*`; see
  [AUTO_ORGANIZE.md](./AUTO_ORGANIZE.md)). Not “scheduled set-aside,” “organize
  Unbucketed,” or “automation.” User-configured, never an auto-rebalance when the
  bank moves. The manual move dialog keeps **Set aside**.

## Display name

**Product:** `Bucket My Money` (`APP_NAME` in `brand.ts`).

**Domain:** [bucketmymoney.com](https://bucketmymoney.com) — production frontend on Vercel.
Supabase Auth Site URL and Teller allowed origins use the same origin.

**Repo / package:** [`bucket-my-money`](https://github.com/ecuaryan/bucket-my-money) on GitHub; npm package name `bucket-my-money`.

**PWA short name:** `Buckets` (`APP_SHORT_NAME`) — home-screen label; matches the Buckets tab and stays short on Android.

**Internal storage keys:** `bucketmymoney_*` and `bucketmymoney:` prefixes
(legacy `bucketfund_*` keys migrate on first load via `localStorageMigrate.ts`).

## Bank link (read-only — must stay accurate)

Every connector is read-only: we pull balances (and, where offered, transactions)
and never call an API that moves money at the bank. SimpleFIN is the active
connector, Plaid is flag-gated, Teller is quiesced — details in
[BANK_PROVIDERS.md](./BANK_PROVIDERS.md). `give_money` and `move_money` are virtual
(labels inside the app only). The read-only assurance shows when linking
(`SIMPLEFIN_CONNECT_SHEET_INTRO`). Link copy says **one or more accounts**; cash
accounts count toward Unbucketed and credit cards against it
(`src/lib/accountTypes.ts`).

## Ubiquitous language: Unbucketed

**UI** says **Unbucketed** (`FLOAT_LABEL` in `brand.ts`). **Code, SQL, and
RPCs** keep `float` (`float` JSON key,
`member_float()`, `float_balance_*` columns). A `NULL` bucket id
in `move_money` means the Unbucketed pool.

## Where strings live

`src/lib/brand/` holds every user-facing string, one file per feature; import
them from `@/lib/brand`. Feature files import only `core`.

| File | Covers |
|------|--------|
| `core.ts` | App name/tagline, `FLOAT_LABEL`, nav, header, toasts, hide amounts, static HTML (`HTML_META_DESCRIPTION`, `OFFLINE_PAGE_BODY` — sync `index.html` and `public/offline.html` by hand) |
| `auth.ts` | Email login, join code, PIN sign-in |
| `admin.ts` | Members, roles, PINs, money sources, kid account assignment, Settings account |
| `kids.ts` | Kids tab, Give and Take |
| `buckets.ts` | Unbucketed hero, buckets, groups, onboarding coach, empty states |
| `autoBucket.ts` | Auto-bucket rules, editor, Run now |
| `bank.ts` | SimpleFIN, Plaid, Teller, bank activity, refresh |
| `history.ts` | History filters, notes, empty states |

Move-money intents live in `moveMoneyDialogCopy.ts`; the full product story is
[above](#product-narrative).
