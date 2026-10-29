import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { LoadErrorPanel } from '@/components/ui/LoadErrorPanel'
import {
  AUTO_ORGANIZE_ADD_LABEL,
  AUTO_ORGANIZE_ADD_REQUIRES_BUCKETS_HINT,
  AUTO_ORGANIZE_DELETE_LABEL,
  autoOrganizeDeleteSheetBody,
  AUTO_ORGANIZE_DELETED_TOAST,
  AUTO_ORGANIZE_EDIT_LABEL,
  AUTO_ORGANIZE_EMPTY_BODY,
  AUTO_ORGANIZE_ESTIMATED_TOTAL_LABEL,
  AUTO_ORGANIZE_GUARDRAIL,
  AUTO_ORGANIZE_LOAD_ERROR_TITLE,
  AUTO_ORGANIZE_LOADING_ARIA_LABEL,
  AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL,
  AUTO_ORGANIZE_NO_BUCKETS_ERROR,
  AUTO_ORGANIZE_PAUSE_LABEL,
  AUTO_ORGANIZE_PAUSED_LABEL,
  autoOrganizePausedStatus,
  AUTO_ORGANIZE_RAN_TOAST,
  AUTO_ORGANIZE_RESUME_LABEL,
  AUTO_ORGANIZE_RUN_NOW_LABEL,
  AUTO_ORGANIZE_RUN_NOW_NOTHING_TO_MOVE,
  AUTO_ORGANIZE_RUN_NOW_SUBMITTING_LABEL,
  AUTO_ORGANIZE_RUN_NOW_AFTER_LABEL,
  AUTO_ORGANIZE_RUN_NOW_CURRENT_LABEL,
  AUTO_ORGANIZE_RUN_NOW_MOVE_LABEL,
  AUTO_ORGANIZE_AT_TARGET_LABEL,
  AUTO_ORGANIZE_SAVEOFF_KEEP_LABEL,
  AUTO_ORGANIZE_SAVEOFF_SWEEP_ALL_LABEL,
  AUTO_ORGANIZE_SECTION_TITLE,
  AUTO_ORGANIZE_TOPUP_FILL_TO_LABEL,
  AUTO_ORGANIZE_TOTAL_PER_RUN_LABEL,
  FLOAT_LABEL,
  autoOrganizeDeleteSheetTitle,
  autoOrganizeBucketsSectionLabel,
  autoOrganizeKindLabel,
  autoOrganizeKindSubtitle,
  autoOrganizeRunNowConfirmBodyForKind,
  autoOrganizeRunNowConfirmTitle,
  autoOrganizeSaveOffDestinationLabel,
  autoOrganizeSaveOffMovesNowLabel,
  autoOrganizeTopUpAddsNowLabel,
  autoOrganizeViewLinesLabel,
  type AutoOrganizeKind,
} from '@/lib/brand'
import {
  autoOrganizeLineMoveAtRun,
  activeAutoOrganizeLines,
  computeLineMoveAmount,
  computeTotalPerRun,
  deleteAutoOrganize,
  fetchAutoOrganizes,
  autoOrganizeDisplayName,
  orderAutoOrganizeLinesByBuckets,
  resolveAutoOrganizeLineBucketName,
  runAutoOrganizeNow,
  setAutoOrganizePaused,
  type AutoOrganizeWithDetails,
} from '@/lib/autoOrganize'
import { autoOrganizeRunNowLastRunContext } from '@/lib/autoOrganizeCadence'
import AutoOrganizeEditor from '@/features/buckets/AutoOrganizeEditor'
import AutoOrganizeKindChooser from '@/features/buckets/AutoOrganizeKindChooser'
import { useHideAmounts } from '@/lib/HideAmountsProvider'
import { usePostgresChanges } from '@/hooks/usePostgresChanges'
import { toast } from '@/lib/toast'
import { formatErrorMessage } from '@/lib/errorMessage'
import type { Database } from '@/types/database'

type Bucket = Pick<
  Database['public']['Tables']['buckets']['Row'],
  'id' | 'name' | 'owner_member_id' | 'allocated_amount'
>

