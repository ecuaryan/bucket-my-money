import type { AutoOrganizeFrequencySelection } from '@/lib/brand'
import {
  AUTO_ORGANIZE_FREQUENCY_OPTIONS,
  AUTO_ORGANIZE_MANUAL_CADENCE_SUMMARY,
  AUTO_ORGANIZE_MANUAL_NEXT_RUN_LABEL,
  AUTO_ORGANIZE_NEXT_RUN_LABEL,
  AUTO_ORGANIZE_NO_UPCOMING_RUN_LABEL,
  AUTO_ORGANIZE_RUN_NOW_LAST_RUN_TODAY_PREFIX,
} from '@/lib/brand'

export type AutoOrganizeType = 'interval' | 'monthly' | 'manual'

export function isManualFrequencySelection(
  selection: AutoOrganizeFrequencySelection,
): boolean {
  return selection === 'manual-only'
}

export function isIntervalFrequencySelection(
  selection: AutoOrganizeFrequencySelection,
): boolean {
  return !selection.startsWith('monthly-') && selection !== 'manual-only'
}

export function frequencySelectionFromCadence(
  cadence: AutoOrganizeCadence,
  monthlyMode: MonthlyMode,
): AutoOrganizeFrequencySelection {
  if (cadence.autoOrganizeType === 'manual') {
    return 'manual-only'
  }

  if (cadence.autoOrganizeType === 'monthly') {
    return monthlyMode === 'once' ? 'monthly-once' : 'monthly-twice'
  }

  const count = cadence.intervalCount ?? 2
  const unit = cadence.intervalUnit ?? 'week'
  const candidate = `${count}-${unit}` as AutoOrganizeFrequencySelection
  if (
    AUTO_ORGANIZE_FREQUENCY_OPTIONS.some((option) => option.value === candidate)
  ) {
    return candidate
  }

  return '2-week'
}

export function applyFrequencySelection(
  selection: AutoOrganizeFrequencySelection,
  prev: AutoOrganizeCadence,
  monthlyMode: MonthlyMode,
  todayIso: string,
): { cadence: AutoOrganizeCadence; monthlyMode: MonthlyMode } {
  if (selection === 'manual-only') {
    return {
      cadence: {
        ...prev,
        autoOrganizeType: 'manual',
        startDate: null,
        intervalCount: null,
        intervalUnit: null,
        daysOfMonth: null,
      },
      monthlyMode,
    }
  }

  if (selection === 'monthly-once') {
    return {
      cadence: { ...prev, autoOrganizeType: 'monthly' },
      monthlyMode: 'once',
    }
  }

  if (selection === 'monthly-twice') {
    return {
      cadence: { ...prev, autoOrganizeType: 'monthly' },
      monthlyMode: 'twice',
    }
  }

  const [count, unit] = selection.split('-')
  return {
    cadence: {
      ...prev,
      autoOrganizeType: 'interval',
      startDate: prev.startDate ?? todayIso,
      intervalCount: Number(count),
      intervalUnit: unit as 'week' | 'month',
    },
    monthlyMode,
  }
}

/** Monthly schedules: one day a month, or two. */
export type MonthlyMode = 'once' | 'twice'

/** The two days of a twice-a-month schedule (0 = last day of month). */
export type TwiceMonthlyDays = { first: number; second: number }

/** The first day is picked from the early part of the month (1st–16th). */
export const AUTO_ORGANIZE_TWICE_FIRST_DAY_MAX = 16

/** Days between the two runs when the second day follows the first. */
export const AUTO_ORGANIZE_TWICE_GAP_DAYS = 15

/**
 * The second day that follows a first day: 15 days later (7th → 22nd). Past the
 * 28th it becomes the last day — 29–31 aren't offered, the same rule as once a
 * month (so the 14th/15th/16th pair with the last day).
 */
export function defaultSecondDay(firstDay: number): number {
  const second = firstDay + AUTO_ORGANIZE_TWICE_GAP_DAYS
  return second > AUTO_ORGANIZE_ONCE_MONTHLY_MAX_DAY ? 0 : second
}

/** Order days with the last day (0) after every numbered day. */
function dayRank(day: number): number {
  return day === 0 ? 99 : day
}

