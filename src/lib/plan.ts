/**
 * Plan data layer (docs/PLAN.md). Reads go through RLS (adults of the family);
 * every write is an admin-only RPC. Amounts cross into the app as BigInt at
 * this boundary and never become floats again until they are formatted.
 */

import { supabase } from '@/lib/supabase'
import { formatErrorMessage } from '@/lib/errorMessage'
import type { PlanPaidBy } from '@/lib/brand'
import {
  PLAN_MONEY_UNITS,
  type PlanAmountLine,
  type PlanMoneyUnit,
  type PlanSection,
  type PlanUnit,
} from '@/lib/planMath'

export const PLAN_SECTIONS: readonly PlanSection[] = ['income', 'withheld', 'bills', 'buckets']

export interface PlanLine extends PlanAmountLine {
  id: string
  /** Null on bucket lines: they show their bucket's name. */
  name: string | null
  bucketId: string | null
  paidBy: PlanPaidBy | null
  /** Null on bucket lines: they show their bucket's notes. */
  notes: string | null
  sortOrder: number
}

type PlanLineRow = {
  id: string
  section: string
  name: string | null
  unit: string
  amount_cents: number | null
  percent_bp: number | null
  bucket_id: string | null
  paid_by: string | null
  notes: string | null
  sort_order: number
}

const SECTION_ORDER: Record<PlanSection, number> = { income: 0, withheld: 1, bills: 2, buckets: 3 }

export function planLineFromRow(row: PlanLineRow): PlanLine {
  return {
    id: row.id,
    section: row.section as PlanSection,
    name: row.name,
    unit: row.unit as PlanUnit,
    amountCents: row.amount_cents === null ? null : BigInt(row.amount_cents),
    percentBp: row.percent_bp === null ? null : BigInt(row.percent_bp),
    bucketId: row.bucket_id,
    paidBy: row.paid_by as PlanPaidBy | null,
    notes: row.notes,
    sortOrder: row.sort_order,
  }
}

const PLAN_LINE_CONTENT_FIELDS = [
  'section', 'name', 'unit', 'amount_cents', 'percent_bp', 'bucket_id', 'paid_by', 'notes',
] as const

/**
 * Whether a realtime update only moved a line (sort order), with nothing the
 * table shows changed. Reorders don't glow: the rows moving is the signal.
 */
export function planLineOnlyMoved(oldRow: Record<string, unknown>, newRow: Record<string, unknown>): boolean {
  if (!('sort_order' in oldRow)) return false // no old row to compare
  return PLAN_LINE_CONTENT_FIELDS.every((field) => oldRow[field] === newRow[field])
}

/** Lines in display order: section, then the household's own order. */
export function sortPlanLines(lines: readonly PlanLine[]): PlanLine[] {
  return [...lines].sort(
    (a, b) =>
      SECTION_ORDER[a.section] - SECTION_ORDER[b.section] || a.sortOrder - b.sortOrder,
  )
}

export async function fetchPlanLines(): Promise<PlanLine[]> {
  const { data, error } = await supabase
    .from('plan_lines')
    .select('id, section, name, unit, amount_cents, percent_bp, bucket_id, paid_by, notes, sort_order')
  if (error) throw new Error(formatErrorMessage(error, 'Could not load your plan.'))
  return sortPlanLines((data ?? []).map(planLineFromRow))
}

/** Whether the household has a plan with any line (a shared member's tab shows only then). */
export async function fetchPlanHasLines(): Promise<boolean> {
  const { count, error } = await supabase
    .from('plan_lines')
    .select('id', { count: 'exact', head: true })
  if (error) throw new Error(formatErrorMessage(error))
  return (count ?? 0) > 0
}

/** Amount args for an RPC: cents for money units, basis points for percent. */
function amountArgs(unit: PlanUnit, value: bigint) {
  return unit === 'percent'
    ? { p_unit: unit, p_percent_bp: Number(value) }
    : { p_unit: unit, p_amount_cents: Number(value) }
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn as never, args as never)
  if (error) throw new Error(formatErrorMessage(error))
  return data
}

export interface NewPlanLine {
  section: PlanSection
  unit: PlanUnit
  /** Cents, or basis points when unit is `percent`. */
  value: bigint
  name?: string | null
  bucketId?: string | null
  paidBy?: PlanPaidBy | null
  notes?: string | null
}

export async function addPlanLine(line: NewPlanLine): Promise<string> {
  const id = await rpc('add_plan_line', {
    p_section: line.section,
    ...amountArgs(line.unit, line.value),
    p_name: line.name ?? null,
    p_bucket_id: line.bucketId ?? null,
    p_paid_by: line.paidBy ?? null,
    p_notes: line.notes ?? null,
  })
  return id as string
}

export async function setPlanLineAmount(lineId: string, unit: PlanUnit, value: bigint): Promise<void> {
  await rpc('set_plan_line_amount', { p_line_id: lineId, ...amountArgs(unit, value) })
}

export async function updatePlanLineDetails(
  lineId: string,
  details: { name: string | null; paidBy: PlanPaidBy | null; notes: string | null },
): Promise<void> {
  await rpc('update_plan_line_details', {
    p_line_id: lineId,
    p_name: details.name,
    p_paid_by: details.paidBy,
    p_notes: details.notes,
  })
}

export async function deletePlanLine(lineId: string): Promise<void> {
  await rpc('delete_plan_line', { p_line_id: lineId })
}

