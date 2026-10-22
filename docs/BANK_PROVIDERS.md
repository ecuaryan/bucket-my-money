# Bank providers

How Bucket My Money connects to real bank data, and how to add or swap a
provider. Source of truth for provider status; product context lives in
[CONTEXT.md](../CONTEXT.md).

## Status

| Provider | `accounts.source` | Status | Notes |
| --- | --- | --- | --- |
| **SimpleFIN** | `simplefin` | **Active** | The generally-available connector. The account holder subscribes to [SimpleFIN Bridge](https://beta-bridge.simplefin.org) directly ($1.50/mo or $15/yr, paid to SimpleFIN) and pastes a one-time Setup Token into Admin. |
| **Teller** | `teller` | **Quiesced** | Teller withdrew its API product (July 2026). All Teller code, tables, and rows stay; balances are frozen at `last_synced_at`; live actions (link, reconnect, refresh, activity) are hidden. If Teller ships a v2, re-enabling is a small PR. |
| Manual | `manual` | Active | Admin-entered cash/card amounts; not a bank link. |
| **Plaid** | `plaid` | **Active (flag-gated)** | Free-trial-tier connector behind the `plaid` feature flag — owner's household only. The team has **10 LIFETIME production Items**; everything below § Plaid specifics exists to protect them. |

## Architecture: `accounts` is the neutral core

Every provider upserts into the same `accounts` table; the ledger identity
(`member_float()`) never knows which provider a balance came from. Provider
specifics live in three provider-namespaced places:

1. **A credential table** — `teller_enrollments`, `simplefin_connections`,
   `plaid_items`. RLS enabled with **zero policies** and no grants to
   `authenticated`/`anon`: only Edge Functions using the service role can
   touch bearer credentials. `tests/db/simplefin.test.ts` and
   `tests/db/plaid.test.ts` lock this in.
2. **Edge Functions** — `simplefin-*` (claim, accounts-confirm, refresh,
   transactions-list, disconnect, scheduled-refresh) and `plaid-*`
   (link-token, exchange, refresh, transactions-list, disconnect,
   items-list, scheduled-refresh, webhook), sharing pure helpers in
   `supabase/functions/_shared/<provider>.ts`.
3. **A client module** — `src/lib/simplefin.ts` / `src/lib/plaid.ts`
   (mirroring `src/lib/teller.ts`), registered in the dispatch map
   `src/lib/bankProviders.ts`. Components call the dispatch
   (`fetchBankTransactionsFor`, `refreshAllBankBalances`,
   `canFetchBankActivity`) — never a provider client directly.

SQL that means "linked to a bank" says `source <> 'manual'`
(`member_has_linked_account`, breakdown `bank_cash`); TypeScript mirrors it
with `isLinkedAccount()` in `src/lib/accounts.ts`.

## SimpleFIN specifics

- **Protocol:** one endpoint. A Setup Token is base64 of a claim URL; POSTing
  the claim URL once returns an **Access URL** with embedded Basic-auth
  credentials (stored server-side only). All reads are
  `GET {accessUrl}/accounts` with `balances-only=1`, `start-date`/`end-date`
  (unix seconds), `account=<id>`, `pending=1`.
- **No account types.** SimpleFIN doesn't classify accounts, so the connect
  flow has a confirm step where the admin marks each account cash vs card.
  Cash rows store `account_type = 'cash'` (added to `is_cash_account_type`);
  cards store `credit_card`.
- **Sign convention.** SimpleFIN reports liabilities negative; the app stores
  card balances positive-owed. `normalizeBalance()` flips the sign
  (mirrored in `src/lib/simplefinParse.ts` + `_shared/simplefin.ts`).
- **Request budget.** The Bridge asks for ≲24 requests/day per connection
  (a soft budget, not a meter — no per-request charge, but abusive polling
  can get an app blocked, and upstream data only refreshes ~daily). One
  request refreshes a whole connection, so: scheduled sweep at a 6h
  staleness cadence (~4/day) + a 30-minute server throttle on manual refresh
  (vs Teller's 60s) + on-demand Bank activity fetches with a 10-minute
  client-side cache per account.
- **One connection can span several banks** (whatever the user connected on
  the Bridge before minting the token). Admin groups **by connection** — one
  card, one Refresh, one Unlink, titled with the joined bank names
  ("Ally Bank · Robinhood") and each row labelled with its own bank — so the
  UI unit matches the only unit SimpleFIN can unlink. Dropping a single bank
  happens on the Bridge site.
- **No server-side revoke.** Unlink deletes local rows; the user must also
  delete the app's access on the Bridge site (the unlink Sheet says so).
- **Reconnect** = new Setup Token (HTTP 402/403 from SimpleFIN marks the
  connection `disconnected` and stops the sweep from claiming it).

## Plaid specifics

- **Flag-gated end to end.** The client hides Plaid UI behind
  `useFeatureFlag('plaid')`; the Edge Functions re-check via the service role
  (`_shared/plaidFlag.ts`) — the flag is the only thing between other
  households and the 10 lifetime Items.
- **Item budget rules** (the team's trial tier: 10 lifetime production
  Items; a deleted Item never refunds its slot):
  - A **new link** (link token without an `itemId`) is the ONLY action that
    can consume a slot. Admin goes straight into Plaid Link; the
    `PlaidConnectSheet` chooser appears only when detached Items exist, so a
    known bank is re-added for free instead of re-linked.
  - **Abandoned Link sessions still count**: for OAuth institutions the
    connection registers once the bank login completes, even if the user
    exits before the account-confirmation step. Never open Link without
    intending to finish it (learned the hard way — two orphaned trial
    connections).
  - **Unlink detaches locally** (`plaid-disconnect`): accounts rows go, the
    `plaid_items` row and access token stay (`status='detached'`).
    `/item/remove` is never called.
  - **Re-add a detached bank** = `plaid-exchange { itemId }` — re-imports
    accounts straight from the retained token, no Link session at all.
  - **Reconnect** (`ITEM_LOGIN_REQUIRED` → `status='reconnect_required'`) =
    Link **update mode** (`plaid-link-token { itemId }`) — free.
  - **Never call `/transactions/refresh`** — the only per-call-billed
    transactions endpoint on paid plans. Activity uses `/transactions/get`.
- **Auto-classified accounts**: Plaid types map onto the app vocabulary
  (`mapPlaidAccountType` — depository→cash subtypes, credit→`credit_card`;
  loans/investments keep a raw subtype and stay out of the cash pool), so
  there is no manual confirm step. Card balances arrive positive-owed —
  no sign flip (unlike SimpleFIN).
- **Webhooks (free — delivery infrastructure, not a billed product):**
  `plaid-webhook` verifies every request via the `Plaid-Verification`
  ES256 JWT + body hash, logs it to `plaid_events` (service-role-only
  audit table), then acts: transaction events re-pull the Item's balances
  immediately (freshness between sweep ticks); login-shaped Item errors
  and pending expirations flip `reconnect_required` proactively. New
  Items get the receiver URL via their link token; pre-existing Items are
  configured self-healingly by the sweep (`/item/webhook/update`,
  stamped in `plaid_items.webhook_configured_at`). The 6h sweep remains
  the quiet-period safety net.
- **Transaction details** (Bank tab → tap a transaction): `plaid-transactions-list`
  returns, besides label/date/amount, a `details` object built by
  `_shared/plaidTransactionDetails.ts` — the bank's raw statement text
  (`include_original_description`), category (`personal_finance_category`),
  counterparty, payment channel, location, authorized vs posted date, check
  number, reference/payee/payer/method/reason, non-USD currency. Only fields the
  bank actually returned are included, nothing is persisted, and rows with
  nothing extra aren't expandable. SimpleFIN rows carry no `details` yet.
- **Pending card payments**: after every balance refresh (on-demand,
  sweep, webhook) `_shared/plaidPendingSync.ts` pulls one
  `/transactions/get` per Item and nets payments already in flight against
  card debt (`accounts.pending_payment_credit`, `plaid_account_signals`).
  Conservative by design — see [CREDIT_CARDS.md § Pending
  payments](./CREDIT_CARDS.md#pending-payments-plaid). Optional secret
  `PLAID_PENDING_NETTING` = `strict` (default) / `standard` / `off`.
- **Env**: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`
  (`sandbox`/`production`), optionally `PLAID_PENDING_NETTING`, and optionally `PLAID_WEBHOOK_URL` (the
  deployed `plaid-webhook` function URL — webhooks are off until set) as
  Edge Function secrets. All development uses sandbox (fake banks, no
  Item cost).

## Scheduled refresh (all providers)

pg_cron job `scheduled-balance-refresh` (every 10 min) →
`trigger_scheduled_balance_refresh()` → `net.http_post` to every configured
provider sweep (Vault: `simplefin_scheduled_refresh_url`,
`plaid_scheduled_refresh_url`), authenticated by `X-Cron-Secret`. Each sweep
claims the stalest due connections via a service-role-only claim RPC
(`claim_stale_simplefin_connections`, `claim_stale_plaid_items`) so
overlapping ticks stay disjoint.
Setup (Vault secrets, cadence env) lives in
[MAINTENANCE.md § Scheduled balance refresh](./MAINTENANCE.md#scheduled-balance-refresh-production).
The Teller sweep is no longer posted to (quiesced); its function and claim RPC
remain for a possible revival.

## Adding a provider

1. Migration: widen nothing (source check already covers planned providers) or
   add the new source value; add a credential table (RLS on, zero policies,
   **plus an explicit `grant select, insert, update, delete … to service_role`**
   — the hosted project does NOT auto-grant on raw-SQL tables, local Docker
   does, so a missing grant only fails in prod; see migrations 4 and 86)
   and `accounts.<provider>_account_id` / `<provider>_connection_id` columns;
   add a `claim_stale_<provider>_*` RPC and wire it into the sweep trigger.
2. Edge Functions namespaced `<provider>-*`, sharing `_shared/<provider>.ts`.
3. Client module `src/lib/<provider>.ts` + register in `bankProviders.ts`.
4. Tests: `tests/db/<provider>.test.ts` (credential-table lockdown, claim RPC
   gating, predicate coverage) + colocated parse unit tests.
5. Update this file, CONTEXT.md, and MAINTENANCE.md.