/**
 * Valid pair for saving/picking: first before second (last day counts as latest),
 * second never beyond the 28th except as the last day.
 */
export function normalizeTwiceDays(days: TwiceMonthlyDays): TwiceMonthlyDays {
  const first = Math.min(
    Math.max(Math.trunc(days.first) || 1, 1),
    AUTO_ORGANIZE_ONCE_MONTHLY_MAX_DAY - 1,
  )
  const second = normalizeOnceMonthlyDay(days.second)
  return dayRank(second) > first ? { first, second } : { first, second: defaultSecondDay(first) }
}

/**
 * Day pair after the user picks a new first day. The second day keeps following
 * the first (+15) unless they had already chosen their own.
 */
export function twiceDaysAfterFirstChange(
  prev: TwiceMonthlyDays,
  nextFirst: number,
): TwiceMonthlyDays {
  const wasFollowing = prev.second === defaultSecondDay(prev.first)
  return normalizeTwiceDays({
    first: nextFirst,
    second: wasFollowing ? defaultSecondDay(nextFirst) : prev.second,
  })
}

function dayOption(day: number): { value: number; label: string } {
  return { value: day, label: day === 0 ? 'Last day of month' : formatDayOfMonth(day) }
}

/** First-day choices: 1st–16th (plus a saved value outside that range, so it still shows). */
export function twiceFirstDayOptions(
  current?: number,
): { value: number; label: string }[] {
  const days = Array.from({ length: AUTO_ORGANIZE_TWICE_FIRST_DAY_MAX }, (_, i) => i + 1)
  if (current && current > AUTO_ORGANIZE_TWICE_FIRST_DAY_MAX && current < AUTO_ORGANIZE_ONCE_MONTHLY_MAX_DAY) {
    days.push(current)
  }
  return days.map(dayOption)
}

/** Second-day choices: every day after the first through the 28th, then the last day. */
export function twiceSecondDayOptions(firstDay: number): { value: number; label: string }[] {
  const days: number[] = []
  for (let d = firstDay + 1; d <= AUTO_ORGANIZE_ONCE_MONTHLY_MAX_DAY; d++) days.push(d)
  days.push(0)
  return days.map(dayOption)
}

/** "Runs on the 7th and 22nd of every month." (the last day reads "the last day"). */
export function formatTwiceMonthlyHint(days: TwiceMonthlyDays): string {
  const phrase = (day: number) => (day === 0 ? 'the last day' : `the ${formatDayOfMonth(day)}`)
  return `Runs on ${phrase(days.first)} and ${phrase(days.second)} of every month.`
}

export function formatTwiceMonthlyDayLabels(days: number[]): string {
  return [...days]
    .sort((a, b) => (a === 0 ? 99 : a) - (b === 0 ? 99 : b))
    .map(formatDayOfMonth)
    .join(' & ')
}

export type AutoOrganizeCadence = {
  autoOrganizeType: AutoOrganizeType
  startDate: string | null
  intervalCount: number | null
  intervalUnit: 'week' | 'month' | null
  daysOfMonth: number[] | null
}

/** Once-a-month UI: 1–28 always exist; 29–31 map to last day (0). */
export const AUTO_ORGANIZE_ONCE_MONTHLY_MAX_DAY = 28

export function normalizeOnceMonthlyDay(day: number): number {
  if (day === 0) return 0
  if (day > AUTO_ORGANIZE_ONCE_MONTHLY_MAX_DAY) return 0
  return day
}

const ORDINALS = [
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
  '10th',
  '11th',
  '12th',
  '13th',
  '14th',
  '15th',
  '16th',
  '17th',
  '18th',
  '19th',
  '20th',
  '21st',
  '22nd',
  '23rd',
  '24th',
  '25th',
  '26th',
  '27th',
  '28th',
  '29th',
  '30th',
  '31st',
] as const

export function formatDayOfMonth(day: number): string {
  if (day === 0) return 'last day'
  return ORDINALS[day - 1] ?? `${day}th`
}

export const AUTO_ORGANIZE_ONCE_MONTHLY_DAY_OPTIONS: {
  value: number
  label: string
}[] = [
  ...Array.from({ length: AUTO_ORGANIZE_ONCE_MONTHLY_MAX_DAY }, (_, index) => ({
    value: index + 1,
    label: formatDayOfMonth(index + 1),
  })),
  { value: 0, label: 'Last day of month' },
]

