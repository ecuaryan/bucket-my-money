import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { SheetHeader } from '@/components/ui/SheetHeader'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { ClearableInput } from '@/components/ui/ClearableInput'
import {
  AUTO_ORGANIZE_AT_TARGET_LABEL,
  AUTO_ORGANIZE_DISCARD_BODY,
  AUTO_ORGANIZE_DISCARD_CANCEL,
  AUTO_ORGANIZE_DISCARD_CONFIRM,
  AUTO_ORGANIZE_DISCARD_TITLE,
  AUTO_ORGANIZE_ESTIMATED_TOTAL_LABEL,
  AUTO_ORGANIZE_FREQUENCY_LABEL,
  AUTO_ORGANIZE_FREQUENCY_OPTIONS,
  AUTO_ORGANIZE_INTERVAL_START_LABEL,
  AUTO_ORGANIZE_INTERVAL_STARTED_LABEL,
  AUTO_ORGANIZE_KIND_ORGANIZE_LABEL,
  AUTO_ORGANIZE_KIND_SAVEOFF_TAB_LABEL,
  AUTO_ORGANIZE_KIND_TABS_LABEL,
  AUTO_ORGANIZE_KIND_TOPUP_TAB_LABEL,
  AUTO_ORGANIZE_MANUAL_NEXT_RUN_LABEL,
  AUTO_ORGANIZE_NEXT_RUN_LABEL,
  AUTO_ORGANIZE_NO_BUCKETS_ERROR,
  AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL,
  AUTO_ORGANIZE_ONCE_MONTHLY_DAY_LABEL,
  AUTO_ORGANIZE_TWICE_FIRST_DAY_LABEL,
  AUTO_ORGANIZE_TWICE_SECOND_DAY_LABEL,
  AUTO_ORGANIZE_SAVE_LABEL,
  AUTO_ORGANIZE_SAVED_TOAST,
  AUTO_ORGANIZE_SAVEOFF_DESTINATION_LABEL,
  AUTO_ORGANIZE_SAVEOFF_DEST_FLOAT_LABEL,
  AUTO_ORGANIZE_SAVEOFF_KEEP_LABEL,
  AUTO_ORGANIZE_START_DATE_TODAY_ERROR,
  AUTO_ORGANIZE_START_DATE_PAST_ERROR,
  AUTO_ORGANIZE_START_DATE_TOO_FAR_ERROR,
  AUTO_ORGANIZE_TIMEZONE_LABEL,
  AUTO_ORGANIZE_TOPUP_FILL_TO_LABEL,
  autoOrganizeBucketsSectionLabel,
  autoOrganizeKindLabel,
  autoOrganizeNamePlaceholder,
  autoOrganizeSaveOffMovesNowLabel,
  autoOrganizeTopUpAddsNowLabel,
  type AutoOrganizeKind,
  type AutoOrganizeFrequencySelection,
} from '@/lib/brand'
import {
  sweepThenFillNotesByBucket,
  autoOrganizeLineMoveAtRun,
  computeTotalPerRun,
  fetchFamilyTimezone,
  saveAutoOrganize,
  type AutoOrganizeInput,
  type AutoOrganizeWithDetails,
} from '@/lib/autoOrganize'
import {
  familyTimezoneSelectOptions,
  isValidIanaTimezone,
  resolveFamilyTimezone,
} from '@/lib/familyTimezones'
import { formatErrorMessage } from '@/lib/errorMessage'
import { toast } from '@/lib/toast'
import {
  AUTO_ORGANIZE_ONCE_MONTHLY_DAY_OPTIONS,
  applyFrequencySelection,
  daysOfMonthFromSchedule,
  formatEditorNextRunSummary,
  frequencySelectionFromCadence,
  isIntervalFrequencySelection,
  isManualFrequencySelection,
  monthlyScheduleFromDays,
  normalizeMonthlyCadence,
  twiceDaysAfterFirstChange,
  twiceFirstDayOptions,
  twiceSecondDayOptions,
  type AutoOrganizeCadence,
  type MonthlyMode,
  type TwiceMonthlyDays,
  formatShortIsoDateLabel,
  localDateIsoInTimeZone,
  tomorrowIsoInTimeZone,
  validateIntervalStartDate,
  maxIntervalStartDateIso,
} from '@/lib/autoOrganizeCadence'
import { useHideAmounts } from '@/lib/HideAmountsProvider'
import { scrollFocusedIntoView } from '@/lib/keyboardViewport'
import { sanitizeAmountInput } from '@/lib/amountInput'
import { type Bucket, type BucketDraft, defaultCadenceForKind, scheduleForKind, cadenceFromInitial, bucketDraftsFromBuckets, snapshotFromState, buildSnapshot } from '@/features/buckets/autoOrganizeEditorState'

