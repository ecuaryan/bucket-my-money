# Plan — product & implementation spec

**Status:** PR 1 (foundation) and PR 2 (Plan tab) built. Still to come: PR 3
(link to Auto-bucket) and drag-to-reorder lines (the `reorder_plan_lines` RPC
exists; new lines append to the end of their section until the UI lands).
**One vocabulary:** customers see **Plan**; Postgres, RPCs, TypeScript and tests
use **`plan_*`**.
**Related:** [AUTO_ORGANIZE.md](./AUTO_ORGANIZE.md), [CONTEXT.md](../CONTEXT.md),
[BRAND.md](./BRAND.md).

---

## Why

A zero-based plan for the household's pay: every dollar of income gets a job
until **Unplanned** reaches $0. It's the household's agreement with itself about
money, made ahead of time, so partners are intentional, on the same page, and
spared frustration. It is **not** spending tracking; buckets and History already
do that.

**Unplanned vs Unbucketed.** Unbucketed is real money that isn't in a bucket.
Unplanned is income the plan hasn't given a job yet. The two names are
deliberately different words.

Partners review the plan together, each on their own phone, and agree out loud.
No approval flow is needed, but **live sync between phones is essential**.

### How households use a plan like this (the behavior to preserve)

- **A contract.** Partners treat the plan as an agreement between themselves
  and their money. Clear rules for spending and saving keep them intentional
  and avoid frustration.
- **Changed when life changes:** a new job, a raise, a new bill, a rate change.
  They adjust numbers together until nothing is unplanned. If one partner
  tweaks something alone, the other one checks it.
- **New job = wait for a stub.** After a pay change, people wait for the first
  one or two paychecks, then copy the real tax and benefit deductions in.
- **A survivor's map.** If one partner can't handle the money (death, illness),
  the plan tells the other one what pays itself, what goes out by bill pay, and
  what has to be paid by hand. That's why **Paid by** and line notes exist.
- **Only real lines.** Spreadsheet users leave unused rows at $0 because adding
  and removing rows is a pain. Plan makes both easy, so people keep only lines
  they use. ($0 is still allowed, for example a starter line not filled in yet.)
- **Spreadsheets feed Auto-bucket by hand.** A "should match the buckets total"
  check keeps a spreadsheet and an Auto-bucket rule in agreement. Linking
  replaces that check.
- **The many views are for insight**, such as the monthly cost of something
  paid yearly, not only for the math.
- **Paydays often land early.** Deposits can arrive a day or two before the
  official payday, and households differ on whether Auto-bucket should run on
  the early deposit or the official date. That's why run days stay on the rule.

## Who

| Role   | Plan tab | Edit |
| ------ | -------- | ---- |
| Admin  | Always   | Yes  |
| Shared | Once the plan has at least one line (like Auto-bucket, which appears once a rule exists) | No: view only, on purpose, to avoid accidental changes |
| Child  | Never    | No. Blocked in RLS, since the plan shows household income |

Kids don't need a Plan. Their buckets plus their own Auto-bucket rules already
cover one allowance split across a few buckets.

## Where

A tab on the Buckets page, ordered **Buckets · Plan · Auto-bucket · Bank**,
URL tab key `plan`. Buckets stays the main feature, and Plan sits right before
the Auto-bucket rule it feeds.

**Tab icons stay.** `SegmentedTabs` currently drops icons once there are more
than three tabs. Change it to **stack the icon above the label** instead
(icon-over-label, smaller label), so four tabs fit at 375px and keep their
icons. With three or fewer tabs it keeps today's icon-beside-label layout. The
change is in the shared component, so any four-tab bar gets it, including a
kid's Buckets · Auto-bucket · Bank · Bitcoin. Plan needs a `SegmentedTabIcons`
entry (a list/document icon). Update `SegmentedTabs.test.tsx` for the stacked
layout.

---

## The table

A spreadsheet-like table. **Line names are pinned on the left** and the numbers
scroll horizontally. **The column header and Unplanned are pinned at the top**,
and everything else scrolls.

### Columns

**Weekly · Every 2 weeks · Twice a month · Monthly · Yearly · %**