export type MonthlySchedule = {
  mode: MonthlyMode
  /** Day for "once a month" (0 = last day). */
  onceDay: number
  /** Days for "twice a month". */
  twice: TwiceMonthlyDays
}

/** Read saved `days_of_month` back into the editor's once/twice state. */
export function monthlyScheduleFromDays(
  days: number[] | null | undefined,
): MonthlySchedule {
  const fallbackTwice: TwiceMonthlyDays = { first: 1, second: defaultSecondDay(1) }
  if (days?.length === 2) {
    const [first, second] = [...days].sort((a, b) => dayRank(a) - dayRank(b))
    return { mode: 'twice', onceDay: 1, twice: normalizeTwiceDays({ first, second }) }
  }
  if (days?.length === 1) {
    return { mode: 'once', onceDay: normalizeOnceMonthlyDay(days[0]), twice: fallbackTwice }
  }
  return { mode: 'twice', onceDay: 1, twice: fallbackTwice }
}

export function daysOfMonthFromSchedule(
  mode: MonthlyMode,
  onceDay: number,
  twice: TwiceMonthlyDays,
): number[] {
  if (mode === 'once') return [normalizeOnceMonthlyDay(onceDay)]
  const { first, second } = normalizeTwiceDays(twice)
  return [first, second]
}

export function normalizeMonthlyCadence(
  cadence: AutoOrganizeCadence,
): AutoOrganizeCadence {
  if (cadence.autoOrganizeType !== 'monthly') return cadence
  const { mode, onceDay, twice } = monthlyScheduleFromDays(cadence.daysOfMonth)
  return {
    ...cadence,
    daysOfMonth: daysOfMonthFromSchedule(mode, onceDay, twice),
  }
}

export function formatCadenceSummary(cadence: AutoOrganizeCadence): string {
  if (cadence.autoOrganizeType === 'manual') {
    return AUTO_ORGANIZE_MANUAL_CADENCE_SUMMARY
  }

  if (cadence.autoOrganizeType === 'monthly') {
    const days = cadence.daysOfMonth ?? []
    if (days.length === 0) return 'Monthly'
    if (days.length === 1) {
      return `Once a month · ${formatDayOfMonth(normalizeOnceMonthlyDay(days[0]))}`
    }
    return `Twice a month · ${formatTwiceMonthlyDayLabels(days)}`
  }

  if (cadence.autoOrganizeType === 'interval') {
    const count = cadence.intervalCount ?? 1
    const unit = cadence.intervalUnit ?? 'week'
    if (unit === 'week' && count === 1) return 'Every week'
    if (unit === 'week' && count === 2) return 'Every 2 weeks'
    if (unit === 'month' && count === 1) return 'Every month'
    return `Every ${count} ${unit}s`
  }

  return 'Auto-organize'
}

/** Local calendar date `YYYY-MM-DD` in the given IANA timezone. */
export function localDateIsoInTimeZone(
  timeZone: string,
  from: Date = new Date(),
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(from)
}

function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function daysBetweenIso(startIso: string, targetIso: string): number {
  const [sy, sm, sd] = startIso.split('-').map(Number)
  const [ty, tm, td] = targetIso.split('-').map(Number)
  return Math.floor(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / 86_400_000,
  )
}

