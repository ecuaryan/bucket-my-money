import { supabase } from '@/lib/supabase'
import {
  type AutoOrganizeKind,
  AUTO_ORGANIZE_NOW_SET_IN_PLAN,
  AUTO_ORGANIZE_SWEEP_THEN_FILL_SAVEOFF_NOTE,
  AUTO_ORGANIZE_SWEEP_THEN_FILL_TOPUP_NOTE,
} from '@/lib/brand'
import type { Database } from '@/types/database'
import {
  computeNextRunOn,
  formatCadenceSummary,
  formatLastRunLabel,
  formatNextRunLabelForCadence,
  type AutoOrganizeCadence,
} from '@/lib/autoOrganizeCadence'
import { isValidIanaTimezone } from '@/lib/familyTimezones'

export type { AutoOrganizeKind }

type AutoOrganizeRow = Database['public']['Tables']['auto_organizes']['Row']
type AutoOrganizeLineRow = Database['public']['Tables']['auto_organize_lines']['Row']
type AutoOrganizeRunRow = Database['public']['Tables']['auto_organize_runs']['Row']

export type AutoOrganizeLineInput = {
  bucketId: string
  amount: number
}

export type AutoOrganizeInput = {
  id?: string
  kind: AutoOrganizeKind
  name: string | null
  paused: boolean
  cadence: AutoOrganizeCadence
  lines: AutoOrganizeLineInput[]
  /** save_off only: null = sweep to Unbucketed */
  destinationBucketId: string | null
  /** null = household pool rule; a member id = that kid's own rule. Set on create only. */
  ownerMemberId: string | null
  familyTimezone: string
  /**
   * The Plan sets this rule's lines (docs/PLAN.md): save leaves them alone.
   * The database re-syncs them when the schedule changes and refuses any
   * other write, so a stale editor can't overwrite them.
   */
  linkedToPlan?: boolean
}

export type AutoOrganizeLineWithDetails = AutoOrganizeLineRow & {
  bucket_name: string | null
  bucket_allocated_amount: number | null
}

export type AutoOrganizeWithDetails = AutoOrganizeRow & {
  lines: AutoOrganizeLineWithDetails[]
  lastRun: Pick<
    AutoOrganizeRunRow,
    'id' | 'status' | 'run_on' | 'trigger' | 'created_at'
  > | null
  lastRunLabel: string | null
  /** Any run (manual or scheduled) on the family's local calendar today. */
  hasRunToday: boolean
  /** Local run_on dates with an existing run (matches cron idempotency). */
  occupiedRunOnDates: readonly string[]
  totalPerRun: number
  /** True when totalPerRun is computed from current balances (top_up / save_off). */
  totalIsEstimate: boolean
  cadenceSummary: string
  nextRunLabel: string
  familyTimezone: string
  destination_bucket_name: string | null
}

/** Per-line move amount at run time (matches server logic). */
export function computeLineMoveAmount(
  kind: AutoOrganizeKind,
  lineAmount: number,
  bucketBalance: number,
): number {
  switch (kind) {
    case 'top_up':
      return Math.max(0, lineAmount - bucketBalance)
    case 'save_off':
      return Math.max(0, bucketBalance - lineAmount)
    default:
      return lineAmount
  }
}

type AutoOrganizeLineBalanceFields = {
  bucket_id: string
  amount: number | string
  bucket_allocated_amount?: number | null
}

/** Move amount for one line if the rule ran now (matches server). */
export function autoOrganizeLineMoveAtRun(
  kind: AutoOrganizeKind,
  line: AutoOrganizeLineBalanceFields,
  balanceById?: ReadonlyMap<string, number>,
): number {
  const amount = Number(line.amount)
  if (!Number.isFinite(amount) || amount < 0) return 0
  if (kind === 'organize') return amount > 0 ? amount : 0
  if (kind === 'top_up' && amount <= 0) return 0
  const balance = resolveAutoOrganizeLineBalance(line, balanceById)
  return computeLineMoveAmount(kind, amount, balance)
}

export function resolveAutoOrganizeLineBalance(
  line: { bucket_id: string; bucket_allocated_amount?: number | null },
  balanceById?: ReadonlyMap<string, number>,
): number {
  if (balanceById?.has(line.bucket_id)) {
    return balanceById.get(line.bucket_id) ?? 0
  }
  return Number(line.bucket_allocated_amount ?? 0)
}