- Periods per year: 52 · 26 · 24 · 12 · 1. % is the share of total gross income.
- These labels are Plan's own. They avoid "bi-weekly" and "bi-monthly", which
  readers confuse. The add-line **Per** picker uses the same words.
- **View** button (the table's top-left corner) opens one sheet with:
  - **Compact** (off by default): smaller type and narrower columns, so about
    four columns fit on a phone instead of two. It stands in for pinch-zoom,
    which the app disables app-wide. Rows keep their 44px touch height.
  - **Column switches** (`SwitchToggle`, like Compact), all on by default. At least one column must stay
    visible. Hiding the input's column or the ⚡ column only hides it: the line
    stays editable from any visible column.
- View settings are a **per-person, per-device preference** in `localStorage`
  keyed by member, like Hide amounts (`hideAmountsStorage.ts`). They never
  change the plan, so they don't need a database table.

### One input per line

Each line stores **one typed amount in one unit**, which can be any column. The
admin types into whichever column fits: a bill under Monthly, a paycheck
deduction under Twice a month, charitable giving as 10 under %.

- The input cell uses the app's standard input style (`bg-zinc-950`, zinc-700
  ring, emerald outline on focus). Calculated cells are muted text. Shared
  members see the input value as brighter text, with no box.
- Tapping a calculated cell turns it into a focused input with its value
  selected, but nothing is stored until a new value is typed. Typing makes that
  column the line's input (see Math). Enter or tapping away commits.
- Inputs show a muted **$** prefix (or **%** suffix in the % column), so they
  read as money next to the formatted cells.

### Sections (replacing the color legend a spreadsheet would use)

Each section header shows its subtotal.

| Section      | What                                  | Money                         |
| ------------ | ------------------------------------- | ----------------------------- |
| **Income**   | One or more incomes                   | Gross pay                     |
| **Withheld** | Taxes, insurance, 401(k)              | Never reaches the bank        |
| **Bills**    | Mortgage, utilities, subscriptions, giving… | Stays in Unbucketed and is paid from there |
| **Buckets**  | Each line is one bucket               | Moved by the linked Auto-bucket rule |

Yearly bills paid by hand (auto insurance, cloud storage) are **Buckets**
lines: you save for them each run.

### Order: reads like a paycheck

1. **Unplanned** (pinned): Gross − (Withheld + Bills + Buckets). The goal is
   $0. It's green only when the exact yearly value is 0 (a tiny positive
   remainder also displays as $0.00 but isn't green), and red when negative.
2. **Income** section. Its subtotal *is* Gross, so there's no separate row.
3. **Withheld** section.
4. **Take-home** row: Gross − Withheld.
5. **Bills** section.
6. **Buckets** section.

Each total appears once, and there's no Allocated row (it's Gross − Unplanned).

### First visit and the empty plan

- The plan is **empty** when it has no lines. The empty state is one line,
  "Start your plan with your pay.", with one action, **Add income**. Shared
  members don't see the tab until the plan has a line.
- **Add income** opens a form sheet with Name, Gross amount and **Per**
  (Weekly / Every 2 weeks / Twice a month / Monthly / Yearly). **Add** stays
  disabled until Name and amount are filled.
- Adding the first income also adds starter **Withheld** lines at $0 in the
  income's unit: Federal income tax, State income tax, Social Security,
  Medicare, Medical insurance, Dental insurance, Vision insurance and 401(k).
  The bar is "on most pay stubs", so HSA, FSA, local tax, life and disability
  are left for **+**. Starter lines can be deleted.
- After that, each section header's **+** opens the same form sheet for that
  section. Lines outside Income also offer %, and Buckets lines add the bucket
  picker.
- There's deliberately no "start from an existing Auto-bucket rule" import.
  Only households that predate Plan would use it, it saves one round of typing,
  and multiple rules would need a picker.
- Deleting the last income makes Gross $0: % lines become $0 and Unplanned goes
  negative by everything else. Nothing is blocked.

### Lines

- **Fields:** section, amount + unit, sort order (drag to reorder within a
  section via a `reorder_plan_lines` RPC, like `reorder_buckets`).
- **Names are the user's own**, income included, 1–40 characters.
  - A Buckets line has **no name of its own**: it shows its bucket's name, and
    renaming it there renames the bucket through the existing bucket rename
    path (same rules: 1–40 characters, unique per owner).
  - Long names wrap to two lines in the pinned column, and that row grows.
    Anything longer ends in "…".
