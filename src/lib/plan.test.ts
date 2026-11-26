import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAN_VIEW,
  isPlanLinkableRule,
  planColumnForRule,
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

describe('planColumnForRule / isPlanLinkableRule', () => {
  const rule = (over: Record<string, unknown>) => ({
    auto_organize_type: 'monthly',
    interval_count: null,
    interval_unit: null,
    days_of_month: [5, 20],
    auto_organize_kind: 'organize',
    owner_member_id: null,
    ...over,
  })

  it('maps the four Plan schedules to their columns (mirrors SQL plan_rule_runs_per_year)', () => {
    expect(planColumnForRule(rule({}) as never)).toBe('twice_month')
    expect(planColumnForRule(rule({ days_of_month: [0] }) as never)).toBe('month') // last day
    expect(planColumnForRule(rule({ days_of_month: [15, 0] }) as never)).toBe('twice_month')
    expect(
      planColumnForRule(rule({ auto_organize_type: 'interval', interval_count: 1, interval_unit: 'week', days_of_month: null }) as never),
    ).toBe('week')
    expect(
      planColumnForRule(rule({ auto_organize_type: 'interval', interval_count: 2, interval_unit: 'week', days_of_month: null }) as never),
    ).toBe('two_weeks')
  })

  it('has no column for other schedules', () => {
    expect(planColumnForRule(rule({ days_of_month: [1, 10, 20] }) as never)).toBeNull()
    expect(planColumnForRule(rule({ days_of_month: [5, 5] }) as never)).toBeNull()
    expect(planColumnForRule(rule({ days_of_month: [31] }) as never)).toBeNull() // only 7 months
    expect(planColumnForRule(rule({ days_of_month: [0, 28] }) as never)).toBeNull() // once in February
    expect(
      planColumnForRule(rule({ auto_organize_type: 'interval', interval_count: 3, interval_unit: 'week', days_of_month: null }) as never),
    ).toBeNull()
    expect(
      planColumnForRule(rule({ auto_organize_type: 'interval', interval_count: 1, interval_unit: 'month', days_of_month: null }) as never),
    ).toBeNull()
    expect(planColumnForRule(rule({ auto_organize_type: 'manual', days_of_month: null }) as never)).toBeNull()
  })

  it('links only household Auto-bucket rules on a Plan schedule', () => {
    expect(isPlanLinkableRule(rule({}) as never)).toBe(true)
    expect(isPlanLinkableRule(rule({ auto_organize_kind: 'top_up' }) as never)).toBe(false)
    expect(isPlanLinkableRule(rule({ owner_member_id: 'kid' }) as never)).toBe(false)
    expect(isPlanLinkableRule(rule({ days_of_month: [1, 2, 3] }) as never)).toBe(false)
  })
})
