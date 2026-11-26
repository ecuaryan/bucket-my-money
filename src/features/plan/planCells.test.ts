import { describe, expect, it } from 'vitest'
import { HIDDEN_MONEY_LABEL } from '@/lib/formatMoney'
import type { PlanLine } from '@/lib/plan'
import {
  canEditColumn,
  cellInputText,
  cellText,
  formatCellCents,
  formatPercentBp,
  parseCellInput,
} from './planCells'

const line = (over: Partial<PlanLine>): PlanLine => ({
  id: 'l1',
  section: 'bills',
  name: 'Mortgage',
  unit: 'month',
  amountCents: 121736n,
  percentBp: null,
  bucketId: null,
  paidBy: null,
  notes: null,
  sortOrder: 0,
  ...over,
})

const GROSS = 15_200_016n // $152,000.16 a year

describe('formatCellCents', () => {
  it('always shows cents so a column lines up', () => {
    expect(formatCellCents(0n, false)).toBe('$0.00')
    expect(formatCellCents(9192n, false)).toBe('$91.92')
    expect(formatCellCents(1_520_001n, false)).toBe('$15,200.01')
    expect(formatCellCents(-1n, false)).toBe('-$0.01')
  })

  it('masks while Hide amounts is on', () => {
    expect(formatCellCents(9192n, true)).toBe(HIDDEN_MONEY_LABEL)
  })
})

describe('formatPercentBp', () => {
  it('formats basis points exactly, negatives included', () => {
    expect(formatPercentBp(1000n, false)).toBe('10.00%')
    expect(formatPercentBp(1217n, false)).toBe('12.17%')
    expect(formatPercentBp(-20n, false)).toBe('-0.20%')
  })

  it('shows a dash with no income, and masks while Hide amounts is on', () => {
    expect(formatPercentBp(null, false)).toBe('—')
    expect(formatPercentBp(1000n, true)).toBe('•••%')
  })
})

describe('cellText', () => {
  it('converts a monthly bill into every column', () => {
    const yearly = 121736n * 12n * 10000n
    expect(cellText(yearly, 'week', GROSS, false)).toBe('$280.92')
    expect(cellText(yearly, 'twice_month', GROSS, false)).toBe('$608.68')
    expect(cellText(yearly, 'month', GROSS, false)).toBe('$1,217.36')
    expect(cellText(yearly, 'percent', GROSS, false)).toBe('9.61%')
  })
})

describe('cellInputText', () => {
  it('starts the stored column with the stored amount', () => {
    expect(cellInputText(line({}), 'month', GROSS)).toBe('1217.36')
    expect(cellInputText(line({ unit: 'percent', amountCents: null, percentBp: 1000n }), 'percent', GROSS)).toBe('10.00')
  })

  it('starts any other column with the rounded-down converted amount', () => {
    expect(cellInputText(line({}), 'week', GROSS)).toBe('280.92')
    expect(cellInputText(line({}), 'percent', GROSS)).toBe('9.61')
  })
})

describe('parseCellInput', () => {
  it('reads cents for money columns and basis points for %', () => {
    expect(parseCellInput('month', '1,217.36')).toBe(121736n)
    expect(parseCellInput('percent', '10')).toBe(1000n)
    expect(parseCellInput('percent', '100.01')).toBeNull()
    expect(parseCellInput('week', '1.005')).toBeNull()
  })
})

describe('canEditColumn', () => {
  it('never lets income become a percentage', () => {
    expect(canEditColumn('income', 'percent')).toBe(false)
    expect(canEditColumn('income', 'year')).toBe(true)
    expect(canEditColumn('bills', 'percent')).toBe(true)
  })
})
