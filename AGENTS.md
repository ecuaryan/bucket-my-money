# AGENTS.md

Entry point for AI coding agents (and humans) working in this repo.

## Read before starting

1. **[CONTRIBUTING.md](./CONTRIBUTING.md)** — branch/PR workflow, CI check names,
   Vercel gating, **production deploy sequence** (CI → Deploy Supabase → Vercel
   timing), environments (do not push directly to `main`).
2. **[CONTEXT.md](./CONTEXT.md)** — full product brief: problem, users
   and roles, balance model and invariant, schema, security model, and
   what's intentionally out of scope. This is the source of product
   truth. Update it when product decisions change.
3. **[.cursor/rules/](./.cursor/rules/)** — project-specific code
   conventions that Cursor auto-loads. Currently:
   - `tailwind-v4.mdc` — this project uses Tailwind v4 (CSS-first config,
     no `tailwind.config.ts`). Do not generate v3 patterns.
   - `production-database.mdc` — no destructive hosted SQL; local Docker for data.
4. **[README.md](./README.md)** — overview, demo, stack, local dev quick start.
5. **[docs/MAINTENANCE.md](./docs/MAINTENANCE.md)** — full dev commands, seed
   scenarios, PWA asset regen, security TODOs (Teller + production database).
6. **[docs/AUTO_ORGANIZE.md](./docs/AUTO_ORGANIZE.md)** — **Auto-bucket** feature:
   cadence, `auto_organize_*` schema/RPCs, cron, roles, History.
7. **[docs/BRAND.md](./docs/BRAND.md)** — product voice, Unbucketed terminology,
   and the full **Product narrative** (word-for-word). User-facing strings live in
   `src/lib/brand.ts`.
8. **[docs/BANK_PROVIDERS.md](./docs/BANK_PROVIDERS.md)** — **bank providers**:
   SimpleFIN is the active connector (user pays SimpleFIN Bridge directly);
   Plaid is live behind the `plaid` feature flag (owner's household only —
   10 lifetime trial Items, protected by detach/update-mode guardrails);
   Teller is quiesced (API withdrawn July 2026 — code/rows stay, balances
   frozen). `accounts` is the
   provider-neutral core; per-provider credential tables are service-role
   only; client code goes through `src/lib/bankProviders.ts` dispatch. SQL/TS
   for "linked" is `source <> 'manual'` / `isLinkedAccount()`.
9. **[docs/FEATURE_FLAGS.md](./docs/FEATURE_FLAGS.md)** — **feature flags**:
   owner-controlled, per-household, read-only in the client. How to add a flag
   (registry in `src/lib/featureFlags.ts`), read one (`useFeatureFlag`), and
   enable one for a household via Supabase. Live flags: `bitcoin` (Bitcoin
   tracking) and `plaid` (Plaid connector — also re-checked server-side by the
   Plaid Edge Functions).

## Operating principles for this codebase