type Props = {
  isAdmin: boolean
  /** A child viewer authors their OWN auto-organizes over their own buckets. */
  isChild: boolean
  memberId: string
  familyId: string
  accessToken: string | null
  buckets: Bucket[]
  float: number
  onChanged: () => void | Promise<void>
  /** Bump after parent-side changes (e.g. bucket delete) to reload auto-organize rows. */
  refreshToken?: number
  /** When true, rendered inside Buckets page tab panel (no section divider / title). */
  embedded?: boolean
}

type AutoOrganizeCardProps = {
  row: AutoOrganizeWithDetails
  buckets: Bucket[]
  bucketNamesById: ReadonlyMap<string, string>
  bucketBalanceById: ReadonlyMap<string, number>
  formatMoney: (amount: number) => string
  canAuthor: boolean
  /** Owner scope for line ordering: null = household pool, member id = a kid's own. */
  scopeOwnerId: string | null
  busyId: string | null
  onEdit: () => void
  onRunNow: () => void
  onPause: () => void
  onDelete: () => void
}

/**
 * One bucket line inside a rule card. Alternating tints give the eye a band to
 * follow from the bucket name to its amount, the same for every rule type.
 */
const lineRowClassName =
  'flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 odd:bg-zinc-800/50'
/**
 * Top-up and save-off rows carry a long right-hand phrase ("Leave at least $50 ·
 * Moves $50"). When name and phrase do not fit side by side the phrase drops to
 * its own right-aligned line instead of squeezing the name to nothing.
 */
const lineRowWrapClassName = lineRowClassName + ' flex-wrap gap-y-0.5'
const lineAmountClassName =
  'shrink-0 text-sm font-semibold tabular-nums text-emerald-300'

const runNowAmountGridClassName =
  'grid grid-cols-[minmax(0,1fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(4rem,1fr)] items-baseline gap-x-2'

const runNowAmountHeaderClassName =
  'text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500'

const runNowAmountCellClassName =
  'text-right text-xs tabular-nums tracking-tight'

function RunNowAmountHeader() {
  return (
    <div className={`${runNowAmountGridClassName} mb-1`} aria-hidden>
      <span />
      <span className={runNowAmountHeaderClassName}>
        {AUTO_ORGANIZE_RUN_NOW_CURRENT_LABEL}
      </span>
      <span className={runNowAmountHeaderClassName}>
        {AUTO_ORGANIZE_RUN_NOW_MOVE_LABEL}
      </span>
      <span className={runNowAmountHeaderClassName}>
        {AUTO_ORGANIZE_RUN_NOW_AFTER_LABEL}
      </span>
    </div>
  )
}

function RunNowAmountRow({
  label,
  before,
  move,
  after,
  formatMoney,
  moveOut = false,
  as: Tag = 'li',
}: {
  label: string
  before: number
  move: number
  after: number
  formatMoney: (amount: number) => string
  moveOut?: boolean
  as?: 'li' | 'div'
}) {
  const moveClassName = moveOut ? 'text-rose-400' : 'text-emerald-400'
  const movePrefix = moveOut ? '−' : '+'

  return (
    <Tag className={runNowAmountGridClassName}>
      <span className="truncate text-sm font-semibold text-zinc-300">{label}</span>
      <span className={`${runNowAmountCellClassName} text-zinc-500`}>
        {formatMoney(before)}
      </span>
      <span className={`${runNowAmountCellClassName} ${moveClassName}`}>
        {movePrefix} {formatMoney(move)}
      </span>
      <span className={`${runNowAmountCellClassName} text-zinc-400`}>
        {formatMoney(after)}
      </span>
    </Tag>
  )
}

