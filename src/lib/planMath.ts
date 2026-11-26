/**
 * Plan math (docs/PLAN.md § Math). Integers only: JavaScript numbers can't
 * hold most cent values exactly, so every amount is a BigInt.
 *
 * - Money is integer cents; percentages are integer basis points (10% = 1000n).
 * - Every line converts to one exact unit, ten-thousandths of a cent per year
 *   ("yearly units"), so % lines and sums stay exact.
 * - Division happens once, at the end, with a true floor (negatives included).
 *
 * Mirrored in SQL (`plan_line_yearly_units`, `plan_floor_div`) with shared
 * vectors in `planMathVectors.ts`, so the number shown is the number moved.
 */

export type PlanMoneyUnit = 'week' | 'two_weeks' | 'twice_month' | 'month' | 'year'
export type PlanUnit = PlanMoneyUnit | 'percent'
export type PlanSection = 'income' | 'withheld' | 'bills' | 'buckets'

export const PLAN_MONEY_UNITS: readonly PlanMoneyUnit[] = [
  'week',
  'two_weeks',
  'twice_month',
  'month',
  'year',
]

export const PERIODS_PER_YEAR: Readonly<Record<PlanMoneyUnit, bigint>> = {
  week: 52n,
  two_weeks: 26n,
  twice_month: 24n,
  month: 12n,
  year: 1n,
}

/** Yearly units per cent of yearly amount. */
export const UNITS_PER_CENT = 10000n

/** Largest amount a line may hold: $999,999,999.99 (matches the DB check). */
export const MAX_AMOUNT_CENTS = 99_999_999_999n
/** 100% in basis points. */
export const MAX_PERCENT_BP = 10_000n

export interface PlanAmount {
  unit: PlanUnit
  /** Set for money units, null for `percent`. */
  amountCents: bigint | null
  /** Set for `percent`, null for money units. */
  percentBp: bigint | null
}

export interface PlanAmountLine extends PlanAmount {
  section: PlanSection
}

/** Floor division (rounds toward −∞). BigInt `/` truncates toward zero. */
export function floorDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new RangeError('floorDiv divisor must be positive')
  const q = a / b
  return a % b < 0n ? q - 1n : q
}

/** Total gross income per year, in cents. Income lines are never %. */
export function grossYearlyCents(lines: readonly PlanAmountLine[]): bigint {
  let total = 0n
  for (const line of lines) {
    if (line.section !== 'income' || line.unit === 'percent') continue
    total += (line.amountCents ?? 0n) * PERIODS_PER_YEAR[line.unit]
  }
  return total
}

/** A line's yearly amount in ten-thousandths of a cent. */
export function lineYearlyUnits(line: PlanAmount, grossCents: bigint): bigint {
  if (line.unit === 'percent') return grossCents * (line.percentBp ?? 0n)
  return (line.amountCents ?? 0n) * PERIODS_PER_YEAR[line.unit] * UNITS_PER_CENT
}

/** A yearly amount shown in one money column, floored to whole cents. */
export function cellCents(yearlyUnits: bigint, column: PlanMoneyUnit): bigint {
  return floorDiv(yearlyUnits, PERIODS_PER_YEAR[column] * UNITS_PER_CENT)
}

/** A yearly amount as a share of gross, floored to basis points; null with no income. */
export function cellPercentBp(yearlyUnits: bigint, grossCents: bigint): bigint | null {
  if (grossCents <= 0n) return null
  return floorDiv(yearlyUnits, grossCents)
}

/** What one Auto-bucket run moves for a line, floored to whole cents. */
export function perRunCents(yearlyUnits: bigint, runsPerYear: bigint): bigint {
  return floorDiv(yearlyUnits, runsPerYear * UNITS_PER_CENT)
}

export interface PlanTotals {
  grossCents: bigint
  /** Yearly units per section. */
  sections: Record<PlanSection, bigint>
  takeHomeUnits: bigint
  /** Gross − (withheld + bills + buckets); 0n exactly when fully planned. */
  unplannedUnits: bigint
}

export function planTotals(lines: readonly PlanAmountLine[]): PlanTotals {
  const grossCents = grossYearlyCents(lines)
  const sections: Record<PlanSection, bigint> = {
    income: 0n,
    withheld: 0n,
    bills: 0n,
    buckets: 0n,
  }
  for (const line of lines) sections[line.section] += lineYearlyUnits(line, grossCents)
  const grossUnits = grossCents * UNITS_PER_CENT
  return {
    grossCents,
    sections,
    takeHomeUnits: grossUnits - sections.withheld,
    unplannedUnits: grossUnits - sections.withheld - sections.bills - sections.buckets,
  }
}

const DECIMAL_INPUT = /^\d{1,15}(\.\d{0,2})?$|^\.\d{1,2}$/

/** Parse typed text ("1,234.5", "$50") to cents without floats; null if invalid. */
export function parseCents(input: string): bigint | null {
  const text = input.replace(/[$,\s]/g, '')
  if (!DECIMAL_INPUT.test(text)) return null
  const [whole = '', fraction = ''] = text.split('.')
  const cents = BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2))
  return cents <= MAX_AMOUNT_CENTS ? cents : null
}

/** Parse typed text ("10", "12.5%") to basis points; null if invalid or over 100%. */
export function parsePercentBp(input: string): bigint | null {
  const text = input.replace(/[%\s]/g, '')
  if (!DECIMAL_INPUT.test(text)) return null
  const [whole = '', fraction = ''] = text.split('.')
  const bp = BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2))
  return bp <= MAX_PERCENT_BP ? bp : null
}

/** Plain input text for cents: 123450n → "1234.50". */
export function centsToInput(cents: bigint): string {
  const sign = cents < 0n ? '-' : ''
  const abs = cents < 0n ? -cents : cents
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`
}

/** Plain input text for basis points: 1250n → "12.50". */
export function bpToInput(bp: bigint): string {
  return centsToInput(bp)
}
