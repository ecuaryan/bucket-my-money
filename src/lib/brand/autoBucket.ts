/** User-facing copy — Auto-bucket rules (`auto_organize_*`). Import from `@/lib/brand`. */

import { FLOAT_LABEL } from './core'

// UI label is "Auto-bucket"; schema/RPCs keep `auto_organize*` (see docs).

/** Buckets tab section header. Schema: `auto_organizes`. */
export const AUTO_ORGANIZE_SECTION_TITLE = 'Auto-bucket'

export const AUTO_ORGANIZE_LOAD_ERROR_TITLE = 'Could not load Auto-bucket'

export const AUTO_ORGANIZE_LOADING_ARIA_LABEL = 'Loading Auto-bucket'

/** Admin CTA in the section header (empty state uses the same label). */
export const AUTO_ORGANIZE_ADD_LABEL = 'Add'

/** Empty state when no auto-organizes exist (admin). */
export const AUTO_ORGANIZE_EMPTY_BODY =
  'Set up moves, top-ups, or save-offs — on a schedule or when you choose.'

export type AutoOrganizeKind = 'organize' | 'top_up' | 'save_off'

export const AUTO_ORGANIZE_KIND_ORGANIZE_LABEL = 'Auto-bucket'

export const AUTO_ORGANIZE_KIND_TOPUP_LABEL = 'Auto top-up'

export const AUTO_ORGANIZE_KIND_SAVEOFF_LABEL = 'Auto save-off'

/** Screen-reader name for the kind tabs at the top of a new rule. */
export const AUTO_ORGANIZE_KIND_TABS_LABEL = 'Rule type'

/** Kind tab labels: short forms of the kind names, so three fit on a phone. */
export const AUTO_ORGANIZE_KIND_TOPUP_TAB_LABEL = 'Top-up'

export const AUTO_ORGANIZE_KIND_SAVEOFF_TAB_LABEL = 'Save-off'

export const AUTO_ORGANIZE_TOPUP_FILL_TO_LABEL = 'Fill to'

export const AUTO_ORGANIZE_SAVEOFF_SOURCES_LABEL = 'From these buckets'

export const AUTO_ORGANIZE_SAVEOFF_KEEP_LABEL = 'Leave at least'

export const AUTO_ORGANIZE_SAVEOFF_SWEEP_ALL_LABEL = 'Sweep all'

export const AUTO_ORGANIZE_SAVEOFF_DESTINATION_LABEL = 'Send the rest to'

export const AUTO_ORGANIZE_SAVEOFF_DEST_FLOAT_LABEL = FLOAT_LABEL

export const AUTO_ORGANIZE_ESTIMATED_TOTAL_LABEL = 'If it ran now'

export const AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL = 'Nothing to move now'

/** Top-up fill met, or save-off balance at/below keep amount. */
export const AUTO_ORGANIZE_AT_TARGET_LABEL = 'At target'

export const AUTO_ORGANIZE_RUN_NOW_NOTHING_TO_MOVE = AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL

export const AUTO_ORGANIZE_SWEEP_THEN_FILL_TOPUP_NOTE =
  'This bucket is also in a save-off rule. Excess is swept before top-ups on the same day.'

export const AUTO_ORGANIZE_SWEEP_THEN_FILL_SAVEOFF_NOTE =
  'This bucket is also in a top-up or Auto-bucket rule. Save-offs run before refills on the same day.'

export function autoOrganizeSaveOffMovesNowLabel(
  move: number,
  formatMoney: (value: number) => string,
): string {
  return `Moves ${formatMoney(move)}`
}

export function autoOrganizeTopUpAddsNowLabel(
  move: number,
  formatMoney: (value: number) => string,
): string {
  return `Adds ${formatMoney(move)}`
}

export function autoOrganizeBucketsSectionLabel(kind: AutoOrganizeKind): string {
  if (kind === 'save_off') return AUTO_ORGANIZE_SAVEOFF_SOURCES_LABEL
  return AUTO_ORGANIZE_BUCKETS_LABEL
}