type Props = {
  open: boolean
  /** null = create (kind picked in the editor); a row = edit (kind fixed). */
  initial: AutoOrganizeWithDetails | null
  buckets: Bucket[]
  /** For sweep-then-fill overlap notes when editing. */
  allAutoOrganizes?: AutoOrganizeWithDetails[]
  memberId: string
  /** null = household pool rule; a member id = a kid's own rule (set on create). */
  ownerMemberId?: string | null
  /** Household IANA timezone when known (from loaded auto-organize rows). */
  householdTimezone?: string | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}

const fieldInputClassName =
  'w-full rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-emerald-400'

const amountInputClassName =
  'w-full min-w-[8.5rem] rounded-lg border-0 bg-zinc-950 py-2 pl-7 pr-3 text-sm tabular-nums text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-emerald-400'

const bucketRowGridClassName =
  'grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3'

const scheduleRowGridClassName =
  'grid grid-cols-1 gap-3 sm:grid-cols-2'

const KIND_OPTIONS = [
  { value: 'organize', label: AUTO_ORGANIZE_KIND_ORGANIZE_LABEL },
  { value: 'top_up', label: AUTO_ORGANIZE_KIND_TOPUP_TAB_LABEL },
  { value: 'save_off', label: AUTO_ORGANIZE_KIND_SAVEOFF_TAB_LABEL },
] as const satisfies readonly { value: AutoOrganizeKind; label: string }[]

