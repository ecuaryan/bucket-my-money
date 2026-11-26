/**
 * Plan tab copy (docs/PLAN.md). One vocabulary: customers see **Plan**; code,
 * tables and RPCs use `plan_*`. No subtitles or helper text (BRAND.md § Voice).
 */

import type { PlanMoneyUnit, PlanSection } from '../planMath'

export const PLAN_TAB_LABEL = 'Plan'
export const PLAN_LOADING_ARIA_LABEL = 'Loading plan'
export const PLAN_LOAD_ERROR_TITLE = 'Could not load your plan'

/** Income the plan hasn't given a job yet. Deliberately not "Unallocated" (vs Unbucketed). */
export const PLAN_UNPLANNED_LABEL = 'Unplanned'
export const PLAN_TAKE_HOME_LABEL = 'Take-home'
export const PLAN_TABLE_ARIA_LABEL = 'Plan'

export const PLAN_EMPTY_BODY = 'Start your plan with your pay.'
export const PLAN_ADD_INCOME_LABEL = 'Add income'

export const PLAN_SECTION_LABELS: Record<PlanSection, string> = {
  income: 'Income',
  withheld: 'Withheld',
  bills: 'Bills',
  buckets: 'Buckets',
}

/** Title of the add sheet for each section. */
export const PLAN_ADD_TITLES: Record<PlanSection, string> = {
  income: 'Add income',
  withheld: 'Add withholding',
  bills: 'Add bill',
  buckets: 'Add bucket',
}

export function planAddLineAriaLabel(section: PlanSection): string {
  return `Add line to ${PLAN_SECTION_LABELS[section]}`
}

/** Column headers. "Every 2 weeks" / "Twice a month", never bi-weekly / bi-monthly. */
export const PLAN_COLUMN_LABELS: Record<PlanMoneyUnit | 'percent', string> = {
  week: 'Weekly',
  two_weeks: 'Every 2 weeks',
  twice_month: 'Twice a month',
  month: 'Monthly',
  year: 'Yearly',
  percent: '%',
}

export const PLAN_VIEW_LABEL = 'View'
export const PLAN_COMPACT_LABEL = 'Compact'
export const PLAN_COLUMNS_LABEL = 'Columns'

export const PLAN_EDIT_LINE_TITLE = 'Edit line'
export const PLAN_NAME_LABEL = 'Name'
export const PLAN_BUCKET_NAME_LABEL = 'Bucket name'
export const PLAN_NOTE_LABEL = 'Note'
export const PLAN_BUCKET_NOTE_LABEL = 'Bucket note'
export const PLAN_GROSS_AMOUNT_LABEL = 'Gross amount'
export const PLAN_AMOUNT_LABEL = 'Amount'
export const PLAN_PER_LABEL = 'Per'
export const PLAN_BUCKET_LABEL = 'Bucket'
export const PLAN_NEW_BUCKET_OPTION = 'New bucket'
export const PLAN_NEW_BUCKET_NAME_LABEL = 'New bucket name'
export const PLAN_PAID_BY_LABEL = 'Paid by'
export const PLAN_SAVE_LABEL = 'Save'
export const PLAN_ADD_LABEL = 'Add'
export const PLAN_DELETE_LINE_LABEL = 'Delete line'

export const PLAN_PAID_BY_NONE = 'None'
export const PLAN_PAID_BY_LABELS = {
  autopay: 'Autopay',
  bill_pay: 'Bill pay',
  by_hand: 'By hand',
} as const
export type PlanPaidBy = keyof typeof PLAN_PAID_BY_LABELS

/** The Per picker reuses the column words. */
export const PLAN_PER_OPTIONS: readonly { unit: PlanMoneyUnit | 'percent'; label: string }[] = [
  { unit: 'week', label: PLAN_COLUMN_LABELS.week },
  { unit: 'two_weeks', label: PLAN_COLUMN_LABELS.two_weeks },
  { unit: 'twice_month', label: PLAN_COLUMN_LABELS.twice_month },
  { unit: 'month', label: PLAN_COLUMN_LABELS.month },
  { unit: 'year', label: PLAN_COLUMN_LABELS.year },
  { unit: 'percent', label: '% of gross' },
]

export function planDeleteLineTitle(name: string): string {
  return `Delete ${name}?`
}
export const PLAN_DELETE_BUCKET_LINE_BODY = 'The bucket and its money stay.'
export const PLAN_DELETE_LINE_BODY = 'It comes off the plan.'
export const PLAN_DELETING_LABEL = 'Deleting…'
export const PLAN_SAVING_LABEL = 'Saving…'

export function planCellAriaLabel(lineName: string, column: string): string {
  return `${lineName}, ${column}`
}
export function planLineDetailsAriaLabel(lineName: string): string {
  return `${lineName}, details`
}
export const PLAN_NOTE_ICON_LABEL = 'Has a note'

/** Shown where a value can't exist (a % with no income, a deleted bucket's name). */
export const PLAN_EMPTY_VALUE = '—'
/** A % while Hide amounts is on. */
export const PLAN_MASKED_PERCENT = '•••%'
export const PLAN_RELOAD_ERROR = 'Could not refresh your plan.'

export const PLAN_INVALID_AMOUNT = 'Enter an amount like 125 or 125.50.'
export const PLAN_INVALID_PERCENT = 'Enter a percent from 0 to 100.'