function AutoOrganizeLoadingCards() {
  return (
    <div
      className="space-y-3"
      aria-busy="true"
      aria-label={AUTO_ORGANIZE_LOADING_ARIA_LABEL}
    >
      {[0, 1].map((key) => (
        <div
          key={key}
          className="animate-pulse rounded-2xl bg-zinc-900/80 px-4 py-4 ring-1 ring-zinc-800"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-36 rounded bg-zinc-800" />
              <div className="h-3 w-52 max-w-full rounded bg-zinc-800" />
              <div className="h-3 w-28 rounded bg-zinc-800" />
            </div>
            <div className="shrink-0 space-y-1.5 text-right">
              <div className="ml-auto h-2.5 w-16 rounded bg-zinc-800" />
              <div className="ml-auto h-5 w-20 rounded bg-zinc-800" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AutoOrganizeCard({
  row,
  buckets,
  bucketNamesById,
  bucketBalanceById,
  formatMoney,
  canAuthor,
  scopeOwnerId,
  busyId,
  onEdit,
  onRunNow,
  onPause,
  onDelete,
}: AutoOrganizeCardProps) {
  const [linesOpen, setLinesOpen] = useState(false)
  const kind = row.auto_organize_kind as AutoOrganizeKind
  const liveTotal = useMemo(
    () => computeTotalPerRun(kind, row.lines, bucketBalanceById),
    [kind, row.lines, bucketBalanceById],
  )
  const displayLines = useMemo(
    () => orderAutoOrganizeLinesByBuckets(row.lines, buckets, scopeOwnerId),
    [row.lines, buckets, scopeOwnerId],
  )
  const isManual = row.auto_organize_type === 'manual'
  const kindSubtitle = autoOrganizeKindSubtitle(kind, isManual)
  const lastRunContext = useMemo(() => {
    if (!row.lastRun) return null
    return autoOrganizeRunNowLastRunContext(row.lastRun, row.familyTimezone)
  }, [row.lastRun, row.familyTimezone])
  const saveOffDestLabel = autoOrganizeSaveOffDestinationLabel(
    row.destination_bucket_id
      ? resolveAutoOrganizeLineBucketName(
          {
            bucket_id: row.destination_bucket_id,
            bucket_name: row.destination_bucket_name,
          },
          bucketNamesById,
        )
      : null,
  )
  const pausedStatusId = `auto-organize-paused-${row.id}`
  const bucketsPanelId = `auto-organize-buckets-${row.id}`
  const displayName = autoOrganizeDisplayName(row)
  const hasCustomName = Boolean(row.name?.trim())
  const showPausedUi = row.paused && !isManual

  return (
    <article
      className={
        showPausedUi
          ? 'rounded-2xl bg-amber-500/5 px-4 py-4 ring-1 ring-amber-500/30'
          : 'rounded-2xl bg-zinc-900/80 px-4 py-4 ring-1 ring-zinc-800'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate font-semibold text-zinc-100">
              {displayName}
            </h3>
            {showPausedUi ? (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-500/35">
                {AUTO_ORGANIZE_PAUSED_LABEL}
              </span>
            ) : null}
            <span className="shrink-0 rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-zinc-700">
              {autoOrganizeKindLabel(kind)}
            </span>
          </div>
          {kindSubtitle ? (
            <p className="mt-1 text-xs text-zinc-500">{kindSubtitle}</p>
          ) : null}
          {kind === 'save_off' ? (
            <p className="mt-0.5 text-xs text-zinc-500">
              → {saveOffDestLabel}
            </p>
          ) : null}
          {hasCustomName ? (
            <p className="mt-1 text-xs text-zinc-400">{row.cadenceSummary}</p>
          ) : null}
          {showPausedUi ? (
            <>
              <p
                id={pausedStatusId}
                className="mt-1.5 text-xs font-medium text-amber-200/90"
              >
                {autoOrganizePausedStatus(!canAuthor)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{row.nextRunLabel}</p>
              {lastRunContext ? (
                <p
                  className={
                    lastRunContext.emphasize
                      ? 'mt-0.5 text-xs font-medium text-amber-200/90'
                      : 'mt-0.5 text-xs text-zinc-500'
                  }
                >
                  {lastRunContext.message}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-zinc-400">{row.nextRunLabel}</p>
              {lastRunContext ? (
                <p
                  className={
                    lastRunContext.emphasize
                      ? 'mt-0.5 text-xs font-medium text-amber-200/90'
                      : 'mt-0.5 text-xs text-zinc-500'
                  }
                >
                  {lastRunContext.message}
                </p>
              ) : null}
            </>
          )}
        </div>
        <div className="shrink-0 text-right">
          {liveTotal.isEstimate && liveTotal.total > 0 ? (
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {AUTO_ORGANIZE_ESTIMATED_TOTAL_LABEL}
            </p>
          ) : null}
          <p
            className={
              showPausedUi
                ? 'text-sm font-semibold tabular-nums text-zinc-400'
                : liveTotal.isEstimate && liveTotal.total === 0
                  ? 'text-xs text-zinc-500'
                  : 'text-sm font-semibold tabular-nums text-zinc-100'
            }
          >
            {liveTotal.isEstimate && liveTotal.total === 0 ? (
              AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL
            ) : (
              <>
                {liveTotal.isEstimate ? '~' : ''}
                {formatMoney(liveTotal.total)}
              </>
            )}
          </p>
        </div>
      </div>
      {displayLines.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setLinesOpen((open) => !open)}
            aria-expanded={linesOpen}
            aria-controls={bucketsPanelId}
            className="flex w-full items-center justify-start gap-1.5 rounded-lg py-1 text-left text-xs text-zinc-400 transition hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            <span className="min-w-0 truncate font-semibold">
              {linesOpen
                ? autoOrganizeBucketsSectionLabel(kind)
                : autoOrganizeViewLinesLabel(kind, displayLines.length)}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className={
                'h-4 w-4 shrink-0 motion-safe:transition-transform motion-safe:duration-200 ' +
                (linesOpen ? 'rotate-180' : '')
              }
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div
            id={bucketsPanelId}
            className={
              'grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ' +
              (linesOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')
            }
          >
            <div className="min-h-0 overflow-hidden">
              <ul className="space-y-0.5 border-t border-zinc-800 pt-2">
                {displayLines.map((line) => {
                  const configured = Number(line.amount)
                  const move = autoOrganizeLineMoveAtRun(
                    kind,
                    line,
                    bucketBalanceById,
                  )
                  if (kind === 'top_up') {
                    return (
                      <li key={line.id} className={lineRowWrapClassName}>
                        <span className="max-w-full truncate">
                          {resolveAutoOrganizeLineBucketName(line, bucketNamesById)}
                        </span>
                        <span className="ml-auto text-right text-xs tabular-nums text-zinc-400">
                          {AUTO_ORGANIZE_TOPUP_FILL_TO_LABEL}{' '}
                          {formatMoney(configured)}
                          {move === 0 ? (
                            <span className="ml-1 text-zinc-500">
                              · {AUTO_ORGANIZE_AT_TARGET_LABEL}
                            </span>
                          ) : (
                            <span className="ml-1 font-medium text-emerald-300/90">
                              ·{' '}
                              {autoOrganizeTopUpAddsNowLabel(move, formatMoney)}
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  }
                  if (kind === 'save_off') {
                    const keepLabel =
                      configured === 0
                        ? AUTO_ORGANIZE_SAVEOFF_SWEEP_ALL_LABEL
                        : `${AUTO_ORGANIZE_SAVEOFF_KEEP_LABEL} ${formatMoney(configured)}`
                    return (
                      <li key={line.id} className={lineRowWrapClassName}>
                        <span className="max-w-full truncate">
                          {resolveAutoOrganizeLineBucketName(
                            line,
                            bucketNamesById,
                          )}
                        </span>
                        <span className="ml-auto text-right text-xs tabular-nums text-zinc-400">
                          {keepLabel}
                          {move === 0 ? (
                            <span className="ml-1 text-zinc-500">
                              · {AUTO_ORGANIZE_AT_TARGET_LABEL}
                            </span>
                          ) : (
                            <span className="ml-1 font-medium text-rose-300/90">
                              ·{' '}
                              {autoOrganizeSaveOffMovesNowLabel(
                                move,
                                formatMoney,
                              )}
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  }
                  return (
                    <li key={line.id} className={lineRowClassName}>
                      <span className="truncate">
                        {resolveAutoOrganizeLineBucketName(line, bucketNamesById)}
                      </span>
                      <span className={lineAmountClassName}>
                        + {formatMoney(configured)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
      {canAuthor ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busyId === row.id}
            onClick={onEdit}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-200 ring-1 ring-zinc-700 hover:bg-zinc-800"
          >
            {AUTO_ORGANIZE_EDIT_LABEL}
          </button>
          <button
            type="button"
            disabled={busyId === row.id || showPausedUi || liveTotal.total <= 0}
            onClick={onRunNow}
            aria-describedby={showPausedUi ? pausedStatusId : undefined}
            title={
              liveTotal.total <= 0 && !showPausedUi
                ? liveTotal.isEstimate
                  ? AUTO_ORGANIZE_RUN_NOW_NOTHING_TO_MOVE
                  : AUTO_ORGANIZE_NO_BUCKETS_ERROR
                : undefined
            }
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {AUTO_ORGANIZE_RUN_NOW_LABEL}
          </button>
          {!isManual ? (
            <button
              type="button"
              disabled={busyId === row.id}
              onClick={onPause}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-200 ring-1 ring-zinc-700 hover:bg-zinc-800"
            >
              {row.paused ? AUTO_ORGANIZE_RESUME_LABEL : AUTO_ORGANIZE_PAUSE_LABEL}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busyId === row.id}
            onClick={onDelete}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/10"
          >
            {AUTO_ORGANIZE_DELETE_LABEL}
          </button>
        </div>
      ) : null}
    </article>
  )
}

export default function AutoOrganizeSection({
  isAdmin,
  isChild,
  memberId,
  familyId,
  accessToken,
  buckets,
  float,
  onChanged,
  refreshToken = 0,
  embedded = false,
}: Props) {
  const { formatMoney } = useHideAmounts()
  // An admin authors the household pool; a kid authors their own scope. A
  // shared member is read-only. scopeOwnerId selects which buckets a rule can
  // target (null = family pool, the kid's id = the kid's own buckets).
  const canAuthor = isAdmin || isChild
  const scopeOwnerId = isChild ? memberId : null
  // Memoized so the editor receives a referentially stable `buckets` prop —
  // an unstable array would otherwise churn its memo deps on every re-render.
  const scopeBuckets = useMemo(
    () => buckets.filter((b) => b.owner_member_id === scopeOwnerId),
    [buckets, scopeOwnerId],
  )
  const bucketNamesById = useMemo(
    () => new Map(buckets.map((b) => [b.id, b.name])),
    [buckets],
  )
  const bucketBalanceById = useMemo(
    () => new Map(buckets.map((b) => [b.id, Number(b.allocated_amount)])),
    [buckets],
  )
  const [rows, setRows] = useState<AutoOrganizeWithDetails[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorKind, setEditorKind] = useState<AutoOrganizeKind>('organize')
  const [kindChooserOpen, setKindChooserOpen] = useState(false)
  const [editing, setEditing] = useState<AutoOrganizeWithDetails | null>(null)
  const [runConfirm, setRunConfirm] = useState<AutoOrganizeWithDetails | null>(
    null,
  )
  const [deleteConfirm, setDeleteConfirm] =
    useState<AutoOrganizeWithDetails | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function rowDisplayName(row: AutoOrganizeWithDetails): string {
    return autoOrganizeDisplayName(row)
  }

  const loadRows = useCallback(async () => {
    try {
      setLoadError(null)
      const data = await fetchAutoOrganizes()
      setRows(data)
    } catch (e) {
      setLoadError(formatErrorMessage(e, 'Could not load Auto-bucket.'))
    }
  }, [])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    if (refreshToken === 0) return
    void loadRows()
  }, [refreshToken, loadRows])

  usePostgresChanges(
    accessToken,
    familyId ? `auto-organize:${familyId}` : null,
    familyId
      ? [
          {
            event: '*' as const,
            table: 'auto_organizes',
            filter: `family_id=eq.${familyId}`,
          },
          {
            event: '*' as const,
            table: 'auto_organize_lines',
          },
          {
            event: '*' as const,
            table: 'auto_organize_runs',
            filter: `family_id=eq.${familyId}`,
          },
        ]
      : [],
    () => {
      void loadRows()
    },
  )

  async function handlePause(id: string, paused: boolean) {
    setBusyId(id)
    try {
      await setAutoOrganizePaused(id, paused)
      await loadRows()
    } catch (e) {
      toast.error(formatErrorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    setBusyId(deleteConfirm.id)
    try {
      await deleteAutoOrganize(deleteConfirm.id)
      setDeleteConfirm(null)
      await loadRows()
      await Promise.resolve(onChanged())
      toast.success(AUTO_ORGANIZE_DELETED_TOAST)
    } catch (e) {
      toast.error(formatErrorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmRunNow() {
    if (!runConfirm) return
    setBusyId(runConfirm.id)
    try {
      await runAutoOrganizeNow(runConfirm.id, memberId)
      setRunConfirm(null)
      await loadRows()
      await Promise.resolve(onChanged())
      toast.success(AUTO_ORGANIZE_RAN_TOAST)
    } catch (e) {
      toast.error(formatErrorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const empty = rows && rows.length === 0
  const runConfirmKind = (runConfirm?.auto_organize_kind ??
    'organize') as AutoOrganizeKind
  const runConfirmLines = useMemo(
    () =>
      runConfirm
        ? activeAutoOrganizeLines(
            orderAutoOrganizeLinesByBuckets(
              runConfirm.lines,
              buckets,
              scopeOwnerId,
            ),
            runConfirmKind,
            bucketBalanceById,
          )
        : [],
    [runConfirm, buckets, runConfirmKind, bucketBalanceById, scopeOwnerId],
  )

  const runConfirmComputed = useMemo(() => {
    if (!runConfirm) {
      return {
        lineMoves: [] as { lineId: string; label: string; before: number; move: number; after: number; moveOut: boolean }[],
        totalMove: 0,
        floatBefore: float,
        floatAfter: float,
        showFloatRow: false,
        floatMoveOut: false,
        destinationLabel: null as string | null,
      }
    }
    const kind = runConfirmKind
    let totalMove = 0
    const lineMoves = runConfirmLines.map((line) => {
      const configured = Number(line.amount)
      const before =
        bucketBalanceById.get(line.bucket_id) ??
        Number(line.bucket_allocated_amount ?? 0)
      const move = computeLineMoveAmount(kind, configured, before)
      totalMove += move
      if (kind === 'save_off') {
        return {
          lineId: line.id,
          label: resolveAutoOrganizeLineBucketName(line, bucketNamesById),
          before,
          move,
          after: before - move,
          moveOut: true,
        }
      }
      return {
        lineId: line.id,
        label: resolveAutoOrganizeLineBucketName(line, bucketNamesById),
        before,
        move,
        after: before + move,
        moveOut: false,
      }
    })

    if (kind === 'save_off') {
      const destName = runConfirm.destination_bucket_id
        ? resolveAutoOrganizeLineBucketName(
            {
              bucket_id: runConfirm.destination_bucket_id,
              bucket_name: runConfirm.destination_bucket_name,
            },
            bucketNamesById,
          )
        : FLOAT_LABEL
      const destBefore = runConfirm.destination_bucket_id
        ? bucketBalanceById.get(runConfirm.destination_bucket_id) ?? 0
        : float
      return {
        lineMoves,
        totalMove,
        floatBefore: float,
        floatAfter: runConfirm.destination_bucket_id ? float : float + totalMove,
        showFloatRow: !runConfirm.destination_bucket_id,
        floatMoveOut: false,
        destinationLabel: destName,
        destinationBefore: destBefore,
        destinationAfter: destBefore + totalMove,
        showDestinationRow:
          totalMove > 0 && Boolean(runConfirm.destination_bucket_id),
      }
    }

    return {
      lineMoves,
      totalMove,
      floatBefore: float,
      floatAfter: float - totalMove,
      showFloatRow: true,
      floatMoveOut: true,
      destinationLabel: null,
      destinationBefore: 0,
      destinationAfter: 0,
      showDestinationRow: false,
    }
  }, [
    runConfirm,
    runConfirmKind,
    runConfirmLines,
    bucketBalanceById,
    bucketNamesById,
    float,
  ])

  const runConfirmLastRunContext = useMemo(() => {
    if (!runConfirm?.lastRun) return null
    return autoOrganizeRunNowLastRunContext(
      runConfirm.lastRun,
      runConfirm.familyTimezone,
    )
  }, [runConfirm])

  const addButtonClassName =
    'shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50'

  function openAddFlow() {
    setEditing(null)
    setKindChooserOpen(true)
  }

  function openEditorWithKind(kind: AutoOrganizeKind) {
    setEditorKind(kind)
    setKindChooserOpen(false)
    setEditorOpen(true)
  }

  // Shared members are read-only — no empty-state CTA, so hide the section entirely
  // until an admin has created at least one auto-organize. Authors (admin or a
  // kid managing their own scope) always see it, including the empty-state CTA.
  if (!canAuthor && (rows === null || rows.length === 0)) {
    return null
  }

  return (
    <section
      className={
        embedded
          ? 'space-y-3'
          : 'space-y-3 border-t border-zinc-800 pt-6'
      }
      aria-label={AUTO_ORGANIZE_SECTION_TITLE}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className={
              embedded
                ? 'sr-only'
                : 'text-lg font-semibold'
            }
          >
            {AUTO_ORGANIZE_SECTION_TITLE}
          </h2>
          <p className={embedded ? 'text-xs text-zinc-400' : 'mt-1 text-xs text-zinc-400'}>
            {AUTO_ORGANIZE_GUARDRAIL}
          </p>
        </div>
        {canAuthor && rows && !empty ? (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              disabled={scopeBuckets.length === 0}
              onClick={openAddFlow}
              className={addButtonClassName}
            >
              {AUTO_ORGANIZE_ADD_LABEL}
            </button>
            {scopeBuckets.length === 0 ? (
              <p className="text-right text-xs text-zinc-500">
                {AUTO_ORGANIZE_ADD_REQUIRES_BUCKETS_HINT}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {loadError ? (
        <LoadErrorPanel
          title={AUTO_ORGANIZE_LOAD_ERROR_TITLE}
          message={loadError}
          onRetry={() => void loadRows()}
        />
      ) : null}

      {empty && canAuthor && !loadError ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 px-4 py-5 text-center">
          <p className="text-sm text-zinc-300">{AUTO_ORGANIZE_EMPTY_BODY}</p>
          {scopeBuckets.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              {AUTO_ORGANIZE_ADD_REQUIRES_BUCKETS_HINT}
            </p>
          ) : null}
          <button
            type="button"
            disabled={scopeBuckets.length === 0}
            onClick={openAddFlow}
            className={`mt-3 inline-flex ${addButtonClassName}`}
          >
            {AUTO_ORGANIZE_ADD_LABEL}
          </button>
        </div>
      ) : null}

      {rows === null && !loadError ? <AutoOrganizeLoadingCards /> : null}

      {rows?.map((row) => (
        <AutoOrganizeCard
          key={row.id}
          row={row}
          buckets={buckets}
          bucketNamesById={bucketNamesById}
          bucketBalanceById={bucketBalanceById}
          formatMoney={formatMoney}
          canAuthor={canAuthor}
          scopeOwnerId={scopeOwnerId}
          busyId={busyId}
          onEdit={() => {
            setEditing(row)
            setEditorKind(row.auto_organize_kind as AutoOrganizeKind)
            setEditorOpen(true)
          }}
          onRunNow={() => setRunConfirm(row)}
          onPause={() => void handlePause(row.id, !row.paused)}
          onDelete={() => setDeleteConfirm(row)}
        />
      ))}

      <AutoOrganizeKindChooser
        open={kindChooserOpen}
        onClose={() => setKindChooserOpen(false)}
        onSelect={openEditorWithKind}
      />

      <AutoOrganizeEditor
        open={editorOpen}
        kind={editorKind}
        initial={editing}
        buckets={scopeBuckets}
        allAutoOrganizes={rows ?? []}
        memberId={memberId}
        ownerMemberId={scopeOwnerId}
        householdTimezone={rows?.[0]?.familyTimezone ?? null}
        onClose={() => setEditorOpen(false)}
        onSaved={async () => {
          await loadRows()
          await Promise.resolve(onChanged())
        }}
      />

      <Sheet
        open={runConfirm !== null}
        onClose={() => setRunConfirm(null)}
        aria-label={
          runConfirm
            ? autoOrganizeRunNowConfirmTitle(rowDisplayName(runConfirm))
            : 'Confirm run'
        }
      >
        {runConfirm ? (
          <div>
            <header className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-zinc-300">
                {autoOrganizeRunNowConfirmTitle(rowDisplayName(runConfirm))}
              </h2>
              <button
                type="button"
                onClick={() => setRunConfirm(null)}
                disabled={busyId === runConfirm.id}
                className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className="space-y-4">
                <p className="text-sm text-zinc-300">
                  {autoOrganizeRunNowConfirmBodyForKind(
                    runConfirmKind,
                    formatMoney(runConfirmComputed.totalMove),
                  )}
                </p>
                {runConfirmLastRunContext ? (
                  <p
                    className={
                      runConfirmLastRunContext.emphasize
                        ? 'rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200 ring-1 ring-amber-500/30'
                        : 'rounded-lg bg-zinc-900/80 px-3 py-2 text-sm text-zinc-400 ring-1 ring-zinc-800'
                    }
                  >
                    {runConfirmLastRunContext.message}
                  </p>
                ) : null}
                <div className="border-t border-zinc-800 pt-4 pb-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                    {autoOrganizeBucketsSectionLabel(runConfirmKind)}
                  </p>
                  <div className="mt-2">
                    <RunNowAmountHeader />
                    <ul className="space-y-2">
                    {runConfirmComputed.lineMoves.map((row) => (
                        <RunNowAmountRow
                          key={row.lineId}
                          label={row.label}
                          before={row.before}
                          move={row.move}
                          after={row.after}
                          formatMoney={formatMoney}
                          moveOut={row.moveOut}
                        />
                      ))}
                    {runConfirmComputed.showDestinationRow &&
                    runConfirmComputed.destinationLabel ? (
                      <RunNowAmountRow
                        label={runConfirmComputed.destinationLabel}
                        before={runConfirmComputed.destinationBefore ?? 0}
                        move={runConfirmComputed.totalMove}
                        after={runConfirmComputed.destinationAfter ?? 0}
                        formatMoney={formatMoney}
                      />
                    ) : null}
                    </ul>
                  </div>
                </div>
            </div>

            <div className="mt-4 space-y-3 border-t border-zinc-800 pt-3">
              <div className="rounded-xl bg-zinc-950 px-3 py-2 ring-1 ring-inset ring-zinc-700">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    {runConfirmKind === 'organize'
                      ? AUTO_ORGANIZE_TOTAL_PER_RUN_LABEL
                      : AUTO_ORGANIZE_ESTIMATED_TOTAL_LABEL}
                  </p>
                  <p className="text-xl font-semibold tabular-nums text-zinc-100">
                    {runConfirmComputed.totalMove === 0 ? (
                      <span className="text-sm font-normal text-zinc-500">
                        {AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL}
                      </span>
                    ) : (
                      formatMoney(runConfirmComputed.totalMove)
                    )}
                  </p>
                </div>
                {runConfirmComputed.showFloatRow ? (
                <div className="mt-2 border-t border-zinc-800 pt-2">
                  <RunNowAmountHeader />
                  <RunNowAmountRow
                    as="div"
                    label={FLOAT_LABEL}
                    before={runConfirmComputed.floatBefore}
                    move={runConfirmComputed.totalMove}
                    after={runConfirmComputed.floatAfter}
                    formatMoney={formatMoney}
                    moveOut={runConfirmComputed.floatMoveOut}
                  />
                </div>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRunConfirm(null)}
                  disabled={busyId === runConfirm.id}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    busyId === runConfirm.id ||
                    runConfirmComputed.totalMove === 0
                  }
                  onClick={() => void confirmRunNow()}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
                >
                  {busyId === runConfirm.id
                    ? AUTO_ORGANIZE_RUN_NOW_SUBMITTING_LABEL
                    : AUTO_ORGANIZE_RUN_NOW_LABEL}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        aria-label={
          deleteConfirm
            ? autoOrganizeDeleteSheetTitle(rowDisplayName(deleteConfirm))
            : 'Confirm delete'
        }
      >
        {deleteConfirm ? (
          <>
            <header className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-zinc-300">
                {autoOrganizeDeleteSheetTitle(rowDisplayName(deleteConfirm))}
              </h2>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={busyId === deleteConfirm.id}
                className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="space-y-4">
              <p className="text-sm text-zinc-300">
                {autoOrganizeDeleteSheetBody(
                  deleteConfirm.auto_organize_type === 'manual',
                )}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={busyId === deleteConfirm.id}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busyId === deleteConfirm.id}
                  onClick={() => void confirmDelete()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {AUTO_ORGANIZE_DELETE_LABEL}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </Sheet>
    </section>
  )
}