export function autoOrganizeKindLabel(kind: AutoOrganizeKind): string {
  switch (kind) {
    case 'top_up':
      return AUTO_ORGANIZE_KIND_TOPUP_LABEL
    case 'save_off':
      return AUTO_ORGANIZE_KIND_SAVEOFF_LABEL
    default:
      return AUTO_ORGANIZE_KIND_ORGANIZE_LABEL
  }
}

/** History transaction note for an auto-organize run (kind + rule name). */
export function autoOrganizeHistoryNote(
  kind: AutoOrganizeKind,
  displayName: string,
): string {
  return `${autoOrganizeKindLabel(kind)} · ${displayName}`
}

export function autoOrganizeSaveOffDestinationLabel(
  destinationBucketName: string | null,
): string {
  if (destinationBucketName) return destinationBucketName
  return AUTO_ORGANIZE_SAVEOFF_DEST_FLOAT_LABEL
}

export function autoOrganizeRunNowConfirmBodyForKind(
  kind: AutoOrganizeKind,
  totalLabel: string,
): string {
  switch (kind) {
    case 'top_up':
      return `This will top up your buckets by ${totalLabel} now.`
    case 'save_off':
      return `This will move ${totalLabel} from your buckets now.`
    default:
      return `This will move ${totalLabel} into your buckets now.`
  }
}

export const AUTO_ORGANIZE_TOTAL_PER_RUN_LABEL = 'Total per run'

/** Editor footer row — cadence is already in the form above. */
export const AUTO_ORGANIZE_NEXT_RUN_LABEL = 'Next run'

export const AUTO_ORGANIZE_RUN_NOW_LABEL = 'Run now'

/** Confirm sheet primary action (amount is in the summary above). */
export const AUTO_ORGANIZE_RUN_NOW_SUBMITTING_LABEL = 'Running…'

export const AUTO_ORGANIZE_RUN_NOW_LAST_RUN_TODAY_PREFIX = 'Last run today at'

export const AUTO_ORGANIZE_RUN_NOW_CURRENT_LABEL = 'Current'

export const AUTO_ORGANIZE_RUN_NOW_MOVE_LABEL = 'Move'

export const AUTO_ORGANIZE_RUN_NOW_AFTER_LABEL = 'Will be'

export function autoOrganizeViewBucketsLabel(count: number): string {
  if (count === 1) return 'View 1 bucket'
  return `View ${count} buckets`
}

export function autoOrganizeViewLinesLabel(
  kind: AutoOrganizeKind,
  count: number,
): string {
  if (kind === 'save_off') {
    return count === 1 ? 'View 1 source bucket' : `View ${count} source buckets`
  }
  return autoOrganizeViewBucketsLabel(count)
}

export const AUTO_ORGANIZE_PAUSE_LABEL = 'Pause'

export const AUTO_ORGANIZE_PAUSED_LABEL = 'Paused'

/** List card when an auto-organize is paused (admin). */
export const AUTO_ORGANIZE_PAUSED_STATUS =
  'Automatic runs and Run now are off until you resume.'

/** List card when paused; shared members cannot resume. */
export const AUTO_ORGANIZE_PAUSED_STATUS_SHARED = 'Automatic runs are off.'

export function autoOrganizePausedStatus(shared: boolean): string {
  return shared ? AUTO_ORGANIZE_PAUSED_STATUS_SHARED : AUTO_ORGANIZE_PAUSED_STATUS
}

export const AUTO_ORGANIZE_RESUME_LABEL = 'Resume'

export const AUTO_ORGANIZE_EDIT_LABEL = 'Edit'

export const AUTO_ORGANIZE_DELETE_LABEL = 'Delete'

export function autoOrganizeDeleteSheetTitle(displayName: string): string {
  return `Delete ${displayName}?`
}

export const AUTO_ORGANIZE_DELETE_SHEET_BODY = 'Past moves stay in History.'

export const AUTO_ORGANIZE_DELETED_TOAST = 'Deleted.'

export const AUTO_ORGANIZE_RAN_TOAST = 'Moves completed.'