export function computeTotalPerRun(
  kind: AutoOrganizeKind,
  lines: ReadonlyArray<{
    bucket_id?: string
    amount: number | string
    bucket_allocated_amount?: number | null
  }>,
  balanceById?: ReadonlyMap<string, number>,
): { total: number; isEstimate: boolean } {
  const isEstimate = kind === 'top_up' || kind === 'save_off'
  let total = 0
  for (const line of lines) {
    if (!line.bucket_id) {
      const amount = Number(line.amount)
      if (!Number.isFinite(amount) || amount <= 0) continue
      if (kind === 'organize') total += amount
      continue
    }
    total += autoOrganizeLineMoveAtRun(
      kind,
      {
        bucket_id: line.bucket_id,
        amount: line.amount,
        bucket_allocated_amount: line.bucket_allocated_amount,
      },
      balanceById,
    )
  }
  return { total, isEstimate }
}

/** Local calendar date `YYYY-MM-DD` in the given IANA timezone. */
export function localTodayIso(
  timeZone: string,
  from: Date = new Date(),
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(from)
}

export function autoOrganizeHasRunOnDate(
  runs: ReadonlyArray<Pick<AutoOrganizeRunRow, 'run_on'>>,
  runOn: string,
): boolean {
  return runs.some((run) => run.run_on === runOn)
}

/** Lines that would move on Run now (execution preview). Card breakdown uses all configured lines. */
export function activeAutoOrganizeLines(
  lines: AutoOrganizeWithDetails['lines'],
  kind: AutoOrganizeKind = 'organize',
  balanceById?: ReadonlyMap<string, number>,
): AutoOrganizeWithDetails['lines'] {
  return lines.filter(
    (line) => autoOrganizeLineMoveAtRun(kind, line, balanceById) > 0,
  )
}

/**
 * Match Buckets tab order within a scope. `scopeOwnerId` is the auto-organize
 * owner: null for a household rule (family-pool buckets), a member id for a
 * kid's own rule (that kid's buckets).
 */
export function orderAutoOrganizeLinesByBuckets<
  T extends { bucket_id: string; amount: string | number },
>(
  lines: readonly T[],
  buckets: ReadonlyArray<{ id: string; owner_member_id: string | null }>,
  scopeOwnerId: string | null = null,
): T[] {
  const order = new Map(
    buckets
      .filter((bucket) => bucket.owner_member_id === scopeOwnerId)
      .map((bucket, index) => [bucket.id, index]),
  )
  return [...lines].sort(
    (a, b) =>
      (order.get(a.bucket_id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.bucket_id) ?? Number.MAX_SAFE_INTEGER),
  )
}

/** Prefer live bucket names from the Buckets tab over stale fetch joins. */
export function resolveAutoOrganizeLineBucketName(
  line: { bucket_id: string; bucket_name: string | null },
  bucketNamesById: ReadonlyMap<string, string>,
): string {
  return bucketNamesById.get(line.bucket_id) ?? line.bucket_name?.trim() ?? 'Bucket'
}

export async function fetchFamilyTimezone(): Promise<string> {
  const { data, error } = await supabase
    .from('families')
    .select('timezone')
    .maybeSingle()
  if (error) throw error
  return data?.timezone ?? 'UTC'
}

export async function updateFamilyTimezone(timezone: string): Promise<void> {
  const { data: family, error: readError } = await supabase
    .from('families')
    .select('id')
    .maybeSingle()
  if (readError) throw readError
  if (!family) {
    throw new Error('Session expired. Please sign in again.')
  }
  const { error } = await supabase
    .from('families')
    .update({ timezone })
    .eq('id', family.id)
  if (error) throw error
}

