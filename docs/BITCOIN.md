# Bitcoin (flag-gated feature)

Per-kid Bitcoin purchase tracking, the app version of a spreadsheet with one
table per kid: each row is a buy (original USD, exact BTC amount, date), and
current value / gain-loss derive from a live spot price. Each rollup also
shows the average cost basis per whole BTC (total spent ÷ BTC held), directly
comparable to the live price so you can read gain/loss at a glance.

Gated by the `bitcoin` feature flag (see [FEATURE_FLAGS.md](FEATURE_FLAGS.md))
— off for every household unless the owner enables it in Supabase. Enable it
locally with the `bitcoin` seed scenario: `npm run db:seed -- bitcoin`.

## What renders where

- **Kids page (adults)** — a "Bitcoin" section below the kid lists:
  live price badge, one expandable table per kid with a per-kid totals row.
  Admins add/edit/delete entries (manual USD + BTC + date, matching how buys
  actually happen; delete confirms via a sheet); shared members see it
  read-only.
- **Buckets page (kids)** — a read-only "Bitcoin" tab with the price badge
  and their own entries. The tab appears only when the flag is on AND the
  kid has at least one entry (a cheap count probe; a failed probe silently
  hides the tab).

Both surfaces have a unit toggle that flips BTC amounts between whole sats
(default, e.g. "20,134" + the satoshi symbol, an inline SVG since the glyph
isn't in Unicode — `SatsIcon.tsx`) and ₿ decimals — display-only, persisted
per member in localStorage (`src/features/bitcoin/btcUnit.ts`, keyed like
hideAmountsStorage so kids sharing a device keep separate choices). Entry
input and storage stay in BTC.

## Live price

`GET https://mempool.space/api/v1/prices` straight from the
browser (no key, CORS-ok). `src/features/bitcoin/btcPrice.ts` caches it for
3 minutes, dedupes in-flight requests, serves the last good price on a blip,
and never throws. When no price is available, derived columns render `—` and
the badge says "Live price unavailable" — original values always render, and
the host pages are unaffected.

## Data

`public.bitcoin_entries` (migration `00000000000083_bitcoin_entries.sql`):
one row per buy, keyed to `family_members.id` (works for virtual and
bank-linked kids alike). RLS: adults read the whole family, a kid reads only
their own rows, writes are household-admin only (and must target a child in
the same family). No Realtime — mutations refetch, like feature_flags.

Client access lives in `src/lib/bitcoinData.ts`; derived-value math in
`src/features/bitcoin/bitcoinMath.ts` (pure, unit-tested; BTC sums in
satoshis to avoid float drift).

Copy deviation: Bitcoin strings live in the feature's components rather than
`brand.ts`, so removing the feature touches nothing shared.

## Removal

Instant off: disable the `bitcoin` flag for the household — all UI disappears
on next load.

Full delete:

1. `git rm -r src/features/bitcoin/ src/lib/bitcoinData.ts tests/db/bitcoin_entries.test.ts docs/BITCOIN.md`
2. Revert the flag-gated block in `src/features/kids/KidsPage.tsx` (two imports + one render).
3. Revert the `'bitcoin'` additions in `src/lib/bucketsPageTabs.ts` (+ its test) and the wiring in `src/features/buckets/BucketsPage.tsx`.
4. Remove the `bitcoin` seed scenario from `scripts/seed/scenarios.ts` and the `enableFeatureFlag`/`insertBitcoinEntry` helpers from `scripts/seed/db.ts`.
5. Drop migration: `drop table public.bitcoin_entries; drop function public.touch_bitcoin_entries_updated_at();` then `npm run db:types`.
6. Remove the `bitcoin` entry from `FEATURE_FLAG_REGISTRY` (stale DB flag rows are ignored by `resolveFeatureFlags`).

After that, a case-insensitive grep for `bitcoin` across `src/` should return
nothing.
