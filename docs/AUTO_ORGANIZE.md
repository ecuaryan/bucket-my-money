# Auto-bucket — product & implementation spec

Design spec for **automatically organizing money** from shared **Unbucketed** into
household buckets on calendar days the user chooses.

**One vocabulary:** customers see **Auto-bucket**; Postgres, RPCs, TypeScript
(`src/lib/autoOrganize.ts`), and tests use **`auto_organize_*`** — no parallel
`schedules` layer so product and code stay aligned over time.

**Status:** **Shipped (v1)** — migrations `00000000000048`–`00000000000050`, Buckets tab UI,
pg_cron scheduler, History **Scheduled** label.  
**Auto top-up / save-off:** **Shipped** — migration `00000000000058`, three `auto_organize_kind`
values, kind chooser on Add.  
**Kid self-serve:** **Shipped** — migration `00000000000076`, `auto_organizes.owner_member_id`
(null = household pool, a member id = that kid's private rule). Kids author Auto-bucket rules over
their **own** buckets and Unbucketed; the rules are invisible to admins and shared members. Works the
same for linked and virtual kids.  
**Related:** [CONTEXT.md](../CONTEXT.md), [docs/BRAND.md](./BRAND.md), `src/lib/brand.ts`.

---

## Goal

Admin configures one or more **Auto-bucket rules** — automatic `move_money` runs (Unbucketed →
buckets) on chosen calendar days (default **3 AM local**). Shared partner sees
upcoming runs and amounts (read-only). Same [money rules](#money-rules) as manual
moves. Multiple Auto-bucket rules per household; **twice-a-month is one Auto-bucket rule
with two days**, not two duplicate entries.

**Voice:** section **Auto-bucket**; subtitle *Organize your money into buckets on
the days you choose.* Manual one-off moves keep **Set aside** (production) — a
different label for one manual move, not the feature name.

---

## v1 scope

### In

- Household pool Auto-bucket rules only (`move_money`, Unbucketed → family-pool buckets).
- Multiple named Auto-bucket rules per family.
- Cadence: interval (week / 2 weeks / N months) and monthly (once or twice per
  month with configurable days + **Last day of month**).
- Server execution via **pg_cron → Postgres RPC** (no Edge Function).
- Admin: create, edit, pause, delete, **Run now** (with confirm sheet).
- Shared: read-only Auto-bucket cards on Buckets tab.
- History: **individual move rows**; automatic runs show **Scheduled** instead of a
  user name.
- Unbucketed → bucket rule alignment (all roles) — see [Money rules](#money-rules).
- Family **IANA timezone**; **`auto_organize_run_hour`** default **3** (local).
- **Auto top-up** (`top_up`): fill family-pool buckets to a target from Unbucketed each run.
- **Auto save-off** (`save_off`): sweep each source bucket's excess above a keep amount into
  another pool bucket or back to Unbucketed.

### Shipped with caveats

- **Run now** confirm sheet: Current | Move | Will be grid; primary button **Run now**
  (not amount in button label). Multiple **Run now** per local day allowed; last-run context
  (amber when last run was today, neutral date/time otherwise). **Paused** blocks Run now until **Resume**.
- MoveMoneyDialog: Set aside over Unbucketed with confirm sheet when crossing ≥ 0 → negative.

### Deferred (v1.1+)

- Bucket row hint when bucket is on an active Auto-bucket rule (icon or subtitle).
- History row icon for automatic moves.
- Editor **Review** step before save.
- Local **`auto-organize`** seed scenario.
- Optional Run now amber over-Unbucketed banner (grid already shows Unbucketed going negative).

### Out (defer; schema may leave hooks)

- Scheduled **Give to a kid** (`give_money` via a future Auto-bucket `give` kind; virtual kids only).
- History free-text search (gives/takes + per-bucket filters shipped since; the Scheduled label covers Auto-bucket rows).
- Skip-next-run (pause is sufficient).
- End-by-date — runs until paused or deleted (“when I cancel”).
- “Configured by [name]” on cards (neutral copy is fine).

**Kid self-serve Auto-bucket rules are now shipped** (migration `00000000000076`) — see the
status block and [Roles](#roles). Future: scheduled **Give to a kid** (`give_money` via a future
kind). Rows use **`auto_organize_kind`**: `organize` | `top_up` | `save_off`.

---

## Kinds (`auto_organize_kind`)

| Kind | UI label | Line `amount` means | Money direction |
| --- | --- | --- | --- |
| `organize` | Auto-bucket | Fixed add per run | Unbucketed → bucket |
| `top_up` | Auto top-up | Fill-to target | Unbucketed → bucket (`max(0, target − balance)`) |
| `save_off` | Auto save-off | Keep amount | bucket → pool bucket or Unbucketed (`max(0, balance − keep)`) |

- **save_off destination:** `auto_organizes.destination_bucket_id` — a pool bucket, or **null**
  to sweep back to Unbucketed.
- **Computed runs:** top_up/save_off skip lines with zero move; still record an
  `auto_organize_runs` row so the day is not re-run.
- **Card totals:** organize shows exact **Total per run**; top_up/save_off show **Estimated this
  run** (~) from current balances.
- **Same-day order:** cron runs **save_off before organize/top_up** in two explicit
  passes (then `created_at, id` within each pass) so sweeps clear leftovers before refills.
  Every cron move is stamped with `clock_timestamp()` (not the shared transaction-start
  `now()`), so History sorts each tick's rows by real execution order instead of randomly
  by `id`.

Kind is chosen on **Add** (chooser sheet) and **locked after create** — Edit changes amounts and
schedule only.

---

## Roles

| Capability | Admin | Shared (`member`) | Kid |
| --- | --- | --- | --- |
| View household Auto-bucket rules | ✓ | ✓ read-only | — (hidden) |
| Create / edit / pause / delete household | ✓ | — | — |
| Run now (household) | ✓ | — | — |
| View / create / edit / pause / delete / Run now **own** | — | — | ✓ (own scope) |
| Automatic execution | server | — | server |

A **kid owns** Auto-bucket rules scoped to their own buckets and Unbucketed
(`auto_organizes.owner_member_id = kid`). Those rows are invisible to admins and shared
members — exactly like a kid's own buckets. Admins/members manage only **household** rules
(`owner_member_id is null`); kids never touch the household pool.

RLS and RPCs must enforce this — not UI-only. Scoping lives in migration
`00000000000076`: line/destination buckets must match the rule's owner, the Unbucketed member and
History actor resolve to the owner, and adult policies are restricted to `owner_member_id is null`.

---

## Auto-bucket model

Users pick **which days** money is organized (bank-style — no time-of-day picker in
the UI). The server runs due Auto-bucket rules **once per local morning** at a household
default hour (see [Run hour](#run-hour) below).

### A. Interval (bank-style)

- Every week
- Every 2 weeks
- Every 2 / 3 / 4 / 6 months (same engine; ship all if trivial)

Fields: `start_date` (“First run on”), `interval_count`, `interval_unit`
(`week` | `month`).

**Which days:** starting from `start_date`, run every N weeks or N months on that
same cadence. Example: first run **Jun 11**, every **2 weeks** → Jun 11, Jun 25,
Jul 9, … (the start date is the anchor so “every 2 weeks” doesn’t drift to the wrong
weekday).

### B. Monthly (calendar days)

- **Once a month** → one day picker (**1st–28th** or **Last day of month**)
- **Twice a month** → two pickers: **First day** (1st–16th) and **Second day**. The
  second day follows the first by **15 days** (7th → 22nd, 5th → 20th) until you pick
  your own; past the 28th it becomes **Last day** (so 14th/15th/16th pair with the last
  day). Any pair is allowed as long as the second comes after the first — so
  **1st & 15th**, **2nd & 16th**, **1st & 16th**, **7th & 22nd**, **15th & last day**,
  **16th & last day** (the former presets) are all just choices of the two days. The
  server has always accepted any `days_of_month` pair; only the editor was limited.
- **Every 2 weeks** (interval) → biweekly / every-other-Friday when anchored to a
  Friday start date

Once-a-month days **1–28** run every month on that calendar day. **Last day of
month** uses sentinel `0` in `days_of_month` and runs on the real last day
(28/29/30/31). Days **29–31** are not offered in the UI — end-of-month schedules
use **Last day**. Legacy saved values of 29–31 normalize to last day on edit/save.

**Which days:** run on each matching **calendar day** every month. Twice-monthly
fires **once per matching day** (separate run records on the 1st and 15th).

### C. Manual only

- **Manual only** — save bucket lines and amounts without a schedule; runs **only** via **Run now**
- No `start_date`, interval, or monthly day fields; excluded from cron (`auto_organize_is_due_on` → false)
- Card shows **Runs when you choose** instead of a next-run date
- Default display name / transaction note when unnamed: **Manual only**
- **No Pause / Resume** in the UI — not running it is enough; saving clears any stale `paused` flag

### Run hour

On a due day, execute **once** after **`families.auto_organize_run_hour`** in the family’s
timezone (24-hour clock, **default 3** → ~3:00 AM local — organized before most
people wake up). No time picker in v1 UI; same default for all households until
we add an optional Admin setting later.

Hourly `pg_cron` checks: local date is a run day **and** `local_hour >= auto_organize_run_hour`
**and** no run yet for `(auto_organize_id, run_on)` (any trigger — a **Run now** that day
blocks the scheduled pass).

### Display examples

- “Every 2 weeks · next Jun 25”
- “Twice a month · 2nd & 16th · next Jul 2”
- “Once a month · last day · next Jun 30”

### End condition

Runs until **paused** or **deleted** — no end date in v1.

---

## Money rules

Unified for **manual Set aside**, **Run now**, and **automatic runs** — one RPC path.

| Move | Rule |
| --- | --- |
| **Unbucketed → bucket** | Allow even if Unbucketed goes **negative** |
| **Bucket → anything** | Block if `allocated_amount` &lt; amount (bucket cannot go negative) |
| **`give_money`** | Keep existing insufficient-Unbucketed check (unchanged) |

### Confirm sheet (intentional friction)

When a **manual** Set aside would cross **Unbucketed ≥ 0 → Unbucketed &lt; 0**:

- Show consequential `Sheet` (copy in `brand.ts`) before submitting.
- **Skip** confirm if Unbucketed is already negative.
- **Skip** confirm for automatic cron runs and for **Run now** (user chose amounts; confirm
  sheet shows Current | Move | Will be including Unbucketed).

Implementation notes:

- **RPC:** Unbucketed → bucket must not raise insufficient Unbucketed for **any** role. Bucket-source
  checks stay for all roles.
- **UI:** `MoveMoneyDialog` — Set aside uses confirm sheet when crossing into red Unbucketed;
  bucket-source insufficient still blocks inline.

---

## Naming

**Principle:** UI says **Auto-bucket**; schema keeps `auto_organize*` — code snake_cases
(`auto_organize_*`). Do not introduce a second product term (`schedules`, `set_aside_*`) in
schema or RPCs.

| Concept | UI (when shown) | Postgres / RPC / TS |
| --- | --- | --- |
| Feature section | **Auto-bucket** | — |
| Section guardrail | *You choose when and how much — on a schedule or when you tap Run now.* | `AUTO_ORGANIZE_GUARDRAIL` |
| Empty state | *Set up moves, top-ups, or save-offs — on a schedule or when you choose.* | `AUTO_ORGANIZE_EMPTY_BODY` |
| Manual-only frequency | **Manual only** | `auto_organize_type = 'manual'` |
| Manual card next-run line | **Runs when you choose** | `AUTO_ORGANIZE_MANUAL_NEXT_RUN_LABEL` |
| Manual cadence / default name | **Manual only** | `AUTO_ORGANIZE_MANUAL_CADENCE_SUMMARY` |
| Admin add CTA | **Add** | `AUTO_ORGANIZE_ADD_LABEL` |
| One configured Auto-bucket rule | Auto-bucket (card/editor) | **`auto_organizes`** row |
| Bucket + amount rows | lines | **`auto_organize_lines`** |
| One execution (cron or Run now) | run | **`auto_organize_runs`** row |
| FK on `transactions` | — | **`auto_organize_run_id`** |
| Local hour on due days | — | **`families.auto_organize_run_hour`** |
| Execute one | Run now / automatic run | **`run_auto_organize(auto_organize_id, …)`** |
| Cron entry point | — | **`run_due_auto_organizes()`** |
| Cron job name | — | **`run-due-auto-organizes`** |
| Future kind | — | **`auto_organize_kind`**: `organize` \| `top_up` \| `save_off` |
| save-off destination | — | **`destination_bucket_id`** (null = Unbucketed) |
| History actor (automatic) | **Scheduled** | `HISTORY_SCHEDULED_MOVE_LABEL` |
| Manual move dialog | **Set aside** / **Use from bucket** / **Move money** | unchanged |

**Say in UI:** organize your money, auto-bucket, days you choose.  
**Avoid in UI:** scheduled set-aside, organize Unbucketed, automation, auto-fund,
recurring transfer, rules, schedule (as a feature synonym — use auto-bucket).

User-entered names optional (“Payday”); default display from frequency when blank.

Manual one-off Unbucketed → bucket stays **`Set aside`** in the move dialog only — not an
`auto_organizes` table concern.

---

## Data model

Migrations `00000000000048_auto_organize.sql`, `00000000000049_auto_organize_cron.sql`,
`00000000000050_auto_organize_manual_runs_per_day.sql`, `00000000000058_auto_organize_kinds.sql`.

```text
families
  timezone text not null              -- IANA; default from first Auto-bucket setup
  auto_organize_run_hour smallint not null default 3   -- 0–23 local; when due-day runs fire

auto_organizes
  id uuid pk
  family_id uuid not null
  name text                    -- optional label ("Payday", etc.)
  paused boolean not null default false
  auto_organize_kind text not null default 'organize'  -- organize | top_up | save_off
  destination_bucket_id uuid   -- save_off only; null = sweep to Unbucketed
  auto_organize_type text not null  -- 'interval' | 'monthly'
  start_date date              -- interval Auto-bucket rules
  interval_count int           -- 1, 2, 3, 4, 6
  interval_unit text           -- 'week' | 'month'
  days_of_month int[]          -- monthly; 0 = last day
  created_by_member_id uuid
  created_at, updated_at
  -- v1 implicit auto_organize_kind = 'organize'; add column when Send Auto-bucket rules ship

auto_organize_lines
  id uuid pk
  auto_organize_id uuid not null references auto_organizes on delete cascade
  bucket_id uuid not null references buckets
  amount numeric(14,2) not null  -- organize/top_up: fixed or target; save_off: keep (>= 0)
  sort_order int not null

auto_organize_runs
  id uuid pk
  auto_organize_id uuid not null
  family_id uuid not null
  run_on date not null         -- local calendar date this run is for
  trigger text not null        -- 'scheduled' | 'manual'
  triggered_by_member_id uuid  -- null when scheduled
  status text not null         -- 'completed' | 'failed'
  error_message text
  created_at timestamptz

transactions
  auto_organize_run_id uuid null references auto_organize_runs(id)
```

Indexes / constraints:

- **Scheduled:** partial unique on `(auto_organize_id, run_on)` where `trigger = 'scheduled'` — at most one automatic run per local day.
- **Manual (Run now):** no daily cap — multiple runs on the same local day are allowed (confirm sheet shows last-run context when the rule has run before).
- `(family_id)` on `auto_organizes` and `auto_organize_runs` for RLS.

**`owner_member_id uuid null`** on `auto_organizes` (migration `00000000000076`) — null = household
pool, a member id = that kid's private scope. Indexed; cascades on member delete.

---

## RPCs

### `run_auto_organize(auto_organize_id, trigger, member_id?)`

`SECURITY DEFINER`. Callable by service role (scheduled) and admin (manual only).

1. Lock row; reject if **paused** (scheduled rules only — manual-only is never paused in UI and ignores stale `paused` on run).
2. Validate lines: buckets exist, family-pool scope, same `family_id`.
3. If any line invalid → record failed run or reject without partial moves.
4. Insert `auto_organize_runs` row.
5. For each line (by kind): `_auto_organize_apply_line` (organize/top_up) or
   `_auto_organize_sweep_line` (save_off); set `auto_organize_run_id` on each transaction.
6. Single transaction — all lines or none.

Manual: require `auth_role() = 'admin'` and set `triggered_by_member_id`.

### `run_due_auto_organizes(p_as_of timestamptz default now())`

Service role / cron only. For each non-paused Auto-bucket rule:

- Compute family **local date and hour** from `families.timezone`.
- If cadence matches **today’s local date**, `local_hour >= auto_organize_run_hour`,
  and no run yet for `(auto_organize_id, run_on)` (any trigger) →
  `run_auto_organize(..., 'scheduled', null)`.

### CRUD

Admin-only writes on `auto_organizes` + `auto_organize_lines` (RPC or RLS-gated tables). Admin + Shared read.

---

## Scheduler (cost & scale)

**Postgres-only** — no Edge Function invocations for the tick.

```sql
-- Hourly: on due days, first tick at or after auto_organize_run_hour (default 3 AM local)
select cron.schedule(
  'run-due-auto-organizes',
  '0 * * * *',
  $$ select public.run_due_auto_organizes(now()); $$
);
```

Enable `pg_cron` in migration. One job processes **all** families.

**Free tier:** pg_cron is $0 on all Supabase plans; hourly DB work helps avoid
7-day inactivity pause. Vercel unchanged (static SPA). See CONTEXT.md § Scaling.

At large scale: optional denormalized `next_run_on` column + index.

---

## UI — Buckets tab

Section **Auto-bucket** below Unbucketed card. Always show `AUTO_ORGANIZE_GUARDRAIL`
under the header (admin + Shared) so the feature is not confused with auto-rebalance
when the bank moves.

**Empty state (admin):** `AUTO_ORGANIZE_EMPTY_BODY` + **Add** CTA.

### Plan total (required)

Every Auto-bucket rule shows the **sum of all line amounts** prominently — that’s how people
verify they entered the right numbers (they often know the payday total before the
per-bucket split).

| Surface | Total |
| --- | --- |
| **Auto-bucket editor** | **Running total** updates as lines change; sticky/footer so it stays visible while scrolling lines. Label e.g. **Total per run · $1,240.00** |
| **Auto-bucket card** (admin + Shared) | Same total on every card — not buried in line list |
| **Run now** confirm sheet | Total + Current \| Move \| Will be grid per bucket and Unbucketed |
| **Review** step (before save) | *Deferred* — editor saves directly |

Optional context next to total: current **Unbucketed** (informational only — runs may
execute above Unbucketed per [Money rules](#money-rules)). Do not hide total behind an
expand/collapse.

### Shared (read-only)

Section hidden on the Buckets tab until an admin has created at least one
Auto-bucket rule. When visible: cards show name, cadence summary, next run (or paused
status), collapsible bucket breakdown (chevron), **total per run**, **Paused** badge
when paused. No Edit / Pause / Run now.

### Admin

Same cards + section **Add** CTA, **Edit**, **Pause / Resume** (scheduled rules only), **Run now** (disabled
when paused, with status copy explaining why).

### Kid (own scope)

A kid gets the **same authoring surface as an admin** — Add / Edit / Pause / Run now — but only
over **their own** Auto-bucket rules, buckets, and Unbucketed. The tab shows for a kid even when empty
(so they can create their first rule). Wiring: `BucketsPage` treats **admin or child** as an
author (`isAutoOrganizeAuthor`), passes `isChild` to `AutoOrganizeSection`, which derives
`canAuthor` and a `scopeOwnerId` (the kid's id) used to filter the editor/picker buckets and order
lines. Adults never see a kid's rules (RLS).

### Auto-bucket editor (Sheet)

1. Name (optional)
2. Lines: bucket + amount; **running total** in sticky footer ([Plan total](#plan-total-required))
3. Frequency: flat list (**Manual only**, **Every 2 weeks**, **Every week**, **Once a month**,
   **Twice a month**, **Every 2 / 3 / 4 / 6 months**) plus branching fields per
   [Auto-bucket model](#auto-bucket-model). **Manual only** hides schedule sub-fields and the editor next-run preview.
4. Family timezone (first Auto-bucket rule: default from browser; stored on `families`)
5. Save (no separate review step in v1)

### Run now

Confirm sheet: bucket lines + **total per run**, Unbucketed row in Current | Move | Will be
grid, consequential intro copy. Primary **Run now** / **Running…**. Last-run banner when
the rule has run before (amber + time when today; neutral date/time for older runs). Paused
Auto-bucket rules cannot Run now until **Resume**.

### Bucket polish (*deferred*)

Active Auto-bucket lines → subtle icon or “+$X in Auto-bucket” on bucket row (both roles
see hints on shared buckets).

---

## History

**No grouped/collapsed cards in v1.** Each line is a normal History row.

| Run type | Subtitle actor |
| --- | --- |
| Automatic (cron) | `Bucket move · Scheduled · {time}` |
| Run now | `Bucket move · by {name} · {time}` |
| Ordinary manual | unchanged |

Use `auto_organize_run_id` + run `trigger` to choose label. Transaction **note** shows
**{kind} · {rule name}** (e.g. `Auto top-up · Month-start refill`) for Auto-bucket runs.
Manual bucket moves without a stored note show **Set aside** / **Use from bucket** / **Move money**.

---

## Edge cases

| Case | Behavior |
| --- | --- |
| Bucket deleted | Sheet explains Auto-bucket block; **Remove and delete** clears lines (and empty Auto-bucket rules) then deletes bucket |
| Bucket renamed | Auto-bucket uses `bucket_id`; UI shows current name |
| Auto-bucket paused | Scheduled rules: no automatic or manual run until resumed; Shared sees **Paused** badge + status line. Manual-only: pause hidden; not applicable. |
| Cron / manual same day | Any run for `(auto_organize_id, run_on)` skips cron; multiple **manual** runs same day OK |
| Scheduled idempotency | Partial unique on `(auto_organize_id, run_on)` where `trigger = 'scheduled'` |
| Insufficient Unbucketed on run | **Allow**; Unbucketed goes red (all roles) |

---

## Testing

| Layer | Coverage |
| --- | --- |
| `tests/db/auto_organize.test.ts` | Happy manual run, cron idempotency, RLS read (member/child), member write denial, manual run denied for member/child of household rules, scheduled trigger denied for authenticated users, invalid bucket line, multiple manual runs/day, one scheduled run/day, manual run blocks cron same day, **top_up fill-to-target** (+ history note), **save_off to bucket and Unbucketed** (+ history note), **same-day sweep-before-fill order**, manual-only cron skip, zero-move run when all lines at target, **kid self-serve** (create + run own rule, virtual + linked), **kid save_off to own Unbucketed**, **kid rule invisible to admin/member**, **cross-kid run denial**, **non-owned-bucket line rejected**, **cron runs a kid rule attributed to the kid** |
| `src/lib/autoOrganize.test.ts` | Per-line move math, totals, active lines, save-off preview consistency |
| `src/lib/autoOrganizeCadence.test.ts` | Cadence matching, next-run labels, editor schedule summaries, run-now last-run context |
| `src/lib/historyTransactionNote.test.ts` | History note enrichment and manual-move defaults |
| `tests/db/move_money.test.ts` | Unbucketed → bucket over current Unbucketed (admin + child) |
| Seed | `auto-organize` scenario — *deferred* |
| Manual | Admin CRUD, pause/resume, Run now confirm; Shared read-only; History **Scheduled** |

---

## Implementation history

Shipped as one vertical slice on branch `feat/auto-organize` (migrations 48–50 + Buckets
tab UI). Original multi-PR sequence (move_money → schema → cron → UI slices) was
consolidated for family beta. Deferred items listed under [v1 scope](#v1-scope).

---

## Philosophy note

**Auto-bucket** is **user-configured automatic organization** — not auto-rebalance
when the bank moves. The app runs `move_money` on days the user chose; it does not
decide which bucket covers a charge. Red Unbucketed after a run is the same signal as
today. Shared read-only visibility lets a partner see what will be organized and
when, without triggering runs.
