# Maintenance and operations

Operator notes, security checklists, and asset-regeneration commands. **Not**
required reading for understanding the product — see [CONTEXT.md](../CONTEXT.md)
and [README.md](../README.md). Intended for contributors and AI agents working
in the repo.

## Local development commands

| Command | Purpose |
| ------- | ------- |
| `npm run db:start` | Local Postgres + Auth + Studio (54323); signup emails in Inbucket (54324) |
| `npm run dev:phone` | Vite on LAN for phone UI testing (same WiFi) |
| `npm run functions:serve` | Edge Functions (second terminal; needs `supabase/functions/.env`) |
| `npm run db:stop` | Stop local stack |
| `npm run db:reset` | Re-apply all migrations (empty data) |
| `npm run db:seed` | List local seed scenarios (or seed one; see below) |
| `npm run db:reset:seed -- <scenario>` | Reset DB, then seed a scenario |
| `npm run db:types` | Regenerate `src/types/database.ts` from local DB |
| `source scripts/env-local.sh` | Load local API URL + keys into your shell |
| `node scripts/supabase-env.mjs` | Print `export …` lines (for manual copy) |
| `npm run test:db` | RLS + `move_money` + transaction visibility (local Supabase) |
| `npm run test:e2e` | Playwright smoke (Docker + local Supabase; first run: `npx playwright install chromium`) |
| `npm run pwa:screenshots` | Refresh PWA manifest install PNGs (local seed + Playwright; not CI) |
| `npm run pwa:gifs` | Refresh README demo GIF (`pwa-gifs` seed + Playwright; not CI) |
| `npm run test:all` | Unit + database tests |
| `npm run check:full` | Lint + all tests + production build |

Point `.env.local` at local Supabase (`source scripts/env-local.sh` once per
shell, or paste keys from `npm run db:status`). Edge Function secrets stay in
`supabase/functions/.env`.

**Fast loop:** leave `supabase start` running in one terminal; use another for
`npm run dev` (or `npm run dev:phone`). After pulling SQL changes: `npm run db:reset`.

**Phone on same WiFi:** `npm run dev:phone` — binds Vite to your LAN and points
`VITE_SUPABASE_URL` at `http://<lan-ip>:54321` for that session only.

### Local database scenarios

After `npm run db:start`, seed demo data with fixed credentials (local Docker only):

```bash
npm run db:seed                    # list scenarios
npm run db:reset:seed -- all       # wipe + seed every scenario (recommended)
npm run db:reset:seed -- household # wipe + seed one scenario only
npm run db:seed -- pin-household   # seed into current DB (run after reset)
```

Each scenario is its own family. Admin email is **`<scenario>@bmm.dev`**. Password
is always **`asdfasdf`**. After `all`, sign out and sign in with another email to
switch — no reset needed.

| Scenario | Admin email | What you get |
| -------- | ----------- | ------------ |
| `all` | (every row below) | All families at once — credential table printed at end |
| `solo` | `solo@bmm.dev` | Empty app, good for first-run UX |
| `household` | `household@bmm.dev` | Admin + shared member + kid, $1k cash, buckets, send |
| `rebalance` | `rebalance@bmm.dev` | $200 cash, $450 allocated (negative Unbucketed) |
| `pin-household` | `pin-household@bmm.dev` | Like `household`, PIN **0000** on Alex and Sam |
| `linked-kid` | `linked-kid@bmm.dev` | Kid with assigned manual account — Send blocked |
| `admin-no-pin` | `admin-no-pin@bmm.dev` | Admin only, no PIN — green PIN setup CTA |
| `kid-view` | `kid-view@bmm.dev` | Admin + kid (PIN **0000**), no shared member |
| `many-buckets` | `many-buckets@bmm.dev` | 15 pool buckets — scroll and reorder |
| `history` | `history@bmm.dev` | ~40 moves and sends — History volume |
| `shared-only` | `shared-only@bmm.dev` | Shared member (PIN **0000**), no kid |
| `golden` | `golden@bmm.dev` | R + S + 5 kids (PIN **0000**), 6 linked bank accounts ($25k each; K and A assigned), 30 emoji buckets ($100 each), J/T/Z with $10k each |
| `pwa-screenshots` | `pwa-screenshots@bmm.dev` | Emoji buckets, green Unbucketed — PWA install screenshot source |
| `pwa-gifs` | `pwa-gifs@bmm.dev` | $5k Unbucketed, no buckets — README demo GIF source |