export const AUTO_ORGANIZE_SAVE_LABEL = 'Save'

export const AUTO_ORGANIZE_SAVED_TOAST = 'Saved.'

export const AUTO_ORGANIZE_ADD_REQUIRES_BUCKETS_HINT =
  'Create a shared bucket first.'

export const AUTO_ORGANIZE_FREQUENCY_MANUAL_LABEL = 'Manual only'

export const AUTO_ORGANIZE_MANUAL_CADENCE_SUMMARY = 'Manual only'

export const AUTO_ORGANIZE_MANUAL_NEXT_RUN_LABEL = 'Runs when you choose'

export const AUTO_ORGANIZE_FREQUENCY_LABEL = 'Frequency'

export const AUTO_ORGANIZE_NO_UPCOMING_RUN_LABEL = 'No upcoming run'

export function autoOrganizeNamePlaceholder(kind: AutoOrganizeKind): string {
  switch (kind) {
    case 'top_up':
      return 'Month-start refill'
    case 'save_off':
      return 'Month-end sweep'
    default:
      return 'Payday'
  }
}

export const AUTO_ORGANIZE_BUCKETS_LABEL = 'Buckets'

export const AUTO_ORGANIZE_NO_BUCKETS_ERROR =
  'Enter an amount for at least one bucket.'

export const AUTO_ORGANIZE_FREQUENCY_OPTIONS = [
  { value: 'manual-only', label: AUTO_ORGANIZE_FREQUENCY_MANUAL_LABEL },
  { value: '1-week', label: 'Every week' },
  { value: '2-week', label: 'Every 2 weeks' },
  { value: 'monthly-once', label: 'Once a month' },
  { value: 'monthly-twice', label: 'Twice a month' },
  { value: '2-month', label: 'Every 2 months' },
  { value: '3-month', label: 'Every 3 months' },
  { value: '4-month', label: 'Every 4 months' },
  { value: '6-month', label: 'Every 6 months' },
] as const

export type AutoOrganizeFrequencySelection =
  (typeof AUTO_ORGANIZE_FREQUENCY_OPTIONS)[number]['value']

export const AUTO_ORGANIZE_TWICE_FIRST_DAY_LABEL = 'First day'

export const AUTO_ORGANIZE_TWICE_SECOND_DAY_LABEL = 'Second day'

export const AUTO_ORGANIZE_INTERVAL_START_LABEL = 'Starts on'

/** Read-only anchor once the interval start date is in the past. */
export const AUTO_ORGANIZE_INTERVAL_STARTED_LABEL = 'Started on'

export const AUTO_ORGANIZE_TIMEZONE_LABEL = 'Timezone'

export const AUTO_ORGANIZE_START_DATE_TODAY_ERROR =
  'Start date can’t be today. Pick a later date, or save and use Run now on the card.'

export const AUTO_ORGANIZE_START_DATE_PAST_ERROR =
  'Start date can’t be in the past. Pick tomorrow or later.'

export const AUTO_ORGANIZE_START_DATE_TOO_FAR_ERROR =
  'Start date can’t be more than 2 years away.'

export const AUTO_ORGANIZE_ONCE_MONTHLY_DAY_LABEL = 'Day of the month'

export const AUTO_ORGANIZE_DISCARD_TITLE = 'Discard changes?'

export const AUTO_ORGANIZE_DISCARD_BODY = 'Your changes to this rule will be lost.'

export const AUTO_ORGANIZE_DISCARD_CONFIRM = 'Discard'

export const AUTO_ORGANIZE_DISCARD_CANCEL = 'Keep editing'

export const AUTO_ORGANIZE_SET_ASIDE_FLOAT_CONFIRM_TITLE =
  'Set aside more than Unbucketed?'

export function autoOrganizeSetAsideFloatConfirmBody(amountLabel: string): string {
  return `This set-aside of ${amountLabel} is more than you have unbucketed. ${FLOAT_LABEL} will go negative until your money sources reflect more cash or you move money back.`
}

export function autoOrganizeRunNowConfirmTitle(name: string): string {
  return `Run ${name} now?`
}
