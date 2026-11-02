import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { LoadErrorPanel } from '@/components/ui/LoadErrorPanel'
import {
  AUTO_ORGANIZE_ADD_LABEL,
  AUTO_ORGANIZE_ADD_REQUIRES_BUCKETS_HINT,
  AUTO_ORGANIZE_DELETE_LABEL,
  AUTO_ORGANIZE_DELETE_SHEET_BODY,
  AUTO_ORGANIZE_DELETED_TOAST,
  AUTO_ORGANIZE_EMPTY_BODY,
  AUTO_ORGANIZE_ESTIMATED_TOTAL_LABEL,
  AUTO_ORGANIZE_LOAD_ERROR_TITLE,
  AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL,
  AUTO_ORGANIZE_RAN_TOAST,
  AUTO_ORGANIZE_RUN_NOW_LABEL,
  AUTO_ORGANIZE_RUN_NOW_SUBMITTING_LABEL,
  AUTO_ORGANIZE_SECTION_TITLE,
  AUTO_ORGANIZE_TOTAL_PER_RUN_LABEL,
  FLOAT_LABEL,
  autoOrganizeDeleteSheetTitle,
  autoOrganizeBucketsSectionLabel,
  autoOrganizeRunNowConfirmBodyForKind,
  autoOrganizeRunNowConfirmTitle,
  type AutoOrganizeKind,
} from '@/lib/brand'
import {
  activeAutoOrganizeLines,
  computeLineMoveAmount,
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
import { useHideAmounts } from '@/lib/HideAmountsProvider'
import { usePostgresChanges } from '@/hooks/usePostgresChanges'
import { toast } from '@/lib/toast'
import { formatErrorMessage } from '@/lib/errorMessage'
import { type Bucket, AutoOrganizeLoadingCards, AutoOrganizeCard } from '@/features/buckets/AutoOrganizeCard'
import { RunNowAmountHeader, RunNowAmountRow } from '@/features/buckets/AutoOrganizeRunNowRows'

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
            setEditorOpen(true)
          }}
          onRunNow={() => setRunConfirm(row)}
          onPause={() => void handlePause(row.id, !row.paused)}
          onDelete={() => setDeleteConfirm(row)}
        />
      ))}

      <AutoOrganizeEditor
        open={editorOpen}
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
                    <ul className="space-y-0.5">
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

      {deleteConfirm ? (
        <ConfirmSheet
          title={autoOrganizeDeleteSheetTitle(rowDisplayName(deleteConfirm))}
          body={AUTO_ORGANIZE_DELETE_SHEET_BODY}
          confirmLabel={AUTO_ORGANIZE_DELETE_LABEL}
          busy={busyId === deleteConfirm.id}
          onConfirm={() => void confirmDelete()}
          onClose={() => setDeleteConfirm(null)}
        />
      ) : null}
    </section>
  )
}
