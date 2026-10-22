# Credit cards as liabilities — design

**Status: shipped** (migration `79`; stages 1–3 landed together in one PR,
docs in the same PR). Remaining follow-up: refresh PWA screenshots + demo
GIF (hero copy changed).

**Sign convention: verified.** Per Teller, an outstanding credit card
balance comes back as a **positive** number in the ledger balance —
matching the code's assumption (positive = owed; we store `balance.ledger`
raw and subtract). Note: sandbox credit-card fixtures always report a
$0.00 balance, so exercising the subtraction in dev means a manual card —
same code paths, `is_credit_card_account_type` ignores `source`.

## Why

The app's promise is "log in and see where your daily money really is."
For a household that spends on a credit card, cash alone overstates that:
$3,000 in checking with $1,200 on the card is $1,800 of daily money. The
hero number must bake the liability in or it means less.

## The model

One equation, invariant preserved:

```
cash − credit card balances = bucket allocations + Unbucketed
```

- **Card spending behaves like debit spending.** A swipe raises card debt →
  Unbucketed dips → the user covers it from a bucket. Same discipline,
  same red-signal semantics as today.
- **Paying the statement is net zero.** Cash drops, debt drops equally —
  Unbucketed doesn't move, because the spending was covered when it happened.
- **Red Unbucketed keeps its one meaning:** spending (cash or card) not yet
  covered by a bucket. No second alarm (see AGENTS.md ledger bullet).
- **Truth over comfort.** Linking a card with existing debt drops Unbucketed
  by that amount immediately — possibly deep red. That is the point. One
  consequential confirm sheet at link time (existing app convention), then
  no further ceremony. No special "carried debt" machinery; a user who wants
  to pay debt down over time creates an ordinary payoff bucket.

## Decided scope (2026-07)

| Decision | Choice |
| -------- | ------ |
| Liability types | **Credit cards only** (`credit_card` type/subtype). Loans, mortgages, lines of credit stay excluded — not daily-money vehicles. |
| Manual cards | **In v1.** Households at banks Teller doesn't support can add a self-reported card balance, mirroring manual money sources. |
| On-link moment | **One confirm sheet, then truth.** Sheet states the card's balance and that Unbucketed drops by it immediately. |
| Kids | **Household only.** Cards cannot be assigned to a kid; the assign-to-kid flow excludes card accounts. Kid balance math is untouched. |
| Which balance | Teller's current/ledger balance as reported ("we're subject to what Teller reports"). Sign conventions verified against real payloads in stage 1. |

## Mechanics by layer

### Schema / SQL

- New `public.is_credit_card_account_type(text)` beside
  `is_cash_account_type` (client mirror in `src/lib/accounts.ts` and
  `supabase/functions/_shared/cashAccountTypes.ts`).