- **Amounts:** 0 or more, up to 2 decimals. Money is capped at the
  `numeric(14,2)` range Auto-bucket uses; % is 0–100. Income lines can't use %,
  and the database enforces it.
- **% lines** are a share of **total gross**. A deduction that's a percentage of
  one earner's pay should be typed as the dollar amount from that earner's stub.
- **Buckets lines** pick a family-pool bucket with one picker whose last option
  is **New bucket** (reuses the create-bucket sheet). One plan line per bucket.
  **Deleting a bucket deletes its plan line** (`on delete cascade`). A bucket
  line without a bucket would be meaningless.
- **Paid by** (Bills and Buckets lines, optional): **Autopay**, **Bill pay** or
  **By hand**, shown as a small label under the line name. A Buckets line can
  be By hand too, for example auto insurance paid once a year from its bucket.
- **Notes.** A thing has one note, never two. A Buckets line shows and edits its
  bucket's existing `notes`. Other lines have their own `notes` (same column
  name as buckets), holding where and how a bill is paid, the website, and
  timing. Shared members can read notes, so **no passwords**. Make the field
  label say "Note", and keep secrets out of examples. A small icon after the
  name marks lines with a note.
- **Tapping a line's name** opens its sheet. For admins it's titled **Edit
  line**, with Name (Bucket name on bucket lines), Paid by, Note, **Save** and
  **Delete line**. Changes apply on Save, like `BucketNotesSheet`. Shared
  members get a read-only sheet titled with the line's name, showing Paid by
  and the note.
- **Delete line** confirms with `ConfirmSheet`: "Delete <name>?" plus one
  sentence. On a bucket line: "The bucket and its money stay." On other lines:
  "It comes off the plan."
- **Remote changes flash.** When the *other* person changes a line, its row
  glows emerald and fades over about 1.5s (no animation under reduced motion).
  Your own edits don't flash. The client tracks glowing row ids from realtime
  events.
- **Concurrent edits:** every plan RPC locks the `plans` row (`for update`), so
  syncs run one after another. The last write wins per line.
- **Sync vs a running rule:** an Auto-bucket run already locks its
  `auto_organizes` row. The sync takes the same lock before rewriting lines, so
  a run sees either all old or all new lines, never half. **Lock order is always
  `plans` → `auto_organizes`** in every function (plan RPCs, `save_auto_organize`,
  `delete_bucket`), so they can't deadlock.

### Accessibility

- The table uses real table semantics (`role="table"`, `row`, `columnheader`,
  `rowheader`, `cell`, or a native `<table>` if sticky layout allows), so a
  screen reader announces "Grocery, Monthly, $866.66".
- Inputs are labeled "<line>, <column>". Section **+** buttons are labeled "Add
  line to <section>". The ⚡ header is a button labeled with the rule's name.
- Tap targets are at least 44px. Focus is visible (emerald outline). Enter
  commits, and Escape cancels an edit.
- Colors that carry meaning (red or green Unplanned) are paired with the number
  and sign, never color alone.

### Math

- **No floating point.** JavaScript numbers can't hold most cent values exactly
  (0.1 + 0.2 ≠ 0.3), so Plan math uses integers only:
  - Money is stored as **integer cents** (`amount_cents`) and percentages as
    **integer basis points** (`percent_bp`, 10% = 1000).
  - Everything converts to one exact integer unit, **ten-thousandths of a cent
    per year**: a money line is `amount_cents × periods(unit) × 10000`, and a %
    line is `gross_yearly_cents × percent_bp`. Sums and Unplanned are exact
    integer adds.
  - Divide **once, at the end**, with a **true floor** helper (`floorDiv` in
    TypeScript, `plan_floor_div()` in SQL). The built-in `BigInt /` and
    Postgres `div()` truncate toward zero, which is wrong for negatives.
  - TypeScript uses `BigInt`. SQL uses `bigint`/`numeric`.
- **Always floor**, negatives too. An over-allocation shows its full amount
  (−$12.346 shows −$12.35), and a positive remainder never overstates what's
  free.
