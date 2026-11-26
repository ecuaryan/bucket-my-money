import { describe, expect, it } from 'vitest'
import {
  bpToInput,
  cellCents,
  cellPercentBp,
  centsToInput,
  floorDiv,
  lineYearlyUnits,
  parseCents,
  parsePercentBp,
  perRunCents,
  PLAN_MONEY_UNITS,
  planTotals,
  type PlanAmountLine,
} from './planMath'
import { FLOOR_DIV_VECTORS, PLAN_MATH_VECTORS } from './planMathVectors'

const big = (s: string | null) => (s === null ? null : BigInt(s))

describe('floorDiv', () => {
  it.each(FLOOR_DIV_VECTORS)('floor(%s / %s) = %s', (a, b, expected) => {
    expect(floorDiv(BigInt(a), BigInt(b))).toBe(BigInt(expected))
  })

  it('rejects a non-positive divisor', () => {
    expect(() => floorDiv(1n, 0n)).toThrow(RangeError)
    expect(() => floorDiv(1n, -1n)).toThrow(RangeError)
  })
})

describe('shared vectors', () => {
  it.each(PLAN_MATH_VECTORS.map((v) => [v.label, v] as const))('%s', (_label, v) => {
    const gross = BigInt(v.grossYearlyCents)
    const yearly = lineYearlyUnits(
      { unit: v.unit, amountCents: big(v.amountCents), percentBp: big(v.percentBp) },
      gross,
    )
    expect(yearly).toBe(BigInt(v.yearlyUnits))
    for (const column of PLAN_MONEY_UNITS) {
      expect(cellCents(yearly, column)).toBe(BigInt(v.cells[column]))
    }
    expect(cellPercentBp(yearly, gross)).toBe(big(v.percentCellBp))
  })
})

describe('perRunCents', () => {
  it('rounds down to what Auto-bucket can move', () => {
    // $47 every 2 weeks on a twice-a-month rule: $50.9166… → $50.91
    expect(perRunCents(4700n * 26n * 10000n, 24n)).toBe(5091n)
  })
})

describe('planTotals', () => {
  const income: PlanAmountLine = { section: 'income', unit: 'year', amountCents: 120_000_00n, percentBp: null }

  it('reaches exactly zero Unplanned when every dollar has a job', () => {
    const lines: PlanAmountLine[] = [
      income,
      { section: 'withheld', unit: 'month', amountCents: 1_000_00n, percentBp: null },
      { section: 'bills', unit: 'percent', amountCents: null, percentBp: 1000n }, // $12,000
      { section: 'buckets', unit: 'week', amountCents: 1_500_00n, percentBp: null }, // $78,000
      { section: 'buckets', unit: 'twice_month', amountCents: 750_00n, percentBp: null }, // $18,000
    ]
    const totals = planTotals(lines)
    expect(totals.grossCents).toBe(120_000_00n)
    expect(totals.takeHomeUnits).toBe(108_000_00n * 10000n)
    expect(totals.unplannedUnits).toBe(0n)
  })

  it('keeps a sub-cent over-allocation negative instead of rounding it away', () => {
    const lines: PlanAmountLine[] = [
      { section: 'income', unit: 'year', amountCents: 1n, percentBp: null },
      { section: 'bills', unit: 'percent', amountCents: null, percentBp: 10000n },
      { section: 'bills', unit: 'percent', amountCents: null, percentBp: 1n },
    ]
    const totals = planTotals(lines)
    expect(totals.unplannedUnits).toBe(-1n)
    expect(cellCents(totals.unplannedUnits, 'year')).toBe(-1n) // shows −$0.01, never $0
  })

  it('treats a plan with no income as zero gross', () => {
    const totals = planTotals([{ section: 'bills', unit: 'percent', amountCents: null, percentBp: 5000n }])
    expect(totals.grossCents).toBe(0n)
    expect(totals.unplannedUnits).toBe(0n)
  })
})

describe('parseCents', () => {
  it.each([
    ['0', 0n],
    ['12', 1200n],
    ['12.3', 1230n],
    ['12.34', 1234n],
    ['.5', 50n],
    ['$1,234.56', 123456n],
    ['999999999.99', 99_999_999_999n],
  ])('%s → %s cents', (input, cents) => {
    expect(parseCents(input)).toBe(cents)
  })

  it.each(['', 'abc', '1.234', '-5', '1e3', '1.2.3', '1000000000.00'])(
    'rejects %j',
    (input) => {
      expect(parseCents(input)).toBeNull()
    },
  )
})

describe('parsePercentBp', () => {
  it.each([
    ['10', 1000n],
    ['12.5%', 1250n],
    ['0.01', 1n],
    ['100', 10000n],
  ])('%s → %s bp', (input, bp) => {
    expect(parsePercentBp(input)).toBe(bp)
  })

  it.each(['100.01', '-1', '1.005', 'ten'])('rejects %j', (input) => {
    expect(parsePercentBp(input)).toBeNull()
  })
})

describe('input text', () => {
  it('formats cents and basis points without floats', () => {
    expect(centsToInput(123450n)).toBe('1234.50')
    expect(centsToInput(5n)).toBe('0.05')
    expect(centsToInput(-1n)).toBe('-0.01')
    expect(bpToInput(1250n)).toBe('12.50')
  })

  it('round-trips through parseCents', () => {
    for (const cents of [0n, 1n, 99n, 100n, 123456n, 99_999_999_999n]) {
      expect(parseCents(centsToInput(cents))).toBe(cents)
    }
  })
})
