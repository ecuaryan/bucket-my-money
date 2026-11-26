import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAN_VIEW,
  planLineFromRow,
  planViewStorageKey,
  PLAN_COLUMNS,
  readPlanView,
  sortPlanLines,
  writePlanView,
} from './plan'

const row = {
  id: 'a',
  section: 'bills',
  name: 'Mortgage',
  unit: 'month',
  amount_cents: 121736,
  percent_bp: null,
  bucket_id: null,
  paid_by: 'autopay',
  notes: null,
  sort_order: 2,
}

describe('planLineFromRow', () => {
  it('turns amounts into BigInt at the boundary', () => {
    const line = planLineFromRow(row)
    expect(line.amountCents).toBe(121736n)
    expect(line.percentBp).toBeNull()
    expect(line.paidBy).toBe('autopay')
    const pct = planLineFromRow({ ...row, unit: 'percent', amount_cents: null, percent_bp: 1000 })
    expect(pct.percentBp).toBe(1000n)
    expect(pct.amountCents).toBeNull()
  })
})

describe('sortPlanLines', () => {
  it('orders by section like a paycheck, then by the household’s order', () => {
    const lines = [
      planLineFromRow({ ...row, id: 'b2', section: 'buckets', sort_order: 1, name: null, bucket_id: 'x' }),
      planLineFromRow({ ...row, id: 'i', section: 'income', sort_order: 0 }),
      planLineFromRow({ ...row, id: 'b1', section: 'buckets', sort_order: 0, name: null, bucket_id: 'y' }),
      planLineFromRow({ ...row, id: 'w', section: 'withheld', sort_order: 0 }),
      planLineFromRow({ ...row, id: 'bill', section: 'bills', sort_order: 0 }),
    ]
    expect(sortPlanLines(lines).map((l) => l.id)).toEqual(['i', 'w', 'bill', 'b1', 'b2'])
  })
})

describe('plan view preferences', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to every column, not compact', () => {
    expect(readPlanView('m1')).toEqual(DEFAULT_PLAN_VIEW)
  })

  it('round-trips per member', () => {
    writePlanView('m1', { hiddenColumns: ['week', 'percent'], compact: true })
    expect(readPlanView('m1')).toEqual({ hiddenColumns: ['week', 'percent'], compact: true })
    expect(readPlanView('m2')).toEqual(DEFAULT_PLAN_VIEW)
  })

  it('ignores unknown columns and never hides every column', () => {
    localStorage.setItem(planViewStorageKey('m1'), JSON.stringify({ hiddenColumns: ['week', 'fortnight'] }))
    expect(readPlanView('m1').hiddenColumns).toEqual(['week'])
    localStorage.setItem(planViewStorageKey('m1'), JSON.stringify({ hiddenColumns: [...PLAN_COLUMNS] }))
    expect(readPlanView('m1').hiddenColumns).toEqual([])
  })

  it('survives corrupt storage', () => {
    localStorage.setItem(planViewStorageKey('m1'), '{not json')
    expect(readPlanView('m1')).toEqual(DEFAULT_PLAN_VIEW)
  })
})
