<p align="center">
  <a href="https://bucketmymoney.com">
    <img src="public/icons/icon-192.png" alt="Bucket My Money" width="128" height="128" />
  </a>
</p>

# Bucket My Money

**Live:** [bucketmymoney.com](https://bucketmymoney.com) · App: [app.bucketmymoney.com](https://app.bucketmymoney.com)

Bucket My Money is a progressive web app for organizing cash into **buckets**
— so you know what's actually available, not just what your bank shows. Use it
solo or with a shared household: connect read-only bank accounts and credit
cards, set money aside from **Unbucketed**, and see where your money is at a
glance. Credit cards count against the number — what you see is cash minus card
debt, so a swipe can't hide from your budget. When the balance moves, pick
which bucket covers it.

## Engineering highlights

A deployed, production-grade app, built to be correct with money and safe with
other people's data.

- **A money invariant enforced in the database.** Cash minus card debt always equals
  bucket allocations plus the Unbucketed pool. It is derived in Postgres, and balances
  change only through `SECURITY DEFINER` RPCs (`move_money`, `give_money`) — clients
  cannot write them. Database tests pin the behavior.
- **Multi-tenant isolation at the row level.** Every table carries a `family_id` and
  RLS policies scope every query. A kid's login can't read family balances or other
  members' data — enforced in the policies, not the UI, and tested against a real
  local Postgres (38 database test files).
- **Layered authentication.** Email and Google sign-in (Apple supported, off by default), 4-digit PIN with atomic
  attempt counting and lockout, and WebAuthn passkeys (Face ID / Touch ID) with a PIN
  step-up. Pre-auth rate limiting lives in Postgres so it holds across Edge Function
  instances.
- **Server-side secrets and bank data.** Bank credentials sit in service-role-only
  tables behind 36 Deno Edge Functions; none of it reaches client code. Provider
  access goes through a swappable layer (SimpleFIN, Plaid, Teller).
- **Security reviewed, then fixed.** I ran a structured security audit of the code.
  It found a real flaw (a child could insert a bucket with a negative balance through
  the API); I reproduced it locally, fixed it, and added regression tests. Related
  hardening: deploy-pipeline gating, PIN-reset session revocation, unlock rate limits,
  and exact WebAuthn origins.
- **Tested and shipped like a team project.** About 960 unit tests, 300+ database
  tests and Playwright end-to-end smoke tests run in CI. Merges to `main` deploy
  automatically after CI passes: Vercel for the app, Cloudflare for the marketing
  site, and GitHub Actions applying Supabase migrations (110+) and Edge Functions.
- **Considered product detail.** Installable offline-capable PWA, a hide-amounts
  mode with hold-to-peek, drag-to-reorder buckets and groups, and a written voice and
  copy guide ([docs/BRAND.md](./docs/BRAND.md)).

## Demo

Your bank shows one balance. Buckets show where that money actually is —
create a few, set money aside from **Unbucketed**, and put them in the order that
fits your life.

<p align="center">
  <img
    src="public/demos/organize-money.gif"
    alt="Buckets tab — create emoji buckets, set money aside from Unbucketed, drag Rent up"
    width="280"
  />
</p>

## Screenshots

Installable progressive web app with phone-sized UI — Buckets, History, and Kids.
Regenerate after significant UI changes ([docs/MAINTENANCE.md § PWA assets](./docs/MAINTENANCE.md#regenerating-readme--pwa-assets)).

<p align="center">
  <img src="public/screenshots/buckets.png" alt="Buckets tab — Unbucketed, emoji buckets, and Auto-bucket tabs" width="49%" />
  <img src="public/screenshots/buckets-rebalance.png" alt="Buckets tab — negative Unbucketed rebalance signal" width="49%" />
</p>
<p align="center">
  <img src="public/screenshots/history.png" alt="History tab — bucket moves and gives" width="49%" />
  <img src="public/screenshots/kids.png" alt="Kids tab — virtual kid balances with Give" width="49%" />
</p>

## What it does

- **Unbucketed + buckets** — cash not yet in a bucket lives in **Unbucketed**; buckets
  are money you've set aside. Credit card balances count against Unbucketed, so the
  number is what you really have. The invariant is enforced and derived in Postgres
  (`move_money`, `give_money`, `member_float`).
- **Household roles** — admin, shared member, and kid views with RLS tenant isolation.
  Sign in with email or Google, with Apple ready to enable ([docs/OAUTH_SIGN_IN.md](./docs/OAUTH_SIGN_IN.md)),
  a 4-digit PIN on shared devices, or Face ID / Touch ID passkeys.
- **Move and give money** — set aside from Unbucketed, cover spends, give to kids; History
  with pagination and notes.
- **Read-only bank link** — SimpleFIN Bridge (user-controlled, read-only), manual money sources and card balances for onboarding; provider-swappable design ([docs/BANK_PROVIDERS.md](./docs/BANK_PROVIDERS.md)).
- **Bucket groups and hidden amounts** — organize buckets into groups, and hide every
  amount on screen with a hold-to-peek button.
- **Auto-bucket** — scheduled or on-demand rules to set aside into buckets (`pg_cron` on hosted).
- **PWA** — offline fallback, service worker, install screenshots; session-scoped auth.
- **Marketing site** — a static Astro landing page in `site/` at
  [bucketmymoney.com](https://bucketmymoney.com), with privacy, terms and contact pages.
- **Feature flags** — owner-controlled, per-household flags gate experimental features
  to a single family without shipping them to everyone; read-only in the client, zero
  cost for households without a flag ([docs/FEATURE_FLAGS.md](./docs/FEATURE_FLAGS.md)).
- **Tests** — Vitest unit tests, database RLS/RPC tests, Playwright smoke e2e; CI on every PR.

Product truth and balance model: [CONTEXT.md](./CONTEXT.md).

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4 (CSS-first — see [docs/MAINTENANCE.md](./docs/MAINTENANCE.md))
- `vite-plugin-pwa` (manifest + service worker)
- React Router 7
- Supabase (Auth, Postgres, Realtime, Edge Functions)
- SimpleFIN Bridge (read-only bank connection; Plaid behind a per-household flag; Teller
  quiesced — [docs/BANK_PROVIDERS.md](./docs/BANK_PROVIDERS.md))
- Hosting: the app on Vercel, the marketing site (Astro + Tailwind v4) on Cloudflare,
  migrations and Edge Functions deployed by GitHub Actions after CI passes

## Architecture

```
src/
  components/{ui,layout}/   reusable primitives + app shell
  features/                 auth, buckets, give, kids, history, admin
  lib/                      supabase, auth, buckets, accounts
  hooks/                    shared React hooks
  types/                    DB types (supabase gen types)
  sw.ts                     PWA service worker (injectManifest)
public/
  icons/                    PWA icons
  screenshots/              install UI assets
  demos/                    README demo GIF
site/                       static Astro marketing site (own package.json)
supabase/
  migrations/               SQL migrations (sequential numeric prefixes)
  functions/                Deno Edge Functions
```

| Edge Function | Purpose |
| ------------- | ------- |
| `simplefin-claim` | Claim a one-time Setup Token, store the Access URL (service-role only) |
| `simplefin-accounts-confirm` | Import the chosen accounts, classified cash vs card |
| `simplefin-refresh` | On-demand balance re-pull (30-min server throttle) |
| `simplefin-transactions-list` | Recent bank activity window (fetched on demand, not persisted) |
| `simplefin-disconnect` | Remove a connection + its local accounts |
| `simplefin-scheduled-refresh` | pg_cron cadence sweep — keeps balances fresh |
| `teller-*` | Quiesced Teller provider, kept for a possible v2 ([docs/BANK_PROVIDERS.md](./docs/BANK_PROVIDERS.md)) |
| `check-invariant` | Ledger check stub (deferred) |

Balances stay current two ways: the **manual refresh** button (on demand, 30-min
throttle) and the **scheduled sweep** (`simplefin-scheduled-refresh`, every 10 min
via pg_cron) which re-pulls any linked balance older than the cadence
(`SCHEDULED_REFRESH_CADENCE_HOURS`, default 6h) — SimpleFIN has no webhooks, and
its ~24 requests/day budget shapes both. One-time production setup in
[docs/MAINTENANCE.md](./docs/MAINTENANCE.md).

Auth/member functions (PIN login, member management, WebAuthn passkeys) are
omitted here — see `supabase/functions/` for the full list.

## Local development

```bash
npm install
cp .env.example .env.local
npm run db:start          # first time: Docker + local Supabase (~1 min)
source scripts/env-local.sh && npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Try demo data: `npm run db:reset:seed -- household`
then sign in as `household@bmm.dev` / `asdfasdf`.

| Command | Purpose |
| ------- | ------- |
| `npm run check:full` | Lint + unit + database tests + production build |
| `npm run test:db` | RLS and money RPC tests (needs `db:start`) |
| `npm run test:e2e` | Playwright smoke (needs `db:start`) |

Full command list, seed scenarios, PWA asset regen, and security checklists:
[docs/MAINTENANCE.md](./docs/MAINTENANCE.md). PR workflow and CI:
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Documentation

| Document | Contents |
| -------- | -------- |
| [CONTEXT.md](./CONTEXT.md) | Product brief, balance model, schema, security |
| [docs/BRAND.md](./docs/BRAND.md) | Voice, Unbucketed terminology, product narrative |
| [docs/AUTO_ORGANIZE.md](./docs/AUTO_ORGANIZE.md) | Auto-bucket feature and cron |
| [docs/BANK_PROVIDERS.md](./docs/BANK_PROVIDERS.md) | SimpleFIN, Plaid and Teller provider strategy |
| [docs/OAUTH_SIGN_IN.md](./docs/OAUTH_SIGN_IN.md) | Google / Apple sign-in setup |
| [docs/FEATURE_FLAGS.md](./docs/FEATURE_FLAGS.md) | Owner-controlled per-household feature flags |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Branch/PR workflow, CI, deploy sequence |
| [AGENTS.md](./AGENTS.md) | Entry point for AI coding agents |
| [docs/MAINTENANCE.md](./docs/MAINTENANCE.md) | Dev commands, seeds, TODOs, Teller/prod ops |

## License

Proprietary — all rights reserved. Not open source. See [LICENSE](./LICENSE).