function lastDayOfMonthForIso(iso: string): number {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function tomorrowIsoInTimeZone(
  timeZone: string,
  from: Date = new Date(),
): string {
  return addCalendarDays(localDateIsoInTimeZone(timeZone, from), 1)
}

export type IntervalStartDateValidation =
  | { ok: true }
  | { ok: false; reason: 'today' | 'past' | 'too_far' }

/** Latest first-run date: two years after tomorrow in family local calendar. */
export const INTERVAL_START_MAX_YEARS_AHEAD = 2

export function maxIntervalStartDateIso(
  timeZone: string,
  from: Date = new Date(),
): string {
  const [y, m, d] = tomorrowIsoInTimeZone(timeZone, from).split('-').map(Number)
  const max = new Date(Date.UTC(y + INTERVAL_START_MAX_YEARS_AHEAD, m - 1, d))
  return [
    max.getUTCFullYear(),
    String(max.getUTCMonth() + 1).padStart(2, '0'),
    String(max.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

/** First scheduled run: tomorrow through max horizon in family TZ, or unchanged legacy start when editing. */
export function validateIntervalStartDate(
  candidate: string,
  timeZone: string,
  options?: { from?: Date; legacyStartDate?: string | null },
): IntervalStartDateValidation {
  if (options?.legacyStartDate === candidate) return { ok: true }

  const todayIso = localDateIsoInTimeZone(timeZone, options?.from)
  const tomorrowIso = tomorrowIsoInTimeZone(timeZone, options?.from)
  const maxIso = maxIntervalStartDateIso(timeZone, options?.from)

  if (candidate >= tomorrowIso && candidate <= maxIso) return { ok: true }
  if (candidate === todayIso) return { ok: false, reason: 'today' }
  if (candidate > maxIso) return { ok: false, reason: 'too_far' }
  return { ok: false, reason: 'past' }
}

/** Match SQL `auto_organize_is_due_on` using calendar dates only (no clock TZ drift). */
function isDueOn(cadence: AutoOrganizeCadence, localDateIso: string): boolean {
  if (cadence.autoOrganizeType === 'manual') return false

  const day = Number(localDateIso.split('-')[2])

  if (cadence.autoOrganizeType === 'monthly') {
    const days = cadence.daysOfMonth ?? []
    const last = lastDayOfMonthForIso(localDateIso)
    if (days.includes(0) && day === last) return true
    return days.includes(day)
  }

  const start = cadence.startDate
  if (!start || !cadence.intervalCount || !cadence.intervalUnit) return false
  if (localDateIso < start) return false

  if (cadence.intervalUnit === 'week') {
    return (
      daysBetweenIso(start, localDateIso) % (cadence.intervalCount * 7) === 0
    )
  }

  const [ty, tm] = localDateIso.split('-').map(Number)
  const [sy, sm, sd] = start.split('-').map(Number)
  const monthsDiff = (ty - sy) * 12 + (tm - sm)
  if (monthsDiff < 0 || monthsDiff % cadence.intervalCount !== 0) return false
  const anchorDay = Math.min(sd, lastDayOfMonthForIso(localDateIso))
  return day === anchorDay
}

/** Next local calendar date this auto-organize would run (for cards). */
export function computeNextRunOn(
  cadence: AutoOrganizeCadence,
  timeZone: string,
  from: Date = new Date(),
  options?: { notBefore?: string; skipRunOnDates?: readonly string[] },
): string | null {
  if (cadence.autoOrganizeType === 'manual') return null

  const todayIso = localDateIsoInTimeZone(timeZone, from)
  const startIso = options?.notBefore ?? todayIso
  const skipRunOn = options?.skipRunOnDates?.length
    ? new Set(options.skipRunOnDates)
    : undefined
  for (let offset = 0; offset < 366; offset += 1) {
    const probeIso = addCalendarDays(startIso, offset)
    if (skipRunOn?.has(probeIso)) continue
    if (isDueOn(cadence, probeIso)) return probeIso
  }
  return null
}

export function formatNextRunDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function formatNextRunLabelForCadence(
  cadence: AutoOrganizeCadence,
  nextRunOn: string | null,
): string {
  if (cadence.autoOrganizeType === 'manual') {
    return AUTO_ORGANIZE_MANUAL_NEXT_RUN_LABEL
  }
  if (!nextRunOn) return AUTO_ORGANIZE_NO_UPCOMING_RUN_LABEL
  return `${AUTO_ORGANIZE_NEXT_RUN_LABEL} ${formatNextRunDateLabel(nextRunOn)}`
}

/** @deprecated use formatNextRunLabelForCadence */
export function formatNextRunLabel(nextRunOn: string | null): string {
  if (!nextRunOn) return AUTO_ORGANIZE_NO_UPCOMING_RUN_LABEL
  return `${AUTO_ORGANIZE_NEXT_RUN_LABEL} ${formatNextRunDateLabel(nextRunOn)}`
}

export function formatLastRunLabel(lastRunOn: string | null): string | null {
  if (!lastRunOn) return null
  return `Last run ${formatNextRunDateLabel(lastRunOn)}`
}

export type AutoOrganizeLastRunFields = {
  run_on: string
  created_at: string
}

export function formatRunTimeInTimeZone(
  isoTimestamp: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoTimestamp))
}

/** Run-now confirm: last-run context (amber when the last run was today). */
export function autoOrganizeRunNowLastRunContext(
  lastRun: AutoOrganizeLastRunFields,
  timeZone: string,
  from: Date = new Date(),
): { message: string; emphasize: boolean } {
  const todayIso = localDateIsoInTimeZone(timeZone, from)
  const timeLabel = formatRunTimeInTimeZone(lastRun.created_at, timeZone)
  const emphasize = lastRun.run_on === todayIso

  if (emphasize) {
    return {
      message: `${AUTO_ORGANIZE_RUN_NOW_LAST_RUN_TODAY_PREFIX} ${timeLabel}.`,
      emphasize: true,
    }
  }

  return {
    message: `Last run ${formatNextRunDateLabel(lastRun.run_on)} at ${timeLabel}`,
    emphasize: false,
  }
}

function formatRunScheduleDayPhrase(day: number): string {
  if (day === 0) return 'the last day'
  return `the ${formatDayOfMonth(day)}`
}

export function formatRunScheduleForDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => (a === 0 ? 99 : a) - (b === 0 ? 99 : b))
  if (sorted.length === 0) return ''
  if (sorted.length === 1) {
    if (sorted[0] === 0) return 'Runs on the last day of each month.'
    return `Runs on the ${formatDayOfMonth(sorted[0])} of each month.`
  }
  if (sorted.length === 2) {
    const [first, second] = sorted
    return `Runs on ${formatRunScheduleDayPhrase(first)} and ${formatRunScheduleDayPhrase(second)} of each month.`
  }
  const phrases = sorted.map(formatRunScheduleDayPhrase)
  const last = phrases.pop()!
  return `Runs on ${phrases.join(', ')}, and ${last} of each month.`
}