export async function reorderPlanLines(section: PlanSection, lineIds: string[]): Promise<void> {
  await rpc('reorder_plan_lines', { p_section: section, p_line_ids: lineIds })
}

/** The section's line ids, in order, with one line moved up or down; null at an end. */
export function movedSectionIds(
  lines: readonly PlanLine[],
  lineId: string,
  direction: 'up' | 'down',
): string[] | null {
  const line = lines.find((l) => l.id === lineId)
  if (!line) return null
  const ids = sortPlanLines(lines.filter((l) => l.section === line.section)).map((l) => l.id)
  const from = ids.indexOf(lineId)
  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= ids.length) return null
  ids.splice(from, 1)
  ids.splice(to, 0, lineId)
  return ids
}

/** Lines with one section put in the given order (an optimistic reorder). */
export function withSectionOrder(
  lines: readonly PlanLine[],
  section: PlanSection,
  lineIds: readonly string[],
): PlanLine[] {
  const order = new Map(lineIds.map((id, index) => [id, index]))
  return sortPlanLines(
    lines.map((l) => (l.section === section && order.has(l.id) ? { ...l, sortOrder: order.get(l.id)! } : l)),
  )
}

// ---------------------------------------------------------------------------
// View preferences: per person, per device (like Hide amounts). They never
// change the plan, so they live in localStorage, not the database.
// ---------------------------------------------------------------------------

export type PlanColumn = PlanMoneyUnit | 'percent'
export const PLAN_COLUMNS: readonly PlanColumn[] = [...PLAN_MONEY_UNITS, 'percent']

export interface PlanViewPrefs {
  hiddenColumns: PlanColumn[]
  compact: boolean
}

export const DEFAULT_PLAN_VIEW: PlanViewPrefs = { hiddenColumns: [], compact: false }

const PLAN_VIEW_STORAGE_PREFIX = 'bucketmymoney_plan_view:'

export function planViewStorageKey(memberId: string): string {
  return `${PLAN_VIEW_STORAGE_PREFIX}${memberId}`
}

export function readPlanView(memberId: string): PlanViewPrefs {
  try {
    const raw = localStorage.getItem(planViewStorageKey(memberId))
    if (!raw) return DEFAULT_PLAN_VIEW
    const parsed = JSON.parse(raw) as Partial<PlanViewPrefs>
    const hidden = (parsed.hiddenColumns ?? []).filter((c): c is PlanColumn =>
      (PLAN_COLUMNS as readonly string[]).includes(c),
    )
    // At least one column always stays visible.
    return {
      hiddenColumns: hidden.length >= PLAN_COLUMNS.length ? [] : hidden,
      compact: parsed.compact === true,
    }
  } catch {
    return DEFAULT_PLAN_VIEW
  }
}

export function writePlanView(memberId: string, prefs: PlanViewPrefs): void {
  try {
    localStorage.setItem(planViewStorageKey(memberId), JSON.stringify(prefs))
  } catch {
    // private mode: the view simply isn't remembered
  }
}

// ---------------------------------------------------------------------------
// Link to Auto-bucket (migration 116). The plan sets one household rule's
// lines; the database keeps them in sync and refuses any other writer.
// ---------------------------------------------------------------------------

export type PlanLinkColumn = Exclude<PlanMoneyUnit, 'year'>

/** The rule cadence fields that decide whether (and where) it can link. */
export interface PlanRuleCadence {
  auto_organize_type: string
  interval_count: number | null
  interval_unit: string | null
  days_of_month: number[] | null
}

/**
 * The Plan column a rule's schedule matches, or null when it has none
 * (mirrors SQL `plan_rule_runs_per_year`): every week, every 2 weeks, once a
 * month, twice a month.
 */
export function planColumnForRule(rule: PlanRuleCadence): PlanLinkColumn | null {
  if (rule.auto_organize_type === 'interval' && rule.interval_unit === 'week') {
    if (rule.interval_count === 1) return 'week'
    if (rule.interval_count === 2) return 'two_weeks'
  }
  if (rule.auto_organize_type === 'monthly' && rule.days_of_month) {
    // Days must run every month as counted: 1..28, or 0 (last day). 0 and 28
    // land on the same date in February, so they don't make twice a month.
    const days = rule.days_of_month
    if (!days.every((d) => d >= 0 && d <= 28)) return null
    if (days.length === 1) return 'month'
    if (days.length === 2 && days[0] !== days[1] && !(days.includes(0) && days.includes(28))) return 'twice_month'
  }
  return null
}

/** Whether a rule can be linked: a household Auto-bucket (not top-up/save-off) on a Plan schedule. */
export function isPlanLinkableRule(
  rule: PlanRuleCadence & { auto_organize_kind: string; owner_member_id: string | null },
): boolean {
  return rule.auto_organize_kind === 'organize' && rule.owner_member_id === null && planColumnForRule(rule) !== null
}

/** The household's linked rule id, or null (also null for children, who can't read plans). */
export async function fetchPlanRuleId(): Promise<string | null> {
  const { data, error } = await supabase.from('plans').select('auto_organize_id').maybeSingle()
  if (error) throw new Error(formatErrorMessage(error))
  return data?.auto_organize_id ?? null
}

/** Link one rule (its lines then come from the plan), or unlink with null. */
export async function linkPlanRule(ruleId: string | null): Promise<void> {
  await rpc('link_plan_rule', { p_auto_organize_id: ruleId })
}
