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