export default function AutoOrganizeEditor({
  open,
  initial,
  buckets,
  allAutoOrganizes = [],
  memberId,
  ownerMemberId = null,
  householdTimezone = null,
  onClose,
  onSaved,
}: Props) {
  const { formatMoney } = useHideAmounts()
  const browserTimezone = resolveFamilyTimezone(null)
  const [familyTimezone, setFamilyTimezone] = useState(browserTimezone)
  const todayIso = localDateIsoInTimeZone(familyTimezone)
  const tomorrowIso = tomorrowIsoInTimeZone(familyTimezone)
  const timezoneOptions = useMemo(
    () => familyTimezoneSelectOptions(familyTimezone),
    [familyTimezone],
  )
  const [baselineSnapshot, setBaselineSnapshot] = useState('')
  const [name, setName] = useState('')
  const [draftKind, setDraftKind] = useState<AutoOrganizeKind>('organize')
  const [cadence, setCadence] = useState<AutoOrganizeCadence>(() =>
    defaultCadenceForKind('organize', browserTimezone),
  )
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>('twice')
  // First day + the day it follows (+15). The second stays editable.
  const [twiceDays, setTwiceDays] = useState<TwiceMonthlyDays>({
    first: 1,
    second: 16,
  })
  const [monthlyOnceDay, setMonthlyOnceDay] = useState(1)
  const [bucketDrafts, setBucketDrafts] = useState<BucketDraft[]>(() =>
    bucketDraftsFromBuckets(buckets, undefined),
  )
  const [destinationBucketId, setDestinationBucketId] = useState<string | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)

  // Latest props for the initializer, read via refs so a data refresh (Realtime
  // reload, balance sync, returning from the background) does NOT re-run the
  // init effect and wipe in-progress input. We only (re)initialize when the form
  // opens or the edit target changes — see the effect's dependency array below.
  const bucketsRef = useRef(buckets)
  const initialRef = useRef(initial)
  const householdTimezoneRef = useRef(householdTimezone)
  const allAutoOrganizesRef = useRef(allAutoOrganizes)

  // Keep the initializer's source props current without making them deps of the
  // init effect. Declared before that effect so it runs first in the same commit.
  useEffect(() => {
    bucketsRef.current = buckets
    initialRef.current = initial
    householdTimezoneRef.current = householdTimezone
    allAutoOrganizesRef.current = allAutoOrganizes
  }, [buckets, initial, householdTimezone, allAutoOrganizes])

  // Stable identity of the edit target: a specific rule id, or null for "create".
  const initialId = initial?.id ?? null

  useEffect(() => {
    if (!open) {
      setDiscardOpen(false)
      return
    }

    const initialSnap = initialRef.current
    const bucketsSnap = bucketsRef.current
    const householdTz = householdTimezoneRef.current
    const hasHouseholdSchedule =
      allAutoOrganizesRef.current.length > 0 || initialSnap != null

    let cancelled = false

    void (async () => {
      const stored =
        initialSnap?.familyTimezone ??
        householdTz ??
        (await fetchFamilyTimezone())
      const nextTimezone = resolveFamilyTimezone(stored, {
        treatUtcAsUnset: !hasHouseholdSchedule,
      })
      if (cancelled) return

      const nextKind: AutoOrganizeKind =
        (initialSnap?.auto_organize_kind as AutoOrganizeKind | undefined) ??
        'organize'
      const nextCadence = normalizeMonthlyCadence(
        cadenceFromInitial(initialSnap, nextKind, nextTimezone),
      )
      const schedule = monthlyScheduleFromDays(nextCadence.daysOfMonth)
      const nextName = initialSnap?.name ?? ''
      const nextBuckets = bucketDraftsFromBuckets(bucketsSnap, initialSnap?.lines)
      const nextDest = initialSnap?.destination_bucket_id ?? null

      setDraftKind(nextKind)
      setFamilyTimezone(nextTimezone)
      setName(nextName)
      setCadence(nextCadence)
      setMonthlyMode(schedule.mode)
      setTwiceDays(schedule.twice)
      setMonthlyOnceDay(schedule.onceDay)
      setBucketDrafts(nextBuckets)
      setDestinationBucketId(nextDest)
      setError(null)
      setBaselineSnapshot(
        snapshotFromState(
          buildSnapshot(
            nextKind,
            nextName,
            nextTimezone,
            nextCadence,
            schedule.mode,
            schedule.twice,
            schedule.onceDay,
            nextBuckets,
            nextDest,
          ),
        ),
      )
    })()

    return () => {
      cancelled = true
    }
  }, [open, initialId])

  const effectiveKind = draftKind

  const sourceBuckets = useMemo(() => {
    if (effectiveKind !== 'save_off') return buckets
    if (!destinationBucketId) return buckets
    return buckets.filter((b) => b.id !== destinationBucketId)
  }, [buckets, destinationBucketId, effectiveKind])

  const parsedBuckets = useMemo(() => {
    const drafts =
      effectiveKind === 'save_off'
        ? bucketDrafts.filter(
            (row) =>
              !destinationBucketId || row.bucketId !== destinationBucketId,
          )
        : bucketDrafts

    return drafts
      .map((row) => ({
        bucketId: row.bucketId,
        amount: parseFloat(row.amountStr),
        amountStr: row.amountStr,
      }))
      .filter((row) => {
        if (!row.bucketId) return false
        if (effectiveKind === 'save_off') {
          return row.amountStr.trim() !== '' && Number.isFinite(row.amount) && row.amount >= 0
        }
        return Number.isFinite(row.amount) && row.amount > 0
      })
  }, [bucketDrafts, destinationBucketId, effectiveKind])

  const linesForTotal = useMemo(
    () =>
      parsedBuckets.map((row) => {
        const bucket = buckets.find((b) => b.id === row.bucketId)
        return {
          bucket_id: row.bucketId,
          amount: row.amount,
          bucket_allocated_amount: bucket
            ? Number(bucket.allocated_amount)
            : 0,
        }
      }),
    [parsedBuckets, buckets],
  )

  const { total: totalPerRun, isEstimate: totalIsEstimate } = useMemo(
    () => computeTotalPerRun(effectiveKind, linesForTotal),
    [effectiveKind, linesForTotal],
  )

  const frequencySelection = frequencySelectionFromCadence(
    cadence,
    monthlyMode,
  )
  const isManual = isManualFrequencySelection(frequencySelection)

  const sweepThenFillNotes = useMemo(() => {
    const bucketIds = new Set(parsedBuckets.map((r) => r.bucketId))
    return sweepThenFillNotesByBucket(
      allAutoOrganizes,
      bucketIds,
      effectiveKind,
      isManual,
      initial?.id ?? null,
    )
  }, [
    parsedBuckets,
    allAutoOrganizes,
    effectiveKind,
    isManual,
    initial?.id,
  ])

  const title = autoOrganizeKindLabel(effectiveKind)
  const bucketsSectionLabel = autoOrganizeBucketsSectionLabel(effectiveKind)
  const amountColumnLabel =
    effectiveKind === 'top_up'
      ? AUTO_ORGANIZE_TOPUP_FILL_TO_LABEL
      : effectiveKind === 'save_off'
        ? AUTO_ORGANIZE_SAVEOFF_KEEP_LABEL
        : null
  const intervalStartMin = tomorrowIso
  const intervalStartMax = maxIntervalStartDateIso(familyTimezone)
  const legacyStartDate = initial?.start_date ?? null
  const intervalStartLocked = Boolean(
    initial &&
      cadence.startDate &&
      cadence.startDate < todayIso,
  )

  function intervalStartDateError(candidate: string): string | null {
    const result = validateIntervalStartDate(candidate, familyTimezone, {
      legacyStartDate,
    })
    if (result.ok) return null
    if (result.ok === false && result.reason === 'today') {
      return AUTO_ORGANIZE_START_DATE_TODAY_ERROR
    }
    if (result.ok === false && result.reason === 'too_far') {
      return AUTO_ORGANIZE_START_DATE_TOO_FAR_ERROR
    }
    return AUTO_ORGANIZE_START_DATE_PAST_ERROR
  }
  const saveNextRunSummary = useMemo(() => {
    if (isManual) return AUTO_ORGANIZE_MANUAL_NEXT_RUN_LABEL

    if (
      isIntervalFrequencySelection(frequencySelection) &&
      !cadence.startDate
    ) {
      return null
    }

    const previewCadence: AutoOrganizeCadence =
      isIntervalFrequencySelection(frequencySelection)
        ? cadence
        : {
            autoOrganizeType: 'monthly',
            startDate: null,
            intervalCount: null,
            intervalUnit: null,
            daysOfMonth: daysOfMonthFromSchedule(
              frequencySelection === 'monthly-once' ? 'once' : 'twice',
              monthlyOnceDay,
              twiceDays,
            ),
          }

    return formatEditorNextRunSummary(previewCadence, familyTimezone, new Date(), {
      skipRunOnDates: initial?.occupiedRunOnDates,
    })
  }, [
    isManual,
    frequencySelection,
    cadence,
    twiceDays,
    monthlyOnceDay,
    familyTimezone,
    initial?.occupiedRunOnDates,
  ])

  function setFrequencySelection(selection: AutoOrganizeFrequencySelection) {
    const next = applyFrequencySelection(
      selection,
      cadence,
      monthlyMode,
      tomorrowIso,
    )
    setCadence(next.cadence)
    setMonthlyMode(next.monthlyMode)
  }

  function setIntervalStartDate(value: string) {
    if (!value) {
      setError(null)
      setCadence((prev) => ({ ...prev, startDate: null }))
      return
    }
    const message = intervalStartDateError(value)
    if (message) {
      setError(message)
      return
    }
    setError(null)
    setCadence((prev) => ({
      ...prev,
      startDate: value,
    }))
  }

  function clearIntervalStartDateErrorIfValid() {
    if (!cadence.startDate || intervalStartDateError(cadence.startDate)) return
    setError((current) =>
      current === AUTO_ORGANIZE_START_DATE_TODAY_ERROR ||
      current === AUTO_ORGANIZE_START_DATE_PAST_ERROR ||
      current === AUTO_ORGANIZE_START_DATE_TOO_FAR_ERROR
        ? null
        : current,
    )
  }

  function setAmountForBucket(bucketId: string, amountStr: string) {
    setBucketDrafts((prev) =>
      prev.map((row) =>
        row.bucketId === bucketId
          ? { ...row, amountStr: sanitizeAmountInput(amountStr) }
          : row,
      ),
    )
  }

  const isDirty =
    snapshotFromState(
      buildSnapshot(
        effectiveKind,
        name,
        familyTimezone,
        cadence,
        monthlyMode,
        twiceDays,
        monthlyOnceDay,
        bucketDrafts,
        destinationBucketId,
      ),
    ) !== baselineSnapshot

  function requestClose() {
    if (submitting) return
    if (isDirty) {
      setDiscardOpen(true)
      return
    }
    onClose()
  }

  function changeKind(next: AutoOrganizeKind) {
    if (next === draftKind) return
    // An untouched schedule follows the kind's default (set-asides every 2
    // weeks, top-ups on the 1st, save-offs on the last day).
    const current = { cadence, monthlyMode, twiceDays, monthlyOnceDay }
    const untouched =
      JSON.stringify(current) ===
      JSON.stringify(scheduleForKind(draftKind, familyTimezone))
    const schedule = untouched ? scheduleForKind(next, familyTimezone) : current
    if (untouched) {
      setCadence(schedule.cadence)
      setMonthlyMode(schedule.monthlyMode)
      setTwiceDays(schedule.twiceDays)
      setMonthlyOnceDay(schedule.monthlyOnceDay)
    }
    if (!isDirty) {
      setBaselineSnapshot(
        snapshotFromState(
          buildSnapshot(
            next,
            name,
            familyTimezone,
            schedule.cadence,
            schedule.monthlyMode,
            schedule.twiceDays,
            schedule.monthlyOnceDay,
            bucketDrafts,
            destinationBucketId,
          ),
        ),
      )
    }
    setDraftKind(next)
  }

  function confirmDiscard() {
    setDiscardOpen(false)
    onClose()
  }

  async function onSubmit() {
    if (parsedBuckets.length === 0) {
      setError(AUTO_ORGANIZE_NO_BUCKETS_ERROR)
      return
    }
    if (cadence.autoOrganizeType === 'interval' && !cadence.startDate) {
      setError('Choose a start date.')
      return
    }
    if (cadence.autoOrganizeType === 'interval' && cadence.startDate) {
      const message = intervalStartDateError(cadence.startDate)
      if (message) {
        setError(message)
        return
      }
    }
    if (!isValidIanaTimezone(familyTimezone)) {
      setError('Choose a valid timezone.')
      return
    }

    const cadenceToSave: AutoOrganizeCadence =
      cadence.autoOrganizeType === 'monthly'
        ? normalizeMonthlyCadence({
            ...cadence,
            daysOfMonth: daysOfMonthFromSchedule(
              monthlyMode,
              monthlyOnceDay,
              twiceDays,
            ),
          })
        : cadence

    const input: AutoOrganizeInput = {
      id: initial?.id,
      kind: effectiveKind,
      name: name.trim() || null,
      paused: initial?.paused ?? false,
      cadence: cadenceToSave,
      lines: parsedBuckets.map(({ bucketId, amount }) => ({ bucketId, amount })),
      destinationBucketId:
        effectiveKind === 'save_off' ? destinationBucketId : null,
      ownerMemberId: initial?.owner_member_id ?? ownerMemberId,
      familyTimezone,
    }

    setSubmitting(true)
    setError(null)
    try {
      await saveAutoOrganize(input, memberId)
      toast.success(AUTO_ORGANIZE_SAVED_TOAST)
      onClose()
      await Promise.resolve(onSaved())
    } catch (e) {
      setError(formatErrorMessage(e, 'Could not save Auto-bucket.'))
    } finally {
      setSubmitting(false)
    }
  }

  const frequencySelect = (
    <label className="block min-w-0">
      <FieldLabel>{AUTO_ORGANIZE_FREQUENCY_LABEL}</FieldLabel>
      <select
        value={frequencySelection}
        onChange={(e) =>
          setFrequencySelection(e.target.value as AutoOrganizeFrequencySelection)
        }
        className={fieldInputClassName}
      >
        {AUTO_ORGANIZE_FREQUENCY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <>
      <Sheet open={open} onClose={requestClose} aria-label={title}>
        <SheetHeader
          title={title}
          onClose={requestClose}
          disabled={submitting}
          centerClose={!initial}
        >
          {initial ? undefined : (
            <SegmentedTabs
              value={effectiveKind}
              options={KIND_OPTIONS}
              onChange={changeKind}
              ariaLabel={AUTO_ORGANIZE_KIND_TABS_LABEL}
              className="min-w-0 flex-1"
            />
          )}
        </SheetHeader>

        <div
          className="space-y-4"
          {...(initial
            ? {}
            : {
                id: `segmented-panel-${effectiveKind}`,
                role: 'tabpanel',
                'aria-labelledby': `segmented-tab-${effectiveKind}`,
              })}
        >
          <label className="block">
            <FieldLabel optional>Name</FieldLabel>
            <ClearableInput
              value={name}
              onValueChange={setName}
              placeholder={autoOrganizeNamePlaceholder(effectiveKind)}
              inputClassName={fieldInputClassName}
            />
          </label>

          {isManual ? (
            frequencySelect
          ) : isIntervalFrequencySelection(frequencySelection) ? (
            <div className={scheduleRowGridClassName}>
              {frequencySelect}
              <div className="block min-w-0">
                <FieldLabel>
                  {intervalStartLocked
                    ? AUTO_ORGANIZE_INTERVAL_STARTED_LABEL
                    : AUTO_ORGANIZE_INTERVAL_START_LABEL}
                </FieldLabel>
                {intervalStartLocked && cadence.startDate ? (
                  <p
                    className={`${fieldInputClassName} text-zinc-400`}
                    aria-readonly="true"
                  >
                    {formatShortIsoDateLabel(cadence.startDate)}
                  </p>
                ) : (
                  <input
                    type="date"
                    min={intervalStartMin}
                    max={intervalStartMax}
                    value={cadence.startDate ?? ''}
                    onChange={(e) => setIntervalStartDate(e.target.value)}
                    onBlur={clearIntervalStartDateErrorIfValid}
                    className={fieldInputClassName}
                  />
                )}
              </div>
            </div>
          ) : frequencySelection === 'monthly-once' ? (
            <div className={scheduleRowGridClassName}>
              {frequencySelect}
              <label className="block min-w-0">
                <FieldLabel>{AUTO_ORGANIZE_ONCE_MONTHLY_DAY_LABEL}</FieldLabel>
                <select
                  value={monthlyOnceDay}
                  onChange={(e) => setMonthlyOnceDay(Number(e.target.value))}
                  className={fieldInputClassName}
                >
                  {AUTO_ORGANIZE_ONCE_MONTHLY_DAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <>
              {frequencySelect}
              <div className={scheduleRowGridClassName}>
                <label className="block min-w-0">
                  <FieldLabel>{AUTO_ORGANIZE_TWICE_FIRST_DAY_LABEL}</FieldLabel>
                  <select
                    value={twiceDays.first}
                    onChange={(e) =>
                      setTwiceDays((prev) =>
                        twiceDaysAfterFirstChange(prev, Number(e.target.value)),
                      )
                    }
                    className={fieldInputClassName}
                  >
                    {twiceFirstDayOptions(twiceDays.first).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <FieldLabel>{AUTO_ORGANIZE_TWICE_SECOND_DAY_LABEL}</FieldLabel>
                  <select
                    value={twiceDays.second}
                    onChange={(e) =>
                      setTwiceDays((prev) => ({
                        ...prev,
                        second: Number(e.target.value),
                      }))
                    }
                    className={fieldInputClassName}
                  >
                    {twiceSecondDayOptions(twiceDays.first).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}

          <div className="border-t border-zinc-800 pt-4 pb-4">
            <FieldLabel>{bucketsSectionLabel}</FieldLabel>
            <div className="mt-2 space-y-2">
              {sourceBuckets.map((bucket) => {
                const amountStr =
                  bucketDrafts.find((row) => row.bucketId === bucket.id)
                    ?.amountStr ?? ''
                const sweepThenFillNote = sweepThenFillNotes.get(bucket.id)
                const balance = Number(bucket.allocated_amount)
                const entered =
                  amountStr.trim() !== '' && Number.isFinite(parseFloat(amountStr))
                const move = entered
                  ? autoOrganizeLineMoveAtRun(effectiveKind, {
                      bucket_id: bucket.id,
                      amount: parseFloat(amountStr),
                      bucket_allocated_amount: balance,
                    })
                  : 0
                const showPreview =
                  entered && effectiveKind !== 'organize'
                return (
                  <div key={bucket.id}>
                    <div className={bucketRowGridClassName}>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-300">
                          {bucket.name}
                        </p>
                        <p className="truncate text-xs tabular-nums text-zinc-500">
                          {formatMoney(balance)}
                          {showPreview ? (
                            move === 0 ? (
                              <> · {AUTO_ORGANIZE_AT_TARGET_LABEL}</>
                            ) : effectiveKind === 'top_up' ? (
                              <span className="font-medium text-emerald-300/90">
                                {' '}
                                · {autoOrganizeTopUpAddsNowLabel(move, formatMoney)}
                              </span>
                            ) : (
                              <span className="font-medium text-rose-300/90">
                                {' '}
                                · {autoOrganizeSaveOffMovesNowLabel(move, formatMoney)}
                              </span>
                            )
                          ) : null}
                        </p>
                      </div>
                      <div className="min-w-0">
                        {amountColumnLabel ? (
                          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            {amountColumnLabel}
                          </span>
                        ) : null}
                        <ClearableInput
                          wrapperClassName="min-w-0"
                          inputMode="decimal"
                          value={amountStr}
                          onValueChange={(value) =>
                            setAmountForBucket(bucket.id, value)
                          }
                          onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
                          placeholder={
                            effectiveKind === 'save_off' ? '' : '0.00'
                          }
                          leading={
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-500">
                              $
                            </span>
                          }
                          inputClassName={amountInputClassName}
                        />
                      </div>
                    </div>
                    {sweepThenFillNote ? (
                      <p className="mt-1 text-xs text-amber-200/80">
                        {sweepThenFillNote}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          {effectiveKind === 'save_off' ? (
            <label className="block">
              <FieldLabel>{AUTO_ORGANIZE_SAVEOFF_DESTINATION_LABEL}</FieldLabel>
              <select
                value={destinationBucketId ?? ''}
                onChange={(e) =>
                  setDestinationBucketId(e.target.value || null)
                }
                className={fieldInputClassName}
              >
                <option value="">{AUTO_ORGANIZE_SAVEOFF_DEST_FLOAT_LABEL}</option>
                {buckets.map((bucket) => (
                  <option key={bucket.id} value={bucket.id}>
                    {bucket.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <FieldLabel>{AUTO_ORGANIZE_TIMEZONE_LABEL}</FieldLabel>
            <select
              value={familyTimezone}
              onChange={(e) => setFamilyTimezone(e.target.value)}
              className={fieldInputClassName}
            >
              {timezoneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 space-y-2 border-t border-zinc-800 pt-3">
          <div className="rounded-xl bg-zinc-950 px-3 py-2 ring-1 ring-inset ring-zinc-700">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                {AUTO_ORGANIZE_ESTIMATED_TOTAL_LABEL}
              </p>
              <p className="text-xl font-semibold tabular-nums text-zinc-100">
                {totalIsEstimate && totalPerRun === 0 ? (
                  <span className="text-sm font-normal text-zinc-500">
                    {AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL}
                  </span>
                ) : (
                  <>
                    {totalIsEstimate ? '~' : ''}
                    {formatMoney(totalPerRun)}
                  </>
                )}
              </p>
            </div>
            {saveNextRunSummary ? (
              <div className="mt-2 border-t border-zinc-800 pt-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    {AUTO_ORGANIZE_NEXT_RUN_LABEL}
                  </p>
                  <p className="min-w-0 text-right text-xs leading-snug text-zinc-300">
                    {saveNextRunSummary}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <p
              className="break-words rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-inset ring-red-500/30"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={submitting}
              className="flex-1 rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void onSubmit()}
              className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Saving…' : AUTO_ORGANIZE_SAVE_LABEL}
            </button>
          </div>
        </div>
      </Sheet>

      <ConfirmSheet
        open={discardOpen}
        title={AUTO_ORGANIZE_DISCARD_TITLE}
        body={AUTO_ORGANIZE_DISCARD_BODY}
        confirmLabel={AUTO_ORGANIZE_DISCARD_CONFIRM}
        cancelLabel={AUTO_ORGANIZE_DISCARD_CANCEL}
        onConfirm={confirmDiscard}
        onClose={() => setDiscardOpen(false)}
      />
    </>
  )
}