CI does **not** run seeds — database tests create their own fixtures.

## Regenerating README / PWA assets

**When to refresh:** After any **significant UI/UX change** to Buckets, History,
Kids, Admin, or the app shell — update **both** the install screenshots and the
README demo GIF in the same PR (or immediately after) so GitHub, the PWA install
sheet, and portfolio viewers stay in sync with the product.

| Asset | Where it appears | Command |
| ----- | ---------------- | ------- |
| Install PNGs | PWA manifest (`public/screenshots/`), [README Screenshots](./README.md#screenshots) | `npm run pwa:screenshots` |
| Demo GIF | [README Demo](./README.md#demo) | `npm run pwa:gifs` |

Cosmetic copy tweaks usually do not need a refresh; new layouts, tabs, flows, or
visual hierarchy do.

**Demo GIF** ([`public/demos/organize-money.gif`](../public/demos/organize-money.gif)):

```bash
npm run pwa:gifs
```

Resets the `pwa-gifs` seed, captures with Playwright + ffmpeg. Constants in
[`scripts/seed/pwaDemoGifs.ts`](../scripts/seed/pwaDemoGifs.ts).

**Install screenshots** (`public/screenshots/*.png`, manifest `screenshots`):

```bash
npm run db:reset:seed -- pwa-screenshots
npm run pwa:screenshots
```

Captured at **412×915**. Bucket names and manifest entries in
[`scripts/seed/pwaScreenshots.ts`](../scripts/seed/pwaScreenshots.ts).

## Tailwind CSS v4

This project uses Tailwind **v4** (CSS-first). Configuration lives in
`src/index.css` via `@import "tailwindcss";` and optional `@theme { … }` blocks —
**not** `tailwind.config.{js,ts}`, v3 `@tailwind` directives, or PostCSS config.
The Vite plugin is `@tailwindcss/vite` in `vite.config.ts`.

## CI and hosted deploy

Every push to `main` and every PR runs
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml): lint + unit + build
(always); database RLS tests and Playwright e2e when the diff can affect app or
Postgres ([`scripts/ciChangedScope.mjs`](../scripts/ciChangedScope.mjs)).

After green CI on `main`, [`.github/workflows/deploy-supabase.yml`](../.github/workflows/deploy-supabase.yml)
applies migrations and deploys Edge Functions. PRs do not touch production.

Full workflow, Vercel gating, and troubleshooting: [CONTRIBUTING.md](../CONTRIBUTING.md).

### Fast deploy (temporary switch)

Normally a merge deploys only after the **whole** CI run on `main` finishes. That
run repeats the database and e2e tests the PR already passed and can take
6–17 minutes, while the deploy itself takes under one. For a single-user app
during active work you can deploy on merge instead, with one repository Actions
variable:

| Action | Command |
| ------ | ------- |
| Turn **on** | `gh variable set FAST_DEPLOY --body true` |
| Turn **off** (default) | `gh variable delete FAST_DEPLOY` |
| Check | `gh variable list` |

While it is `true`: a push to `main` runs **Deploy Supabase** immediately (event
`push`) and the CI-gated trigger (`workflow_run`) steps aside, so there is no
double deploy. CI still runs in parallel, and PR CI must still pass before the
merge. Every fast run prints a `FAST_DEPLOY is ON` warning annotation. Manual
runs (`workflow_dispatch`) are unchanged and still require a green CI run for
the commit.

**Risk:** a bad merge reaches production *before* its main-CI result. That is
acceptable for one user mid-task, not for a real multi-household app. **Turn it
off when the task is done, and always before other households use the app.**
Unset = the safe, gated behavior; the switch is `vars.FAST_DEPLOY` in the job
`if:` of [`deploy-supabase.yml`](../.github/workflows/deploy-supabase.yml).
Agents: never flip it on your own; the owner decides.

### Verifying the pre-auth rate limit (hosted)

Join-code lookups, PIN login, and passkey endpoints are limited per client
address (`pre_auth_rate_limit` / `check_pre_auth_rate_limit`, keyed on an
address the caller cannot choose: `cf-connecting-ip`, then `sb-forwarded-for`,
then the **last** `x-forwarded-for` entry; IPv6 by /64; see migration 107 and
`supabase/functions/_shared/clientIp.ts`). After touching that code, or if the
hosting setup changes, prove it still holds with
[`scripts/check-xff-rate-limit.mjs`](../scripts/check-xff-rate-limit.mjs)
(read-only lookups of random invalid codes; it finds the public Supabase URL and
key in the site's own bundle):

| Command | Expected |
| ------- | -------- |
| `node scripts/check-xff-rate-limit.mjs` | ~20 answered, then refused (a faked `X-Forwarded-For` is ignored) |
| `node scripts/check-xff-rate-limit.mjs --edge` | same, for the Edge Function path |
| `node scripts/check-xff-rate-limit.mjs --two-network --edge` | **PASS**: guided; uses up this network's budget, tells you to switch networks (phone hotspot, phone Wi-Fi off), and checks the second address still gets its own full budget |

Each run blocks your own address from that endpoint for about a minute, so wait
a minute between runs. Last verified against production on 2026-10-23.

### Production Supabase deploy (one-time secrets)

Create a GitHub **environment** named `production` and add:

| Secret | Where to get it |
| ------ | ---------------- |
| `SUPABASE_ACCESS_TOKEN` | [Supabase account tokens](https://supabase.com/dashboard/account/tokens) (CI/CD scope) |
| `SUPABASE_PROJECT_REF` | Project Settings → General → Reference ID |

If **Deploy Supabase** fails, the hosted DB or functions may lag the Vercel
frontend. The workflow opens (or comments on) a `Deploy Supabase failed on main`
GitHub issue with the run link, so a failure is visible without checking Actions.

Manual fallback:

```bash
npx supabase link
npx supabase db push
npx supabase functions deploy
npx supabase unlink
```

### Scheduled balance refresh (production)

Migration `84` schedules a pg_cron sweep (`scheduled-balance-refresh`, every
10 min; renamed from migration 81's `teller-scheduled-balance-refresh`) that
pings the `simplefin-scheduled-refresh` Edge Function to re-pull any linked
balance older than the cadence. It stays **inert** until you wire the shared
secret — safe to deploy first, activate later. Provider background in
[BANK_PROVIDERS.md](./BANK_PROVIDERS.md).

1. Pick a strong random secret (e.g. `openssl rand -hex 32`).
2. Give the Edge Function the secret:

   ```bash
   npx supabase secrets set SCHEDULED_REFRESH_SECRET=<secret>
   # optional tuning (defaults 6h / 25):
   # npx supabase secrets set SCHEDULED_REFRESH_CADENCE_HOURS=6 SCHEDULED_REFRESH_BATCH=25
   ```

3. Give pg_cron the same secret + the function URL via Supabase Vault (SQL editor):

   ```sql
   select vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1/simplefin-scheduled-refresh',
     'simplefin_scheduled_refresh_url');
   select vault.create_secret('<secret>', 'scheduled_refresh_secret');
   ```

   (An existing `scheduled_refresh_secret` from the Teller era carries over —
   only the URL secret is new. The old `scheduled_refresh_url` entry is
   unused and can be deleted.)

To add the Plaid sweep (flag-gated households only), also set:

   ```bash
   npx supabase secrets set PLAID_CLIENT_ID=<id> PLAID_SECRET=<secret> PLAID_ENV=production
   ```

   ```sql
   select vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1/plaid-scheduled-refresh',
     'plaid_scheduled_refresh_url');
   ```

   For push-fresh balances (Plaid webhooks), also set the receiver URL —
   webhooks stay off until this exists; existing Items self-configure on
   their next sweep tick:

   ```bash
   npx supabase secrets set PLAID_WEBHOOK_URL=https://<project-ref>.supabase.co/functions/v1/plaid-webhook
   ```

Verify: `select * from cron.job where jobname = 'scheduled-balance-refresh';`
and, after a tick, check recent `net._http_response` rows / the function's
Invocations. Rotating the secret = update both the Edge Function secret and the
`scheduled_refresh_secret` Vault entry.

## Security and production checklist

### Production deploy automation

- [x] **CI/CD:** after green CI on `main`, `deploy-supabase.yml` runs `db push` + `functions deploy`
- [x] Notification when **Deploy Supabase** fails on `main` — the workflow opens
      (or comments on) a `Deploy Supabase failed on main` GitHub issue

**Auto-bucket backend:** migrations `48`–`61` enable **pg_cron** on hosted Supabase.
See [AUTO_ORGANIZE.md § Scheduler](./AUTO_ORGANIZE.md#scheduler-cost--scale).

### Before connecting real bank data

These items are **SECURITY-CRITICAL** before other families or a public paid launch.

- [x] Real RLS policies — `00000000000001_rls_and_auth_bootstrap.sql`
- [x] Multi-family RLS audit — `tests/db/rls.test.ts`, `move_money.test.ts`, `transactions.test.ts`
- [x] `auth_family_id()` with `SECURITY DEFINER` + empty `search_path`
- [x] Teller webhook signature verification in `supabase/functions/teller-webhook/`
- [x] SimpleFIN Access URLs locked to the service role — `simplefin_connections` has RLS on, zero policies (`tests/db/simplefin.test.ts`)
- [ ] ~~Rotate the Teller application certificate + private key~~ — moot while Teller is quiesced ([BANK_PROVIDERS.md](./BANK_PROVIDERS.md)); revisit only if a Teller v2 ships.

To turn PEM files into single-line `\n`-escaped env values:

```bash
awk 'BEGIN{ORS="\\n"} {print}' /path/to/certificate.pem
awk 'BEGIN{ORS="\\n"} {print}' /path/to/private_key.pem
```

### Publishable and secret API keys (hosted)

Supabase is migrating from legacy JWT `anon` / `service_role` to publishable/secret keys.
The app prefers `VITE_SUPABASE_PUBLISHABLE_KEY` when set. See
[Supabase migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

### Production database

One-time, before the first non-builder family signs up:

- [ ] **Enable PITR** (Supabase → Database) once real data would hurt to lose

Standing rules (never "done"):

- **Keep prod unlinked on dev machines** — routine work is local Docker only
- **Bulk data changes:** local Docker only; hosted changes via dashboard SQL Editor yourself

See `.cursor/rules/production-database.mdc` and [CONTEXT.md § Production database](../CONTEXT.md).

### Teller environments

Set both `VITE_TELLER_ENVIRONMENT` (`.env.local`) and `TELLER_ENVIRONMENT`
(`supabase/functions/.env`) to match: `sandbox` | `development` | `production`.

#### Sandbox test credentials

In `sandbox` mode, password is always `password`:

| Username | Behavior |
| -------- | -------- |
| `username` | Happy path — immediate successful enrollment |
| `otp` | OTP MFA — code `0000` |
| `challenge` | Knowledge-based MFA — answer `blue` |
| `disconnected` | Enrolls, then disconnects on first API call |
| `account_locked`, `credentials_invalid`, etc. | `enrollment.disconnected.*` reasons as username |
| `verify.microdeposit` | Microdeposit verification flow |

Full matrix: <https://teller.io/docs/guides/sandbox>

## Deferred and follow-ups

- Operator ledger monitoring (`check-invariant`) — deferred until possible paid SaaS; see CONTEXT.md § Data Integrity
