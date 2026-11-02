import { useMemo, useState } from 'react'
import {
  AUTO_ORGANIZE_DELETE_LABEL,
  AUTO_ORGANIZE_EDIT_LABEL,
  AUTO_ORGANIZE_ESTIMATED_TOTAL_LABEL,
  AUTO_ORGANIZE_LOADING_ARIA_LABEL,
  AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL,
  AUTO_ORGANIZE_NO_BUCKETS_ERROR,
  AUTO_ORGANIZE_PAUSE_LABEL,
  AUTO_ORGANIZE_PAUSED_LABEL,
  autoOrganizePausedStatus,
  AUTO_ORGANIZE_RESUME_LABEL,
  AUTO_ORGANIZE_RUN_NOW_LABEL,
  AUTO_ORGANIZE_RUN_NOW_NOTHING_TO_MOVE,
  AUTO_ORGANIZE_AT_TARGET_LABEL,
  AUTO_ORGANIZE_SAVEOFF_KEEP_LABEL,
  AUTO_ORGANIZE_SAVEOFF_SWEEP_ALL_LABEL,
  AUTO_ORGANIZE_TOPUP_FILL_TO_LABEL,
  autoOrganizeBucketsSectionLabel,
  autoOrganizeKindLabel,
  autoOrganizeSaveOffDestinationLabel,
  autoOrganizeSaveOffMovesNowLabel,
  autoOrganizeTopUpAddsNowLabel,
  autoOrganizeViewLinesLabel,
  type AutoOrganizeKind,
} from '@/lib/brand'
import {
  autoOrganizeLineMoveAtRun,
  computeTotalPerRun,
  autoOrganizeDisplayName,
  orderAutoOrganizeLinesByBuckets,
  resolveAutoOrganizeLineBucketName,
  type AutoOrganizeWithDetails,
} from '@/lib/autoOrganize'
import { autoOrganizeRunNowLastRunContext } from '@/lib/autoOrganizeCadence'
import type { Database } from '@/types/database'

export type Bucket = Pick<
  Database['public']['Tables']['buckets']['Row'],
  'id' | 'name' | 'owner_member_id' | 'allocated_amount'
>

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

export function AutoOrganizeLoadingCards() {
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

export function AutoOrganizeCard({
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