- **Bump `package.json` version once per PR** (one step from current `main`; do
  not bump again while iterating on the same branch before merge). See
  [CONTRIBUTING.md § Bump version](./CONTRIBUTING.md#bump-packagejson-version-on-every-pr).
- **PR title includes the shipping version** — `v1.1.21: Short description`,
  matching the semver bumped in that PR (see CONTRIBUTING § Bump version).
- **Do not enable auto-merge by default.** Open the PR and leave it for the repo
  owner to review and merge — merging to `main` promotes to production (Vercel +
  Deploy Supabase), so a human stays in the loop on every ship. Only run
  `gh pr merge --auto --squash --delete-branch` if the owner explicitly asks for
  it on that PR (see CONTRIBUTING § Branch workflow).
- **Realtime:** prefer narrow filters and route-scoped channels; app-shell watches
  (e.g. member removal) are fine — channels share one websocket per session. See
  [CONTEXT.md § Supabase Realtime](./CONTEXT.md#supabase-realtime).
- **Branch from current `main`.** One open PR at a time. After a merge:
  `git checkout main && git pull`, then `git checkout -b …` for the next task.
  Never continue on a merged branch or branch cut before the previous PR landed.
  See [CONTRIBUTING.md § One PR at a time](./CONTRIBUTING.md#one-pr-at-a-time--always-branch-from-current-main).
- **Tenant isolation.** Every domain table has a `family_id`. Every
  query, every RLS policy, every Edge Function must scope to one family.
  If you touch RLS or `auth_family_id()`, re-read the SECURITY WARNING
  at the top of
  [supabase/migrations/00000000000000_initial_schema.sql](./supabase/migrations/00000000000000_initial_schema.sql).
- **The ledger identity is the contract.** Cash (linked banks + manual money
  sources) − credit card balances (linked or manual; see
  [docs/CREDIT_CARDS.md](./docs/CREDIT_CARDS.md)) = allocations +
  the unbucketed pool, derived in SQL (`member_float()` — code keeps `float`).
  **User-facing label:** **Unbucketed** (`FLOAT_LABEL` in `src/lib/brand.ts`).
  **User signal for “rebalance”:** negative red Unbucketed in the Buckets tab — not a
  separate integrity banner. **Operator ledger checks** (automated family-wide
  verification, `check-invariant`) are deferred until a possible paid SaaS;
  see CONTEXT.md § Data Integrity. Do not add a second user-facing alarm for
  normal bank-vs-bucket drift.
- **Product ↔ code naming:** Use one vocabulary for features — UI labels in
  `brand.ts` and schema/RPC names should mean the same thing (e.g. **Auto-bucket**
  → `auto_organize_*`); do not introduce parallel backend aliases. See
  [docs/AUTO_ORGANIZE.md § Naming](./docs/AUTO_ORGANIZE.md#naming).
- **Money writes only via RPCs.** `move_money` and `give_money`; extend
  `tests/db/` when changing balance logic.
- **Destructive / consequential UI:** confirm with `Sheet` + `brand.ts` copy when
  the action has real impact (money, access, hard-to-undo state)—not for trivial
  reversible edits. Never `window.confirm` (breaks in Cursor’s browser).
- **Portfolio / PWA marketing assets:** significant UI/UX changes to the
  captured surfaces require refreshing install screenshots
  (`npm run pwa:screenshots`) and the README demo GIF (`npm run pwa:gifs`) in
  the same PR when possible. The canonical surface list and commands live in
  [docs/MAINTENANCE.md § Regenerating README / PWA assets](./docs/MAINTENANCE.md#regenerating-readme--pwa-assets).
- **Ephemeral feedback:** use `toast` from `@/lib/toast` for action success/errors
  far from the user’s focus (toast sits below the top safe area app-wide); keep form
  validation inline. Short copy auto-dismisses after 7s; errors and long copy need
  manual dismiss (no countdown UI).
- **Child role is locked down.** A child must never be able to query
  family-pool balances, other members' balances, or other members'
  transactions. Validate this at the RLS layer, not the UI layer.
- **Server secrets stay on the server.** `TELLER_SIGNING_SECRET` and the
  Supabase service role key live in Edge Function env only — never
  prefixed with `VITE_`, never imported by client code.
- **Hosted database:** keep prod unlinked on dev machines; no bulk DELETE via CLI
  or agents. See `production-database.mdc` and [docs/MAINTENANCE.md § Production database](./docs/MAINTENANCE.md#production-database).
- **Hosted schema deploy:** add SQL under `supabase/migrations/`. On merge to
  `main`, **[Deploy Supabase](./.github/workflows/deploy-supabase.yml)** runs
  `supabase db push` after green CI — **do not** tell the user to run `db push`
  manually after merge. If the site looks ahead of the DB, check GitHub Actions
  → **Deploy Supabase** or Supabase → **Database → Migrations** (a failed
  deploy also opens a `Deploy Supabase failed on main` issue). Manual
  `link` / `db push` is emergency fallback only ([CONTRIBUTING § Deploying backend changes](./CONTRIBUTING.md#deploying-backend-changes)).
  **`FAST_DEPLOY`** (Actions variable, off by default) makes merges deploy
  without waiting for CI on `main`; check `gh variable list` before assuming the
  deploy is CI-gated, and remind the owner to turn it off when the task is done
  ([MAINTENANCE § Fast deploy](./docs/MAINTENANCE.md#fast-deploy-temporary-switch)).
  Never flip it on your own.
- **Auth sign-in routing.** Post-sign-out paths and email vs PIN preference
  live in [`src/lib/authNavigation.ts`](./src/lib/authNavigation.ts) and
  [`src/lib/signInPreference.ts`](./src/lib/signInPreference.ts). Use router
  `state` (e.g. `preferEmailSignIn`) for explicit user choices — not overloaded
  query params.

## Where to put new code

| Concern                         | Location                              |
| ------------------------------- | ------------------------------------- |
| Reusable UI primitives          | `src/components/ui/`                  |
| App shell, nav, layouts         | `src/components/layout/`              |
| Auth flows (login, PIN, biometric) | `src/features/auth/`               |
| Buckets list + move flow        | `src/features/buckets/` |
| Auto-bucket | `src/features/buckets/` + `src/lib/autoOrganize.ts`, `autoOrganizeCadence.ts`; [docs/AUTO_ORGANIZE.md](./docs/AUTO_ORGANIZE.md) |
| Give money flow                 | `src/features/give/` |
| Hide amounts + Peek FAB         | `HideAmountsProvider`, `HideAmountsPeekFab` (fixed), `HideAmountsPeekSheetAnchor` in `Sheet`, `hideAmountsPeekLogic.ts` |
| Transaction history             | `src/features/history/`               |
| Account linking (SimpleFIN; quiesced Teller) | `src/features/admin/` (`accounts/` holds the read-only Bank activity view); provider dispatch in `src/lib/bankProviders.ts`; [docs/BANK_PROVIDERS.md](./docs/BANK_PROVIDERS.md) |
| Admin / family management       | `src/features/admin/`                 |
| Supabase client / Teller helpers / invariant helper | `src/lib/` (`auth.tsx`, `buckets.ts`, `accounts.ts`, …) |
| Shared React hooks              | `src/hooks/`                          |
| Unit tests (Vitest)             | `src/**/*.test.ts` (colocate with code) |
| DB-mirrored TS types (generated) | `src/types/database.ts`              |
| SQL migrations                  | `supabase/migrations/`                |
| Edge Functions (Deno runtime)   | `supabase/functions/<name>/index.ts`  |

Use the `@/` alias for absolute imports from `src/`.

## Testing

- **`npm test`** — unit tests (fast, no Docker).
- **`npm run db:seed`** / **`npm run db:reset:seed -- <scenario>`** — local Docker
  demo data only (`scripts/seed/`; see [docs/MAINTENANCE.md § Local database scenarios](./docs/MAINTENANCE.md#local-database-scenarios)). CI
  does not run seeds.
- **`npm run test:db`** — database tests (needs `npm run db:start`): RLS in
  `tests/db/rls.test.ts`, `move_money` in `move_money.test.ts`, `give_money`
  in `give_money.test.ts`, transaction visibility in `transactions.test.ts`,
  SimpleFIN credential lockdown in `simplefin.test.ts`.
- **`npm run test:e2e`** — Playwright smoke (Docker + local Supabase).
- **`npm run check:full`** — lint + unit + db tests + build (no e2e).
- When changing RLS or money RPCs, extend the matching file under `tests/db/`.
  Colocate unit tests as `src/**/*.test.ts`.

## Update this file

When a new convention emerges that future sessions need to know about,
add it here or, if it's file-pattern specific, add a new rule in
`.cursor/rules/`.
