import { HIDDEN_MONEY_LABEL } from '@/lib/formatMoney'
import { PLAN_EMPTY_VALUE, PLAN_MASKED_PERCENT } from '@/lib/brand'
import {
  cellCents,
  cellPercentBp,
  centsToInput,
  bpToInput,
  lineYearlyUnits,
  parseCents,
  parsePercentBp,
  type PlanSection,
} from '@/lib/planMath'
import type { PlanColumn, PlanLine } from '@/lib/plan'

const withCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Cents for a table cell: always two decimals so a column lines up ($0.00 next
 * to $91.92). Masked like every other amount while Hide amounts is on.
 */
export function formatCellCents(cents: bigint, masked: boolean): string {
  if (masked) return HIDDEN_MONEY_LABEL
  // Exact: cents fits a double well within 2^53, and /100 is display only.
  return withCents.format(Number(cents) / 100)
}

export function formatPercentBp(bp: bigint | null, masked: boolean): string {
  if (bp === null) return PLAN_EMPTY_VALUE
  if (masked) return PLAN_MASKED_PERCENT
  const sign = bp < 0n ? '-' : ''
  const abs = bp < 0n ? -bp : bp
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}%`
}

/** The text shown in one cell for a yearly amount. */
export function cellText(
  yearlyUnits: bigint,
  column: PlanColumn,
  grossCents: bigint,
  masked: boolean,
): string {
  if (column === 'percent') return formatPercentBp(cellPercentBp(yearlyUnits, grossCents), masked)
  return formatCellCents(cellCents(yearlyUnits, column), masked)
}

/** The plain text an input starts with when a cell becomes editable. */
export function cellInputText(line: PlanLine, column: PlanColumn, grossCents: bigint): string {
  if (line.unit === column) {
    return column === 'percent' ? bpToInput(line.percentBp ?? 0n) : centsToInput(line.amountCents ?? 0n)
  }
  const yearly = lineYearlyUnits(line, grossCents)
  if (column === 'percent') return bpToInput(cellPercentBp(yearly, grossCents) ?? 0n)
  return centsToInput(cellCents(yearly, column))
}

/** Parse what was typed into a column: cents, or basis points for %. */
export function parseCellInput(column: PlanColumn, text: string): bigint | null {
  return column === 'percent' ? parsePercentBp(text) : parseCents(text)
}

/** Income can't be a percentage, so its % cell is never editable. */
export function canEditColumn(section: PlanSection, column: PlanColumn): boolean {
  return !(section === 'income' && column === 'percent')
}

export interface PlanCellEdit {
  lineId: string
  column: PlanColumn
  text: string
  /** What the cell showed when it opened: leaving it unchanged stores nothing. */
  initial: string
  /** Set after Enter on text that isn't a valid amount; the cell stays open. */
  invalid: boolean
}

/** Stable id of a cell's button, so focus can return to it after an edit. */
export function planCellButtonId(lineId: string, column: PlanColumn): string {
  return `plan-cell-${lineId}-${column}`
}