export async function fetchAutoOrganizes(): Promise<AutoOrganizeWithDetails[]> {
  const [{ data: rows, error }, { data: family, error: familyError }] =
    await Promise.all([
      supabase
        .from('auto_organizes')
        .select(
          `*,
          auto_organize_lines (
            *,
            buckets ( name, allocated_amount )
          ),
          auto_organize_runs ( id, status, run_on, trigger, created_at ),
          destination_bucket:buckets!auto_organizes_destination_bucket_id_fkey ( name )`,
        )
        .order('created_at', { ascending: false }),
      supabase.from('families').select('timezone').maybeSingle(),
    ])
  if (error) throw error
  if (familyError) throw familyError

  const timeZone = family?.timezone ?? 'UTC'

  return (rows ?? []).map((row) => {
    const {
      auto_organize_lines: nestedLines,
      auto_organize_runs: nestedRuns,
      destination_bucket: destBucket,
      ...base
    } = row
    const kind = (base.auto_organize_kind ?? 'organize') as AutoOrganizeKind
    const lines = (nestedLines ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => {
        const bucket = (line as { buckets?: { name: string; allocated_amount: number | string } | null })
          .buckets
        return {
          ...line,
          bucket_name: bucket?.name ?? null,
          bucket_allocated_amount:
            bucket?.allocated_amount != null
              ? Number(bucket.allocated_amount)
              : null,
        }
      })
    const runs = (nestedRuns ?? [])
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    const lastSuccessfulRun =
      runs
        .filter((run) => run.status === 'completed')
        .sort((a, b) => {
          const byDate = b.run_on.localeCompare(a.run_on)
          if (byDate !== 0) return byDate
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        })[0] ?? null
    const cadence: AutoOrganizeCadence = {
      autoOrganizeType: row.auto_organize_type as AutoOrganizeCadence['autoOrganizeType'],
      startDate: row.start_date,
      intervalCount: row.interval_count,
      intervalUnit: row.interval_unit as AutoOrganizeCadence['intervalUnit'],
      daysOfMonth: row.days_of_month,
    }
    const occupiedRunOnDates = runs.map((run) => run.run_on)
    const nextRunOn = computeNextRunOn(cadence, timeZone, new Date(), {
      skipRunOnDates: occupiedRunOnDates,
    })
    const todayIso = localTodayIso(timeZone)
    const { total, isEstimate } = computeTotalPerRun(kind, lines)
    const destNested = destBucket as { name: string } | null
    return {
      ...base,
      auto_organize_kind: kind,
      lines,
      lastRun: lastSuccessfulRun,
      lastRunLabel: formatLastRunLabel(lastSuccessfulRun?.run_on ?? null),
      hasRunToday: autoOrganizeHasRunOnDate(runs, todayIso),
      occupiedRunOnDates,
      totalPerRun: total,
      totalIsEstimate: isEstimate,
      cadenceSummary: formatCadenceSummary(cadence),
      nextRunLabel: formatNextRunLabelForCadence(cadence, nextRunOn),
      familyTimezone: timeZone,
      destination_bucket_name: destNested?.name ?? null,
    }
  })
}

export async function saveAutoOrganize(
  input: AutoOrganizeInput,
  createdByMemberId: string,
): Promise<string> {
  const payload = {
    name: input.name?.trim() || null,
    paused:
      input.cadence.autoOrganizeType === 'manual' ? false : input.paused,
    auto_organize_kind: input.kind,
    destination_bucket_id:
      input.kind === 'save_off' ? input.destinationBucketId : null,
    auto_organize_type: input.cadence.autoOrganizeType,
    start_date:
      input.cadence.autoOrganizeType === 'interval'
        ? input.cadence.startDate
        : null,
    interval_count:
      input.cadence.autoOrganizeType === 'interval'
        ? input.cadence.intervalCount
        : null,
    interval_unit:
      input.cadence.autoOrganizeType === 'interval'
        ? input.cadence.intervalUnit
        : null,
    days_of_month:
      input.cadence.autoOrganizeType === 'monthly'
        ? input.cadence.daysOfMonth
        : null,
    updated_at: new Date().toISOString(),
  }

  let autoOrganizeId = input.id

  // The Plan may have linked this rule since the editor opened: its lines are
  // the plan's now. Stop before saving anything rather than half-save.
  if (autoOrganizeId && !input.linkedToPlan) {
    const { data: plan } = await supabase
      .from('plans')
      .select('auto_organize_id')
      .maybeSingle()
    if (plan?.auto_organize_id === autoOrganizeId) {
      throw new Error(AUTO_ORGANIZE_NOW_SET_IN_PLAN)
    }
  }

  if (autoOrganizeId) {
    const { error } = await supabase
      .from('auto_organizes')
      .update(payload)
      .eq('id', autoOrganizeId)
    if (error) throw error
    if (!input.linkedToPlan) {
      const { error: deleteLinesError } = await supabase
        .from('auto_organize_lines')
        .delete()
        .eq('auto_organize_id', autoOrganizeId)
      if (deleteLinesError) throw deleteLinesError
    }
  } else {
    const { data: family, error: familyReadError } = await supabase
      .from('families')
      .select('id')
      .maybeSingle()
    if (familyReadError) throw familyReadError
    if (!family) {
      throw new Error('Session expired. Please sign in again.')
    }
    const { data, error } = await supabase
      .from('auto_organizes')
      .insert({
        ...payload,
        family_id: family.id,
        owner_member_id: input.ownerMemberId,
        created_by_member_id: createdByMemberId,
      })
      .select('id')
      .single()
    if (error) throw error
    autoOrganizeId = data.id
  }

  if (!input.linkedToPlan) {
    const { error: linesError } = await supabase.from('auto_organize_lines').insert(
      input.lines.map((line, index) => ({
        auto_organize_id: autoOrganizeId!,
        bucket_id: line.bucketId,
        amount: line.amount,
        sort_order: index,
      })),
    )
    if (linesError) throw linesError
  }

  if (!isValidIanaTimezone(input.familyTimezone)) {
    throw new Error('Invalid timezone.')
  }
  await updateFamilyTimezone(input.familyTimezone)
  return autoOrganizeId!
}

