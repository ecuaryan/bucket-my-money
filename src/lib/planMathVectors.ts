/**
 * Shared Plan math vectors, checked against both `planMath.ts`
 * (planMath.test.ts) and the SQL functions (tests/db/plan.test.ts).
 *
 * Expected values were computed independently with exact rational arithmetic
 * (Python `fractions.Fraction` + `math.floor`), not with the code under test.
 * Big numbers are strings so they survive JSON and stay exact.
 */

import type { PlanMoneyUnit, PlanUnit } from './planMath'

export interface PlanMathVector {
  label: string
  unit: PlanUnit
  amountCents: string | null
  percentBp: string | null
  grossYearlyCents: string
  yearlyUnits: string
  cells: Record<PlanMoneyUnit, string>
  percentCellBp: string | null
}

export const PLAN_MATH_VECTORS: readonly PlanMathVector[] = [
  {
    label: '$47 every 2 weeks',
    unit: 'two_weeks',
    amountCents: '4700',
    percentBp: null,
    grossYearlyCents: '15200016',
    yearlyUnits: '1222000000',
    cells: { week: '2350', two_weeks: '4700', twice_month: '5091', month: '10183', year: '122200' },
    percentCellBp: '80',
  },
  {
    label: '10% of $152,000.16 gross',
    unit: 'percent',
    amountCents: null,
    percentBp: '1000',
    grossYearlyCents: '15200016',
    yearlyUnits: '15200016000',
    cells: { week: '29230', two_weeks: '58461', twice_month: '63333', month: '126666', year: '1520001' },
    percentCellBp: '1000',
  },
  {
    label: '$152,000.16 a year',
    unit: 'year',
    amountCents: '15200016',
    percentBp: null,
    grossYearlyCents: '15200016',
    yearlyUnits: '152000160000',
    cells: { week: '292308', two_weeks: '584616', twice_month: '633334', month: '1266668', year: '15200016' },
    percentCellBp: '10000',
  },
  {
    label: '1 cent a week',
    unit: 'week',
    amountCents: '1',
    percentBp: null,
    grossYearlyCents: '15200016',
    yearlyUnits: '520000',
    cells: { week: '1', two_weeks: '2', twice_month: '2', month: '4', year: '52' },
    percentCellBp: '0',
  },
  {
    label: '$1,217.36 a month',
    unit: 'month',
    amountCents: '121736',
    percentBp: null,
    grossYearlyCents: '15200016',
    yearlyUnits: '14608320000',
    cells: { week: '28092', two_weeks: '56185', twice_month: '60868', month: '121736', year: '1460832' },
    percentCellBp: '961',
  },
  {
    label: '$199.17 twice a month',
    unit: 'twice_month',
    amountCents: '19917',
    percentBp: null,
    grossYearlyCents: '15200016',
    yearlyUnits: '4780080000',
    cells: { week: '9192', two_weeks: '18384', twice_month: '19917', month: '39834', year: '478008' },
    percentCellBp: '314',
  },
  {
    label: '33.33% of $1.00 gross',
    unit: 'percent',
    amountCents: null,
    percentBp: '3333',
    grossYearlyCents: '100',
    yearlyUnits: '333300',
    cells: { week: '0', two_weeks: '1', twice_month: '1', month: '2', year: '33' },
    percentCellBp: '3333',
  },
  {
    label: 'a % line with no income',
    unit: 'percent',
    amountCents: null,
    percentBp: '1000',
    grossYearlyCents: '0',
    yearlyUnits: '0',
    cells: { week: '0', two_weeks: '0', twice_month: '0', month: '0', year: '0' },
    percentCellBp: null,
  },
  {
    label: '$0 starter line',
    unit: 'twice_month',
    amountCents: '0',
    percentBp: null,
    grossYearlyCents: '15200016',
    yearlyUnits: '0',
    cells: { week: '0', two_weeks: '0', twice_month: '0', month: '0', year: '0' },
    percentCellBp: '0',
  },
  {
    label: 'largest allowed amount weekly (beyond float precision)',
    unit: 'week',
    amountCents: '99999999999',
    percentBp: null,
    grossYearlyCents: '15200016',
    yearlyUnits: '51999999999480000',
    cells: {
      week: '99999999999',
      two_weeks: '199999999998',
      twice_month: '216666666664',
      month: '433333333329',
      year: '5199999999948',
    },
    percentCellBp: '3421049030',
  },
]

/** [a, b, floor(a / b)] — includes negatives, where truncation would be wrong. */
export const FLOOR_DIV_VECTORS: readonly (readonly [string, string, string])[] = [
  ['7', '2', '3'],
  ['-7', '2', '-4'],
  ['0', '5', '0'],
  ['-123460', '10000', '-13'],
  ['-120000', '10000', '-12'],
  ['1222000000', '240000', '5091'],
  ['15200016000', '120000', '126666'],
]