function formatEditorNextRunSuffix(isoDate: string): string {
  return `${AUTO_ORGANIZE_NEXT_RUN_LABEL} ${formatNextRunDateLabel(isoDate)}`
}

/** Next scheduled run date for the editor footer (cadence is already in the form). */
export function formatEditorNextRunSummary(
  cadence: AutoOrganizeCadence,
  timeZone: string,
  from: Date = new Date(),
  options?: { skipRunOnDates?: readonly string[] },
): string | null {
  if (cadence.autoOrganizeType === 'monthly') {
    if (!cadence.daysOfMonth?.length) return null
  } else if (cadence.autoOrganizeType === 'interval') {
    if (!cadence.startDate) return null
  } else if (cadence.autoOrganizeType === 'manual') {
    return null
  } else {
    return null
  }

  const next = computeNextRunOn(cadence, timeZone, from, options)
  if (!next) return null
  return formatNextRunDateLabel(next)
}

export function formatShortIsoDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatLocalDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Footer summary in the auto-organize editor before Save. */
export function formatEditorSaveScheduleSummary(
  cadence: AutoOrganizeCadence,
  timeZone: string,
  from: Date = new Date(),
  options?: { skipRunOnDates?: readonly string[] },
): string | null {
  const pattern = formatCadenceSummary(cadence)

  if (cadence.autoOrganizeType === 'monthly') {
    if (!cadence.daysOfMonth?.length) return null
  } else if (cadence.autoOrganizeType === 'interval') {
    if (!cadence.startDate) return null
  } else if (cadence.autoOrganizeType === 'manual') {
    return null
  } else {
    return null
  }

  const next = computeNextRunOn(cadence, timeZone, from, options)
  if (!next) return pattern
  return `${pattern} · ${formatEditorNextRunSuffix(next)}`
}

/** @deprecated use formatEditorSaveScheduleSummary */
export function formatEditorRunSchedulePreview(
  cadence: AutoOrganizeCadence,
  timeZone: string,
  options?: { skipRunOnDates?: readonly string[] },
): string | null {
  return formatEditorSaveScheduleSummary(cadence, timeZone, new Date(), options)
}