- **Subtotals.** A section subtotal is the floor of the exact sum. The one
  exception is the column that feeds the linked rule: there, the Buckets
  subtotal is the **sum of the floored per-run line amounts**, which is exactly
  what the rule moves. That keeps "shown = moved" true to the cent.
- **One formula, two places.** Per-run amounts are computed in SQL (the sync)
  and in TypeScript (the display). Shared test vectors run in both
  `src/**/*.test.ts` and `tests/db/`.
- **Why round down:** Auto-bucket moves whole cents, so a converted amount
  like $47 every 2 weeks becomes $50.9166 per twice-monthly run and must round.
  Rounding down never moves more than planned. The leftover fraction of a cent
  stays in Unbucketed, a few dollars a year at most. Carrying remainders between
  runs was rejected: it adds complexity to save pennies and makes amounts vary
  from run to run.
- **Hide amounts:** every Plan number, % included, respects Hide amounts and the
  Peek FAB.

---

## Link to Auto-bucket

Auto-bucket stays a **standalone feature**. The link is a convenience: it ends
re-typing amounts into a rule after every plan change.

- The plan links to **one** rule, picked by an admin, or none. Other rules are
  untouched. Unlinking keeps the rule and its current lines as they are.
- **Linkable rules:** household (`owner_member_id is null`; never a kid's rule,
  and the SECURITY DEFINER link RPC checks this itself), `auto_organize_kind =
  'organize'`, and a cadence that matches a Plan column:

  | Rule cadence                        | Runs/year | Plan column     |
  | ----------------------------------- | --------- | --------------- |
  | Interval, every 1 week              | 52        | Weekly          |
  | Interval, every 2 weeks             | 26        | Every 2 weeks   |
  | Monthly on 1 day (incl. last day)   | 12        | Monthly         |
  | Monthly on 2 days                   | 24        | Twice a month   |

  Other cadences (every 3+ weeks, every N months, 3+ days a month, Manual only)
  can't be linked, and the rule picker shows them disabled. While a rule is
  linked, its schedule picker offers only these four.
- **The plan sets the rule's lines; the rule keeps its own run days.** Whether
  to run on an early deposit or the official payday is the household's call.
- **Amount per run** = `floor_cent(yearly ÷ runs per year)`, from that column.
  Only Buckets lines with a per-run amount of $0.01 or more are sent. A linked
  rule with no qualifying lines keeps zero lines, and its runs move nothing.
- **All writes are server-side and atomic.** Today the Auto-bucket editor saves
  with three separate client writes (`saveAutoOrganize` in
  `src/lib/autoOrganize.ts`: update the rule, delete its lines, insert lines),
  and `auto_organize_lines` is admin-writable through RLS. Linking needs:
  1. A `save_auto_organize` SECURITY DEFINER RPC that replaces those writes.
     For a linked rule it ignores incoming lines and re-syncs from the plan,
     so a schedule change recomputes amounts in the same transaction.
  2. Plan-edit RPCs that rewrite the linked rule's lines in the same
     transaction as the plan change.
  3. A guard (trigger or RLS policy) that rejects direct line writes on a
     linked rule, so a stale editor or another admin can't overwrite them.
- **Bucket deletes:** `delete_bucket` currently deletes any rule left with no
  lines. It must skip a rule that's linked to a plan, so deleting the last
  bucket line doesn't silently delete the linked rule.
- **In Plan:** the linked column's header is green with ⚡. Tapping it opens a
  sheet with the rule's name, schedule, amount per run (live), bucket count and
  **Open in Auto-bucket**. Columns keep their fixed order.
- **In Auto-bucket:** the linked rule shows a **PLAN** chip, its bucket list is
  read-only with **Set in Plan**, and its name, schedule, Pause and Run now
  stay editable.
- Deleting the linked rule clears the link (`on delete set null`). The plan is
  unaffected.

---

## Schema sketch

Names are provisional. **Every table has its own `family_id`**: RLS and
Realtime filters need it on the table itself.

- `plans`: `family_id` unique, `auto_organize_id` nullable and unique
  (`on delete set null`), `updated_at`.