- `member_float()` (adult branch) subtracts the family's card balances;
  child branches unchanged (kids can't hold cards).
- Balance-breakdown function (migration `67` lineage) gains a
  `card_debt` field so the hero breakdown can render the subtract line.
- Manual cards: extend `add_manual_account` / `update_manual_account`
  (migration `31`) with a card kind — stored in `accounts` with
  `source = 'manual'`, `account_type = 'credit_card'`.
- Store card balances with a normalized sign (debt is positive in
  `current_balance`; the subtraction happens in the ledger functions) so
  one convention holds for Teller and manual rows.

### Edge Functions

- `teller-enroll`: keep persisting card accounts (already happens);
  return enough data for the on-link confirm sheet.
- `teller-refresh` / `teller-webhook`: stop skipping non-cash accounts
  **for cards** — card balances must stay current or the equation lies.
  Other non-cash types remain skipped.

### Client

- `availableBalance.ts`: subtract card balances next to `sumCashBalance`.
- `floatBreakdown.ts`: new `kind: 'subtract'` line — the structure
  already supports it (see "Allocated to buckets" / "Set aside for kids").
- FloatHero: number is net automatically once `member_float` changes;
  subtext gains card context (see Copy).
- Admin: card rows get a "counts against your balance" note; the
  assign-to-kid select excludes cards; manual-card add/edit forms.
- Bank tab: card section with current balance and activity.
- Move/give dialogs, Auto-bucket: **no mechanical changes** — they read
  Unbucketed via the same functions and already tolerate negative values
  with the existing confirm sheet.

### Explicitly unchanged

`move_money` / `give_money` guards, bucket rules, kid balance math,
History snapshots (they record Unbucketed, which is simply net now).

## Edge cases

- **Interest and fees** raise debt with no purchase — Unbucketed dips and
  the hint copy must say card balances count against it, so the dip is
  explainable. It is just more spending to cover.
- **Partial linking** (card linked, paying checking account not linked, or
  vice versa): payment netting breaks and the number skews. v1 answer:
  document it and note it in the linked-accounts intro copy; no blocking.
  We show the truth across what's linked.
- **Refunds/credits** can produce a negative card balance (bank owes you);
  that adds to Unbucketed under the same equation — correct, no special case
  for linked cards. **Manual cards clamp at $0** (the RPC rejects negative
  amounts and the form can't enter them) — enter 0 if the bank owes you;
  simplicity over a rarely-used negative-entry UI.

## Pending payments (Plaid)

**The problem.** Cash and card balances come from independent feeds. When you
pay a card from checking, the bank may already have taken the money out (a
pending debit) while the card still reports the old balance until the payment
posts — usually 1–3 business days. For that window the payment is subtracted
twice: Unbucketed dips, sometimes red.

**What we can and can't see.** Every bank/issuer pair behaves differently
(some banks fold pending debits into the balance, some don't; some issuers show
a pending payment on the card, some only once it posts), and we can't test
against banks we don't have. So the fix uses only signals Plaid provides for
every bank, and it **does nothing whenever the evidence is ambiguous** — the
result is then the same temporary dip as before, never a new wrong number.

**How it works** (`supabase/functions/_shared/pendingCardPayments.ts`, synced
by `plaidPendingSync.ts` after every Plaid balance refresh):

1. Per Item we pull ~10 days of transactions once (`/transactions/get`, covered
   by the Transactions subscription; never `/transactions/refresh`) and store
   the signals per account in `plaid_account_signals` (service-role only):
   pending card-payment debits on cash accounts (Plaid category
   `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`), pending/posted credits on cards, and
   each cash account's `current` vs `available`.
2. Per family we combine all signals (checking and card can be on different
   Items) and decide, per card, how much of its debt an in-flight payment
   already covers → `accounts.pending_payment_credit`.
3. The ledger functions subtract `card_effective_debt(balance, pending)` —
   `member_float`, and the breakdown's `card_debt` (plus `card_pending_payments`
   for the hero subtext). `0` = the original math exactly.

**When a payment is netted** — all must hold:

- the cash account's balance already includes its pending debits (its
  `available` equals `current` while a debit is pending; if `available` is
  lower by the pending amount, `current` leaves it out, so there's no overlap);
- a pending card-payment debit exists on it;
- **strict (default):** the card also shows a pending credit of the same amount
  (both sides agree the payment is in flight), and exactly one card matches;
- **standard:** a cash-side-only payment is also netted if exactly one card can
  be the target (exact-debt match preferred). Optimistic if the bank's balance
  turns out not to include the pending debit — opt in with the Edge Function
  secret `PLAID_PENDING_NETTING=standard`.
- not if the card already posted a matching credit, never more than the card
  owes, and signals older than 12h are ignored (a failed sync can't leave a
  stuck adjustment). `PLAID_PENDING_NETTING=off` is the kill switch (resets
  every credit to 0 on the next refresh).

**Limits to be honest about.** Plaid's transaction data lags its live balance
(transactions arrive when Plaid next pulls from the bank; balances are fetched
live), so right after you pay the dip can show for a while before the pending
debit appears in the data. Banks that report neither a usable `available` nor
a pending payment get no adjustment. SimpleFIN and manual cards are never
adjusted. The Bank tab and the hero subtext say when a payment is being
counted as paid.

## Staged plan (shipped as one PR)

1. **Sync + classification.** `is_credit_card_account_type` (SQL + TS +
   Deno mirror), card refresh in `teller-refresh`/webhook, sign
   normalization verified against real Teller payloads. No user-visible
   change.
2. **The equation.** `member_float()` + breakdown `card_debt` + client
   subtraction + hero/breakdown/hint copy + on-link confirm sheet.
   `tests/db` extended (see below). This is the PR where the green number
   changes meaning.
3. **Manual cards.** RPC extension + Admin forms + copy.
4. **Docs + assets.** Narrative updates across docs (inventory below),
   PWA screenshots + demo GIF (hero changed).

Test plan (stage 2): `tests/db/` cases for float-with-card-debt, payment
netting (cash −X, debt −X → float unchanged), card-only family, negative
card balance, kid exclusion; unit tests for `availableBalance`,
`floatBreakdown`, and the new copy helpers.

## Copy inventory (`src/lib/brand.ts`)

| Surface | Constant | Change |
| ------- | -------- | ------ |
| Hero subtitle | `FLOAT_HERO_SUBTITLE` ("Left over after buckets") | Reword to include cards, e.g. "Left over after buckets and cards" |
| Negative hint | `FLOAT_NEGATIVE_HINT` ("You've bucketed more than you have.") | Reword — red now also means uncovered card spending |
| Breakdown line | new `BREAKDOWN_CARD_DEBT_LABEL` | "Credit cards" subtract line |
| On-link confirm | new `LINK_CARD_CONFIRM_TITLE` / `_BODY` | States balance and immediate Unbucketed drop |
| Admin card rows | new card note string; `ADMIN_LINKED_ACCOUNTS_INTRO` | Add one clause: card balances count against the household balance |
| Manual cards | new `ADMIN_MANUAL_CARD_*` strings | Add/edit/delete forms and hints |
| Bank tab | new card section label | — |

`BANK_READ_ONLY_ASSURANCE` is unchanged — read-only applies to cards too.

## Documentation inventory (stage 4)

- **CONTEXT.md** — replace the credit-cards TODO with the decision;
  rewrite the balance-model/invariant sections to the new equation;
  update Data Integrity and the architecture notes.
- **docs/BRAND.md** — the word-for-word product narrative gains the
  liability clause; copy map gains the new constants.
- **AGENTS.md** — "The ledger identity is the contract" bullet gets the
  new equation; the red-Unbucketed signal description updated.
- **README.md** — pitch line ("reconciles to the real bank balance")
  and implementation status.
- **docs/MAINTENANCE.md** — drop the credit-cards bullet from Deferred;
  refresh screenshots/GIF (hero changes).
- **This doc** — update Status as stages ship.