export async function setAutoOrganizePaused(
  id: string,
  paused: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('auto_organizes')
    .update({ paused, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteAutoOrganize(id: string): Promise<void> {
  const { error } = await supabase.from('auto_organizes').delete().eq('id', id)
  if (error) throw error
}

/** Auto-organize that references a bucket (blocks delete until line removed). */
export type AutoOrganizeBucketRef = {
  id: string
  name: string
  autoOrganizeType: AutoOrganizeRow['auto_organize_type']
}

export type AutoOrganizeNameFields = Pick<
  AutoOrganizeRow,
  | 'name'
  | 'auto_organize_type'
  | 'start_date'
  | 'interval_count'
  | 'interval_unit'
  | 'days_of_month'
>

/** Card title: custom name, else cadence summary (same as AutoOrganizeSection). */
export function autoOrganizeDisplayName(row: AutoOrganizeNameFields): string {
  const trimmed = row.name?.trim()
  if (trimmed) return trimmed
  const cadence: AutoOrganizeCadence = {
    autoOrganizeType:
      row.auto_organize_type as AutoOrganizeCadence['autoOrganizeType'],
    startDate: row.start_date,
    intervalCount: row.interval_count,
    intervalUnit: row.interval_unit as AutoOrganizeCadence['intervalUnit'],
    daysOfMonth: row.days_of_month,
  }
  return formatCadenceSummary(cadence)
}

/** When several rules share a label, append (1), (2), … for the delete sheet list. */
export function disambiguateAutoOrganizeLabels(
  refs: AutoOrganizeBucketRef[],
): AutoOrganizeBucketRef[] {
  const labelCounts = new Map<string, number>()
  for (const ref of refs) {
    labelCounts.set(ref.name, (labelCounts.get(ref.name) ?? 0) + 1)
  }
  const labelIndex = new Map<string, number>()
  return refs.map((ref) => {
    if ((labelCounts.get(ref.name) ?? 0) <= 1) return ref
    const next = (labelIndex.get(ref.name) ?? 0) + 1
    labelIndex.set(ref.name, next)
    return { ...ref, name: `${ref.name} (${next})` }
  })
}

export async function fetchAutoOrganizesUsingBucket(
  bucketId: string,
): Promise<AutoOrganizeBucketRef[]> {
  const [{ data: lineRefs, error: lineError }, { data: destRefs, error: destError }] =
    await Promise.all([
      supabase
        .from('auto_organize_lines')
        .select(
          `auto_organize_id,
          auto_organizes (
            name,
            auto_organize_type,
            start_date,
            interval_count,
            interval_unit,
            days_of_month
          )`,
        )
        .eq('bucket_id', bucketId),
      supabase
        .from('auto_organizes')
        .select(
          `id,
          name,
          auto_organize_type,
          start_date,
          interval_count,
          interval_unit,
          days_of_month`,
        )
        .eq('destination_bucket_id', bucketId),
    ])
  if (lineError) throw lineError
  if (destError) throw destError

  const byId = new Map<string, AutoOrganizeBucketRef>()
  for (const row of lineRefs ?? []) {
    const nested = row.auto_organizes as AutoOrganizeNameFields | null
    if (!nested) continue
    byId.set(row.auto_organize_id, {
      id: row.auto_organize_id,
      name: autoOrganizeDisplayName(nested),
      autoOrganizeType: nested.auto_organize_type,
    })
  }
  for (const row of destRefs ?? []) {
    byId.set(row.id, {
      id: row.id,
      name: autoOrganizeDisplayName(row),
      autoOrganizeType: row.auto_organize_type,
    })
  }
  return disambiguateAutoOrganizeLabels([...byId.values()])
}

export async function runAutoOrganizeNow(
  autoOrganizeId: string,
  memberId: string,
): Promise<void> {
  const { error } = await supabase.rpc('run_auto_organize', {
    p_auto_organize_id: autoOrganizeId,
    p_trigger: 'manual',
    p_triggered_by_member_id: memberId,
  })
  if (error) throw error
}

export function defaultBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Save-off source buckets that are also top-up/organize destinations elsewhere. */
export function bucketsAlsoInFillRulesElsewhere(
  rows: ReadonlyArray<AutoOrganizeWithDetails>,
  sourceBucketIds: ReadonlySet<string>,
): Set<string> {
  const fillTargets = new Set<string>()
  for (const row of rows) {
    if (row.auto_organize_kind === 'organize' || row.auto_organize_kind === 'top_up') {
      for (const line of row.lines) {
        if (Number(line.amount) > 0) fillTargets.add(line.bucket_id)
      }
    }
  }
  const overlap = new Set<string>()
  for (const id of sourceBucketIds) {
    if (fillTargets.has(id)) overlap.add(id)
  }
  return overlap
}

/** Top-up/organize buckets that are also save-off sources elsewhere. */
export function bucketsAlsoInSaveOffSourcesElsewhere(
  rows: ReadonlyArray<AutoOrganizeWithDetails>,
  targetBucketIds: ReadonlySet<string>,
): Set<string> {
  const saveOffSources = new Set<string>()
  for (const row of rows) {
    if (row.auto_organize_kind !== 'save_off') continue
    for (const line of row.lines) {
      saveOffSources.add(line.bucket_id)
    }
  }
  const overlap = new Set<string>()
  for (const id of targetBucketIds) {
    if (saveOffSources.has(id)) overlap.add(id)
  }
  return overlap
}

/** @deprecated use bucketsAlsoInFillRulesElsewhere or bucketsAlsoInSaveOffSourcesElsewhere */
export function bucketsWithSweepThenFillNote(
  rows: ReadonlyArray<AutoOrganizeWithDetails>,
  sourceBucketIds: ReadonlySet<string>,
): Set<string> {
  return bucketsAlsoInFillRulesElsewhere(rows, sourceBucketIds)
}

function bucketInFillRule(row: AutoOrganizeWithDetails, bucketId: string): boolean {
  if (row.auto_organize_kind !== 'organize' && row.auto_organize_kind !== 'top_up') {
    return false
  }
  return row.lines.some(
    (line) => line.bucket_id === bucketId && Number(line.amount) > 0,
  )
}

function bucketInSaveOffRule(row: AutoOrganizeWithDetails, bucketId: string): boolean {
  if (row.auto_organize_kind !== 'save_off') return false
  return row.lines.some((line) => line.bucket_id === bucketId)
}

/** Scheduled sweep-then-fill overlap notes per bucket (hidden when overlap is manual-only). */
export function sweepThenFillNotesByBucket(
  rows: ReadonlyArray<AutoOrganizeWithDetails>,
  bucketIds: ReadonlySet<string>,
  editingKind: AutoOrganizeKind,
  currentIsManual: boolean,
  currentRuleId: string | null,
): Map<string, string> {
  const notes = new Map<string, string>()
  for (const bucketId of bucketIds) {
    const note = sweepThenFillNoteForBucket(
      rows,
      bucketId,
      editingKind,
      currentIsManual,
      currentRuleId,
    )
    if (note) notes.set(bucketId, note)
  }
  return notes
}

function sweepThenFillNoteForBucket(
  rows: ReadonlyArray<AutoOrganizeWithDetails>,
  bucketId: string,
  editingKind: AutoOrganizeKind,
  currentIsManual: boolean,
  currentRuleId: string | null,
): string | null {
  if (editingKind === 'save_off') {
    const overlapping = rows.filter(
      (row) => row.id !== currentRuleId && bucketInFillRule(row, bucketId),
    )
    if (overlapping.length === 0) return null
    const scheduled =
      !currentIsManual || overlapping.some((row) => row.auto_organize_type !== 'manual')
    if (!scheduled) return null
    return AUTO_ORGANIZE_SWEEP_THEN_FILL_SAVEOFF_NOTE
  }
  if (editingKind === 'top_up' || editingKind === 'organize') {
    const overlapping = rows.filter(
      (row) => row.id !== currentRuleId && bucketInSaveOffRule(row, bucketId),
    )
    if (overlapping.length === 0) return null
    const scheduled =
      !currentIsManual || overlapping.some((row) => row.auto_organize_type !== 'manual')
    if (!scheduled) return null
    return AUTO_ORGANIZE_SWEEP_THEN_FILL_TOPUP_NOTE
  }
  return null
}