- `plan_lines`: `family_id`, `plan_id`, `section`
  (`income|withheld|bills|buckets`), `name` (null on bucket lines), `unit`
  (`week|two_weeks|twice_month|month|year|percent`), `amount_cents` bigint *or*
  `percent_bp` int (exactly one, matching `unit`), `bucket_id` (buckets
  section only, unique per plan, `on delete cascade`), `paid_by` nullable
  (`autopay|bill_pay|by_hand`; bills and buckets only), `notes` nullable (null
  on bucket lines), `sort_order`. Check constraints enforce the section rules
  and bounds.

**Security:** RLS select for admin and shared members of the family, never
child. All writes go through SECURITY DEFINER RPCs with admin checks. Write
explicit `service_role` grants (hosted doesn't auto-grant). Add `plans` and
`plan_lines` to the `supabase_realtime` publication (replica identity full).
The Plan tab's channel also watches `buckets` (names, notes, deletes) and
`auto_organizes` (the linked rule's schedule) for this family.

## Copy, docs & privacy

- Strings go in `src/lib/brand/plan.ts`, with no subtitles or helper text (see
  BRAND.md § Voice).
- Add a short Plan paragraph to the BRAND.md product narrative and CONTEXT.md,
  and a Plan row to AGENTS.md's "Where to put new code" table. Rename
  AUTO_ORGANIZE.md's "Plan total (required)" heading so it doesn't clash.
- Update `site/src/pages/privacy.astro`: the app now stores household income,
  planned amounts and plan notes.
- Consider adding the Plan tab to the PWA screenshots (`npm run pwa:screenshots`).

## Tests

- Unit: conversions, `floorDiv` (including negatives), runs per year for the
  four linkable cadences, Unplanned exactly 0, the linked-column subtotal
  equalling the sum of per-run lines, and shared vectors.
- `tests/db/plan.test.ts`:
  - children can't read plan tables; shared members can read but not write
  - sync rewrites only the linked rule
  - a schedule change through `save_auto_organize` re-syncs
  - direct line writes on a linked rule are rejected
  - kid, non-`organize` and unsupported-cadence rules can't be linked
  - deleting a bucket removes its line and keeps the linked rule
  - $0 lines are skipped
  - same vectors as the unit tests

- **e2e smoke** (`tests/e2e/plan.spec.ts`, Playwright): add an income, add a
  bucket line, link a rule, and check the rule's amount in Auto-bucket matches
  the ⚡ column. Then edit the line and check both update.
- **Regression:** moving the Auto-bucket editor onto `save_auto_organize` must
  keep every existing `auto_organize*.test.ts` passing unchanged. Add tests
  that unlinked rules behave exactly as before.

## Engineering notes

- Follow existing patterns: data loading like the Buckets tab's (no new cache
  layer), realtime via a route-scoped channel, brand strings in
  `src/lib/brand/plan.ts`, and math in one pure module (`src/lib/planMath.ts`)
  with no React or Supabase imports, so it's trivially unit-testable.
- Keep components small: `PlanTab`, `PlanTable`, `PlanLineSheet`,
  `PlanAddLineSheet`, `PlanViewSheet`, `PlanLinkedRuleSheet`.
- The spec ships in PR 1 and is kept current as later PRs land.

## Rollout

No feature flag. Plan ships to every household. It's a new tab, and nothing
changes for households that never open it.

## Suggested PRs

1. **Foundation:** schema, RLS, grants, RPCs, `floorDiv` math in SQL and
   TypeScript with shared vectors, `tests/db/plan.test.ts`.
2. **Plan tab, read and edit:** tab, table, sections, inputs, line sheet, add,
   delete, reorder, bucket picker, View sheet, realtime and flash, Hide amounts,
   privacy page, docs.
3. **Link to Auto-bucket:** `save_auto_organize` RPC (the editor moves onto it),
   line-write guard, `delete_bucket` change, link picker, ⚡ column and sheet,
   PLAN chip and locked lines.

## Out of scope

- Approval or sign-off flow, and a change log of plan edits.
- Kid Plans.
- Calculated lines beyond %, such as a loan payment from balance × rate; type it
  as a monthly number.
- Linking to more than one rule, or to cadences without a Plan column.
- Comparing actual spending against the plan.
- An "accounts to remember" (estate) list: the brokerages, retirement accounts
  and wallets a partner would need to know about. It's a separate future
  feature, and it must be visible to shared members (the partner is who it's
  for), so it can't live in Admin.
