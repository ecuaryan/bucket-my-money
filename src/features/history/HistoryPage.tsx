import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { useStuckHeadings } from '@/hooks/useStuckHeadings'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { usePostgresChanges } from '@/hooks/usePostgresChanges'
import { useGiveRecipients } from '@/hooks/GiveRecipientsProvider'
import { useAuth } from '@/lib/auth'
import {
  HISTORY_EMPTY_BODY,
  HISTORY_EMPTY_BUCKET_BODY,
  HISTORY_EMPTY_SENDS_BODY,
  HISTORY_FILTER_GIVES_AND_TAKES,
  HISTORY_NOTE_ADD,
  HISTORY_NOTE_CLEAR,
  HISTORY_NOTE_EDIT,
  HISTORY_NOTE_SAVED,
  HISTORY_NOTE_SHEET_TITLE_ADD,
  HISTORY_NOTE_SHEET_TITLE_EDIT,
  LOADING_STATUS_LABEL,
  TRANSACTION_NOTE_FIELD_LABEL,
  TRANSACTION_NOTE_PLACEHOLDER,
} from '@/lib/brand'
import { LoadErrorPanel } from '@/components/ui/LoadErrorPanel'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import HistoryPageSkeleton from '@/components/HistoryPageSkeleton'
import { ClearableInput } from '@/components/ui/ClearableInput'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Sheet } from '@/components/ui/Sheet'
import { useHideAmounts, usePeekTarget } from '@/lib/HideAmountsProvider'
import { scrollFocusedIntoView } from '@/lib/keyboardViewport'
import { updateTransactionNote } from '@/lib/transactions'
import { toast } from '@/lib/toast'
import type { Database } from '@/types/database'
import {
  filterFromSearchParams,
  historyFilterSearchKey,
  searchParamsForFilter,
  GIVE_FILTER_VALUE,
  type HistoryFilter,
} from '@/features/history/historyFilters'
import {
  fetchHistoryPage,
  fetchHistoryTotal,
  applyHistoryHeadRefresh,
  stripJustArrived,
  type HistoryDisplayRow,
} from '@/features/history/historyQueries'
import { historyCountState } from '@/features/history/historyCount'
import {
  readHistoryBucketsCache,
  readHistoryPageCache,
  writeHistoryBucketsCache,
  writeHistoryPageCache,
} from '@/lib/historyPageCache'
import { HISTORY_ROW_ARRIVED_CLEAR_MS } from '@/features/history/historyRowExpand'
import { useHistoryRowExpandAnimation } from '@/features/history/useHistoryRowExpandAnimation'
import { withAuthLockRetry } from '@/lib/authLockError'
import {
  isAppBackgroundExpired,
  isSessionGateActive,
} from '@/lib/backgroundSignOut'
import {
  bucketEndpointLabel,
  historyBucketMoveSubtitle,
  historyGiveActor,
  historyGiveSubtitle,
  historyShowBucketMoveActor,
  historyShowGiveActor,
  historyTakeSubtitle,
  isParentTakeFromChild,
  giveMemberEndpointLabel,
} from '@/lib/historyLabels'
import { HistoryEntityTransfer } from '@/features/history/HistoryEntityTransfer'
import { historyBalanceSides } from '@/lib/historyBalanceSides'
import { historyTransactionNoteDisplay } from '@/lib/historyTransactionNote'
import { APP_CHROME_Z_INDEX } from '@/components/layout/navLayout'
import { useSheetBackdropOpen } from '@/hooks/useSheetBackdropOpen'

type TxRow = HistoryDisplayRow

type Bucket = Pick<
  Database['public']['Tables']['buckets']['Row'],
  'id' | 'name' | 'display_order' | 'created_at'
>

// Initial render and Realtime refreshes pull only the most recent few
// rows — most sessions just want "what happened today" and a tiny
// payload makes that snappier. Tapping "Load older" pulls larger
// pages from there on, since at that point the user is intentionally
// digging through history.
const INITIAL_PAGE_SIZE = 10
const MORE_PAGE_SIZE = 50
const REALTIME_REFRESH_DEBOUNCE_MS = 300

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
})

function filterForKey(filterKey: string): HistoryFilter {
  return filterFromSearchParams(new URLSearchParams(filterKey))
}

export default function HistoryPage() {
  const auth = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const filterKey = historyFilterSearchKey(searchParams)
  const filter = useMemo(() => filterForKey(filterKey), [filterKey])

  const [rows, setRows] = useState<TxRow[] | null>(null)
  // Only offer Peek when there are actually amounts on screen.
  usePeekTarget((rows?.length ?? 0) > 0)
  const { formatMoney, hidden, hasPeekTarget } = useHideAmounts()
  const sheetOpen = useSheetBackdropOpen()
  // The filter's bucket list: shown instantly from the last visit while a fresh
  // copy loads (see loadBuckets), so the filter bar never waits on the network.
  const [buckets, setBuckets] = useState<Bucket[] | null>(() => {
    const m = auth.status === 'signedIn' ? auth.member : null
    return m ? readHistoryBucketsCache(m.family_id, m.id) : null
  })
  const bucketsRequestedRef = useRef(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  // Exact number of transactions matching the current filter (from the first
  // page's response); null until known.
  const [total, setTotal] = useState<number | null>(null)
  // True once the separate total request has finished (even if it failed).
  const [totalSettled, setTotalSettled] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Transaction selection for summing: id -> amount snapshot. A Map instead
  // of deriving from `rows` so the selection — and its total — survives
  // filter changes and realtime refreshes.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedAmounts, setSelectedAmounts] = useState<Map<string, number>>(
    () => new Map(),
  )

  // Bump when family or filter changes so stale async work cannot mutate state.
  const listGeneration = useRef(0)
  // True once the current list has been (re)loaded from the server this visit.
  const freshRef = useRef(false)
  const rowsRef = useRef<TxRow[] | null>(null)
  const realtimeRefreshTimer = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined)
  const arrivedClearTimer = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined)

  const member = auth.status === 'signedIn' ? auth.member : null
  const accessToken =
    auth.status === 'signedIn' ? auth.session.access_token : null
  const familyId = member?.family_id ?? null
  const memberId = member?.id ?? null
  const { giveReady, showGiveNav, kids } = useGiveRecipients()
  // Kids that give see it via showGiveNav; adults give/take with virtual kids
  // (kids.length) but route through the Kids tab, so showGiveNav is false for
  // them — surface the filter whenever give/take activity is possible.
  const isAdult = member?.role === 'admin' || member?.role === 'member'
  const showGiveFilter =
    giveReady && (showGiveNav || (isAdult && kids.length > 0))

  const scheduleClearJustArrived = useCallback(() => {
    clearTimeout(arrivedClearTimer.current)
    arrivedClearTimer.current = setTimeout(() => {
      setRows(
        (current) => current?.map((row) => stripJustArrived(row)) ?? null,
      )
    }, HISTORY_ROW_ARRIVED_CLEAR_MS)
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMore || rows === null || rows.length === 0) return

    const generation = listGeneration.current
    const activeFilter = filterForKey(filterKey)

    setLoadingMore(true)
    setLoadMoreError(null)

    const lastRow = rows[rows.length - 1]
    const result = await fetchHistoryPage(
      activeFilter,
      { created_at: lastRow.created_at, id: lastRow.id },
      MORE_PAGE_SIZE,
    )

    setLoadingMore(false)
    if (generation !== listGeneration.current) return

    if (!result.ok) {
      setLoadMoreError(result.error)
      return
    }

    setRows((prev) => (prev ? [...prev, ...result.rows] : result.rows))
    setHasMore(result.rows.length === MORE_PAGE_SIZE)
  }, [filterKey, loadingMore, rows])

  // The exact total is slow on big histories, so it never blocks rows: it fills
  // in afterwards (the page keeps showing the previous total meanwhile).
  const refreshTotal = useCallback(
    (generation: number, activeFilter: HistoryFilter) => {
      void fetchHistoryTotal(activeFilter).then((next) => {
        if (generation !== listGeneration.current) return
        if (next !== null) setTotal(next)
        setTotalSettled(true)
      })
    },
    [],
  )

  const refreshHead = useCallback(async () => {
    const generation = listGeneration.current
    const activeFilter = filterForKey(filterKey)
    const result = await fetchHistoryPage(activeFilter, null, INITIAL_PAGE_SIZE, {
      withCount: false,
    })

    if (generation !== listGeneration.current) return
    if (!result.ok) return

    let hasNewRows = false
    freshRef.current = true
    flushSync(() => {
      setRows((prev) => {
        if (!prev) return result.rows
        const applied = applyHistoryHeadRefresh(prev, result.rows)
        hasNewRows = applied.newlyArrivedIds.length > 0
        return applied.rows
      })
    })
    if (hasNewRows) {
      scheduleClearJustArrived()
      refreshTotal(generation, activeFilter)
    }
  }, [filterKey, scheduleClearJustArrived, refreshTotal])

  const debouncedRefreshHead = useCallback(() => {
    clearTimeout(realtimeRefreshTimer.current)
    realtimeRefreshTimer.current = setTimeout(() => {
      void refreshHead()
    }, REALTIME_REFRESH_DEBOUNCE_MS)
  }, [refreshHead])

  const loadBuckets = useCallback(
    async (cacheFamilyId: string, cacheMemberId: string | null) => {
      try {
        await withAuthLockRetry(async () => {
          const { data, error } = await supabase
            .from('buckets')
            .select('id, name, display_order, created_at')
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: true })
          if (error) {
            // Non-fatal: settle to a (possibly empty) list so the filter
            // resolves out of its skeleton; keep a cached list if we have one.
            setBuckets((prev) => prev ?? [])
            return
          }
          const fresh = data ?? []
          setBuckets(fresh)
          if (cacheMemberId) {
            writeHistoryBucketsCache(cacheFamilyId, cacheMemberId, fresh)
          }
        })
      } catch {
        setBuckets((prev) => prev ?? [])
      }
    },
    [],
  )

  const loadInitialHistory = useCallback(async () => {
    if (!familyId) return

    const generation = ++listGeneration.current
    const activeFilter = filterForKey(filterKey)
    const cached = memberId
      ? readHistoryPageCache(familyId, memberId, filterKey)
      : null

    setLoadError(null)
    setLoadMoreError(null)
    setLoadingMore(false)
    freshRef.current = false
    if (cached) {
      // Instant return: what you last saw, while the fresh page loads behind it.
      setRows(cached.rows)
      setTotal(cached.total)
      setHasMore(cached.hasMore)
    } else {
      setRows(null)
      setTotal(null)
      setTotalSettled(false)
      setHasMore(true)
    }
    refreshTotal(generation, activeFilter) // in parallel with the rows

    const result = await fetchHistoryPage(activeFilter, null, INITIAL_PAGE_SIZE, {
      withCount: false,
    })
    if (generation !== listGeneration.current) return
    if (!result.ok) {
      // Keep showing the cached rows if the refresh fails (e.g. offline).
      if (!cached) setLoadError(result.error)
      return
    }

    freshRef.current = true
    if (cached) {
      // New rows (e.g. a transfer made while you were away) animate in.
      let hasNewRows = false
      flushSync(() => {
        setRows((prev) => {
          if (!prev) return result.rows
          const applied = applyHistoryHeadRefresh(prev, result.rows)
          hasNewRows = applied.newlyArrivedIds.length > 0
          return applied.rows
        })
      })
      if (hasNewRows) scheduleClearJustArrived()
    } else {
      setRows(result.rows)
    }
    setHasMore(result.rows.length === INITIAL_PAGE_SIZE)
  }, [familyId, memberId, filterKey, scheduleClearJustArrived, refreshTotal])

  // Remember the first page for the next visit — only once it is fresh from the
  // server, so a cached copy can never renew its own lifetime.
  useEffect(() => {
    if (!familyId || !memberId || rows === null || !freshRef.current) return
    writeHistoryPageCache(familyId, memberId, filterKey, {
      rows: rows.slice(0, INITIAL_PAGE_SIZE).map(stripJustArrived),
      total,
      hasMore: rows.length > INITIAL_PAGE_SIZE || hasMore,
    })
  }, [familyId, memberId, filterKey, rows, total, hasMore])

  useEffect(() => {
    void loadInitialHistory()
  }, [loadInitialHistory])

  useLayoutEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(
    () => () => {
      clearTimeout(realtimeRefreshTimer.current)
      clearTimeout(arrivedClearTimer.current)
    },
    [],
  )

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (isAppBackgroundExpired() || isSessionGateActive()) return
      if (rowsRef.current === null) return
      void refreshHead()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refreshHead])

  // The bucket picker isn't needed for first paint of the transaction list, so
  // defer it until the initial page has loaded — that keeps it out of the
  // mount-time burst of auth-lock-acquiring queries (which is what triggers the
  // Web Lock "steal" contention). Exception: when a bucket filter is already
  // active we need the names right away so the filter chip doesn't flash a
  // "Deleted bucket" placeholder.
  const needsBucketsImmediately = filter.kind === 'bucket'
  // A cached list (from the last visit) already fills the filter, but we still
  // refresh it once per visit so renamed/added/deleted buckets show up.
  useEffect(() => {
    if (!familyId || bucketsRequestedRef.current) return
    if (!needsBucketsImmediately && rows === null) return
    bucketsRequestedRef.current = true
    void loadBuckets(familyId, memberId)
  }, [familyId, memberId, needsBucketsImmediately, rows, loadBuckets])

  useEffect(() => {
    if (filter.kind !== 'give' || !giveReady || showGiveFilter) return
    setSearchParams({})
  }, [giveReady, showGiveFilter, filter.kind, setSearchParams])

  // A selection you can't see — or unselect — is confusing, so clear it when
  // the filter changes. Stay in select mode so you can keep picking from the
  // new filter.
  useEffect(() => {
    setSelectedAmounts(new Map())
  }, [filterKey])

  usePostgresChanges(
    accessToken,
    familyId ? `history:${familyId}` : null,
    familyId
      ? [
          {
            event: 'INSERT',
            table: 'transactions',
            filter: `family_id=eq.${familyId}`,
          },
        ]
      : [],
    debouncedRefreshHead,
  )

  const grouped = useMemo(() => groupByDay(rows ?? []), [rows])
  const daysRef = useRef<HTMLDivElement | null>(null)
  useStuckHeadings(daysRef, '[data-day-heading]', [grouped])

  const selectedCount = selectedAmounts.size
  const selectedTotal = useMemo(() => {
    let total = 0
    for (const amount of selectedAmounts.values()) total += amount
    return total
  }, [selectedAmounts])

  // The Peek FAB floats bottom-right above the nav; lift the selection bar
  // above it while it's visible so Done stays tappable.
  const peekFabVisible = hidden && hasPeekTarget && !sheetOpen

  const filteredBucketName = useMemo(() => {
    const activeFilter = filterForKey(filterKey)
    if (activeFilter.kind !== 'bucket' || !buckets) return null
    const found = buckets.find((b) => b.id === activeFilter.bucketId)
    return found?.name ?? null
  }, [filterKey, buckets])

  function setFilter(next: HistoryFilter) {
    setSearchParams(searchParamsForFilter(next))
  }

  const handleNoteUpdated = useCallback(
    (transactionId: string, note: string | null) => {
      setRows((prev) =>
        prev
          ? prev.map((row) =>
              row.id === transactionId ? { ...row, note } : row,
            )
          : prev,
      )
    },
    [],
  )

  const toggleTransactionSelected = useCallback(
    (transactionId: string, amount: number) => {
      setSelectedAmounts((prev) => {
        const next = new Map(prev)
        if (next.has(transactionId)) {
          next.delete(transactionId)
        } else {
          next.set(transactionId, amount)
        }
        return next
      })
    },
    [],
  )

  const enterSelectMode = useCallback(() => {
    setSelectMode(true)
  }, [])

  // Leaving selection mode discards the selection — same as iOS Photos/Mail.
  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedAmounts(new Map())
  }, [])

  if (!member) return null

  if (loadError && rows === null) {
    return (
      <LoadErrorPanel
        title="Could not load history"
        message={loadError}
        onRetry={() => void loadInitialHistory()}
      />
    )
  }

  const isGiveFilter = filter.kind === 'give'
  const countState = historyCountState(rows?.length ?? 0, total, hasMore, totalSettled)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold">History</h1>
        <p className="mt-0.5 text-xs text-zinc-400">
          {rows === null
            ? LOADING_STATUS_LABEL
            : rows.length === 0
              ? isGiveFilter
                ? 'No gives or takes yet'
                : 'No transactions yet'
              : countState.pending
                ? <span role="status" aria-label="Counting" className="inline-block h-3 w-24 animate-pulse rounded bg-zinc-800 align-middle" />
                : historyCountLabel(countState.count, countState.approximate, isGiveFilter)}
        </p>
      </header>

      {/* Keep the filter as a skeleton until its options are settled, so it
          never renders as a usable-but-narrow "All transactions" that then pops
          wider when the deferred buckets (and give option) arrive. Ready means
          buckets have loaded and the give roster has resolved. */}
      {buckets !== null && giveReady ? (
        <FilterBar
          buckets={buckets}
          filter={filter}
          activeBucketName={filteredBucketName}
          showGiveFilter={showGiveFilter}
          onChange={setFilter}
        />
      ) : (
        <FilterBarSkeleton />
      )}

      {rows === null ? (
        <HistoryPageSkeleton />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 p-6 text-center">
          <p className="text-sm font-medium text-zinc-300">
            {isGiveFilter
              ? 'No gives or takes yet'
              : filter.kind === 'bucket'
                ? 'No moves for this bucket yet'
                : 'Nothing here yet'}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {isGiveFilter
              ? HISTORY_EMPTY_SENDS_BODY
              : filter.kind === 'bucket'
                ? HISTORY_EMPTY_BUCKET_BODY
                : HISTORY_EMPTY_BODY}
          </p>
        </div>
      ) : (
        <div ref={daysRef} className="space-y-5">
          {/* One Select for the whole list. A zero-height sticky wrapper at the
              start of the list sits on the first day label at rest and pins
              level with the pinned label while scrolling — independent of the
              labels themselves, so it never disappears while one label hands
              off to the next. */}
          {rows !== null && rows.length > 0 ? (
            <div className="sticky-below-header pointer-events-none z-20 mb-0 h-0">
              <div className="absolute inset-x-0 top-0 flex h-[34px] items-center justify-end">
                <button
                  type="button"
                  onClick={selectMode ? exitSelectMode : enterSelectMode}
                  // Quiet at rest (an occasional utility); green only while in
                  // select mode, so the mode — and the way out — stays obvious.
                  className={
                    'pointer-events-auto -mr-1 rounded-md px-2 py-1.5 text-sm transition active:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ' +
                    (selectMode
                      ? 'font-semibold text-emerald-300'
                      : 'font-medium text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300')
                  }
                >
                  {selectMode ? 'Cancel' : 'Select'}
                </button>
              </div>
            </div>
          ) : null}
          {grouped.map((group) => (
            <section key={group.key} aria-label={group.label}>
              {/* Pins under the app header while this day's rows scroll by, so
                  the date is always visible; the next day's label takes over. */}
              <div
                data-day-heading=""
                className="sticky-below-header z-10 -mx-4 mb-2 flex items-center justify-between gap-3 border-b border-transparent bg-black/90 px-5 py-1 backdrop-blur transition-[border-color,box-shadow] duration-150 data-[stuck=true]:border-zinc-800 data-[stuck=true]:shadow-[0_6px_10px_-6px_rgb(0_0_0/0.9)]"
              >
                <h2 className="py-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {group.label}
                </h2>
              </div>
              <ul className="flex flex-col gap-2">
                {group.rows.map((row) => (
                  <HistoryRowShell
                    key={row.id}
                    justArrived={row.justArrived === true}
                    selectMode={selectMode}
                    selected={selectedAmounts.has(row.id)}
                    onToggleSelect={() =>
                      toggleTransactionSelected(row.id, Number(row.amount))
                    }
                  >
                    <TxItem
                      row={row}
                      currentMemberId={member.id}
                      viewerRole={member.role}
                      onNoteUpdated={handleNoteUpdated}
                      selectMode={selectMode}
                    />
                  </HistoryRowShell>
                ))}
              </ul>
            </section>
          ))}

          {loadMoreError && (
            <p className="text-center text-xs text-red-300">{loadMoreError}</p>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="w-full rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-300 ring-1 ring-zinc-800 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <LoadingSpinner className="h-3.5 w-3.5" />
                  {LOADING_STATUS_LABEL}
                </span>
              ) : (
                'Load older'
              )}
            </button>
          )}
        </div>
      )}
      {selectMode ? (
        <div
          className={
            'fixed inset-x-0 ' +
            (peekFabVisible
              ? 'bottom-[calc(9rem+max(0.5rem,env(safe-area-inset-bottom,0px)))]'
              : 'bottom-[calc(4.75rem+max(0.5rem,env(safe-area-inset-bottom,0px)))]')
          }
          style={{ zIndex: APP_CHROME_Z_INDEX }}
        >
          <div className="mx-auto max-w-md px-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-800 px-4 py-3 shadow-2xl shadow-black/70 ring-1 ring-zinc-500">
              <p className="min-w-0 truncate text-sm text-zinc-400">
                {selectedCount === 0 ? (
                  'Tap transactions to add them up'
                ) : (
                  <>
                    <span className="font-semibold text-zinc-100">
                      {selectedCount}
                    </span>{' '}
                    selected ·{' '}
                    <span className="font-semibold text-zinc-100">
                      {formatMoney(selectedTotal)}
                    </span>
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={exitSelectMode}
                className="shrink-0 rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function HistoryRowShell({
  justArrived,
  selectMode,
  selected,
  onToggleSelect,
  children,
}: {
  justArrived: boolean
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
  children: ReactNode
}) {
  const shellRef = useRef<HTMLLIElement>(null)
  useHistoryRowExpandAnimation(shellRef, justArrived)

  return (
    <li ref={shellRef}>
      <div className="min-h-0 overflow-hidden">
        <div
          onClick={selectMode ? onToggleSelect : undefined}
          onKeyDown={
            selectMode
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onToggleSelect()
                  }
                }
              : undefined
          }
          role={selectMode ? 'checkbox' : undefined}
          aria-checked={selectMode ? selected : undefined}
          aria-label={
            selectMode
              ? selected
                ? 'Deselect transaction'
                : 'Select transaction'
              : undefined
          }
          tabIndex={selectMode ? 0 : undefined}
          className={
            // Border (not ring): the row's overflow-hidden wrapper clips the
            // outer pixel of a box-shadow ring.
            // In select mode the border itself is the selection affordance —
            // dashed while unselected, solid emerald when selected — so no
            // checkbox is needed and the layout never shifts.
            'rounded-2xl border px-3 py-3 transition ' +
            (selectMode ? 'cursor-pointer ' : '') +
            (selected
              ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
              : selectMode
                ? 'border-dashed border-zinc-600 bg-zinc-900'
                : 'border-zinc-800 bg-zinc-900')
          }
        >
          {children}
        </div>
      </div>
    </li>
  )
}

function FilterBarSkeleton() {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-busy="true"
      aria-label="Loading filters"
    >
      <span className="text-sm font-medium text-zinc-300">Filter</span>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-zinc-800 ring-1 ring-inset ring-zinc-700" />
    </div>
  )
}

function FilterBar({
  buckets,
  filter,
  activeBucketName,
  showGiveFilter,
  onChange,
}: {
  buckets: Bucket[]
  filter: HistoryFilter
  activeBucketName: string | null
  showGiveFilter: boolean
  onChange: (filter: HistoryFilter) => void
}) {
  const selectValue =
    filter.kind === 'give'
      ? showGiveFilter
        ? GIVE_FILTER_VALUE
        : ''
      : filter.kind === 'bucket'
        ? filter.bucketId
        : ''

  const showOrphanedFilter =
    filter.kind === 'bucket' && activeBucketName === null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor="history-filter"
        className="text-sm font-medium text-zinc-300"
      >
        Filter
      </label>
      <select
        id="history-filter"
        value={selectValue}
        onChange={(e) => {
          const value = e.target.value
          if (value === '') return onChange({ kind: 'all' })
          if (value === GIVE_FILTER_VALUE) return onChange({ kind: 'give' })
          onChange({ kind: 'bucket', bucketId: value })
        }}
        className="rounded-lg border-0 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 focus:outline focus:outline-2 focus:outline-emerald-400"
      >
        <option value="">All transactions</option>
        {showGiveFilter ? (
          <option value={GIVE_FILTER_VALUE}>
            {HISTORY_FILTER_GIVES_AND_TAKES}
          </option>
        ) : null}
        {buckets.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
        {showOrphanedFilter && (
          <option value={filter.bucketId}>(deleted bucket)</option>
        )}
      </select>

      {showGiveFilter && filter.kind === 'give' && (
        <ActiveFilterChip
          label={HISTORY_FILTER_GIVES_AND_TAKES}
          onClear={() => onChange({ kind: 'all' })}
        />
      )}

      {filter.kind === 'bucket' && (
        <ActiveFilterChip
          label={activeBucketName ?? 'Deleted bucket'}
          onClear={() => onChange({ kind: 'all' })}
        />
      )}
    </div>
  )
}

function ActiveFilterChip({
  label,
  onClear,
}: {
  label: string
  onClear: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30">
      {label}
      <button
        type="button"
        aria-label="Clear filter"
        onClick={onClear}
        className="-mr-0.5 flex h-4 w-4 items-center justify-center rounded-full text-emerald-300 hover:bg-emerald-500/20"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="h-3 w-3"
        >
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </span>
  )
}

function TxItem({
  row,
  currentMemberId,
  viewerRole,
  onNoteUpdated,
  selectMode,
}: {
  row: TxRow
  currentMemberId: string
  viewerRole: string
  onNoteUpdated: (transactionId: string, note: string | null) => void
  selectMode: boolean
}) {
  const { formatMoney } = useHideAmounts()
  const [noteExpanded, setNoteExpanded] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [draftNote, setDraftNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const time = timeFormatter.format(new Date(row.created_at))
  const showBucketMoveActor = historyShowBucketMoveActor(viewerRole)
  const showSendActor = historyShowGiveActor({
    viewerRole,
    currentMemberId,
    row,
  })

  let title: string
  let subtitle: string
  let fromLabel: string
  let toLabel: string
  let actorMemberId: string | null
  let actorName: string | null | undefined

  if (row.type === 'bucket_move') {
    fromLabel = bucketEndpointLabel({
      bucketId: row.from_bucket_id,
      snapshotName: row.from_bucket_name,
      joinedName: row.from_bucket?.name,
    })
    toLabel = bucketEndpointLabel({
      bucketId: row.to_bucket_id,
      snapshotName: row.to_bucket_name,
      joinedName: row.to_bucket?.name,
    })
    title = `${fromLabel} → ${toLabel}`
    actorMemberId = row.from_member_id
    actorName = row.from_member?.name
    subtitle = historyBucketMoveSubtitle({
      time,
      actorMemberId,
      actorName,
      currentMemberId,
      showActor: showBucketMoveActor,
      autoOrganizeRunTrigger: row.auto_organize_run_trigger,
    })
  } else {
    const fromIsMe = row.from_member_id === currentMemberId
    const toIsMe = row.to_member_id === currentMemberId
    fromLabel = giveMemberEndpointLabel({
      snapshotName: row.from_member_name,
      joinedName: row.from_member?.name,
      isMe: fromIsMe,
    })
    toLabel = giveMemberEndpointLabel({
      snapshotName: row.to_member_name,
      joinedName: row.to_member?.name,
      isMe: toIsMe,
    })
    title = `${fromLabel} → ${toLabel}`
    const { actorMemberId: sendActorId, actorName: sendActorName } =
      historyGiveActor({ row })
    actorMemberId = sendActorId
    actorName = sendActorName
    const subtitleArgs = {
      time,
      actorMemberId,
      actorName,
      currentMemberId,
      showActor: showSendActor,
    }
    subtitle = isParentTakeFromChild(row)
      ? historyTakeSubtitle(subtitleArgs)
      : historyGiveSubtitle(subtitleArgs)
  }

  const amountValue = Number(row.amount)
  const balanceSides = historyBalanceSides(row, {
    fromLabel,
    toLabel,
    amount: amountValue,
    currentMemberId,
    viewerRole,
  })
  const showTwoSidedBalance = balanceSides.length >= 2

  const sheetTitle = row.note
    ? HISTORY_NOTE_SHEET_TITLE_EDIT
    : HISTORY_NOTE_SHEET_TITLE_ADD

  function closeNoteEditor() {
    if (savingNote) return
    setEditingNote(false)
    setNoteError(null)
  }

  function openNoteEditor() {
    setDraftNote(row.note ?? '')
    setNoteError(null)
    setEditingNote(true)
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault()
    setSavingNote(true)
    setNoteError(null)
    try {
      const trimmed = draftNote.trim()
      const next = trimmed === '' ? null : trimmed
      await updateTransactionNote(row.id, next)
      onNoteUpdated(row.id, next)
      setEditingNote(false)
      setNoteExpanded(Boolean(next))
      toast.success(HISTORY_NOTE_SAVED)
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Could not save note')
    } finally {
      setSavingNote(false)
    }
  }

  const displayedNote = historyTransactionNoteDisplay({
    type: row.type,
    note: row.note,
    from_bucket_id: row.from_bucket_id,
    to_bucket_id: row.to_bucket_id,
    auto_organize_run_id: row.auto_organize_run_id,
    auto_organize_kind: row.auto_organize_kind,
  })

  const noteQuote = displayedNote ? (
    <button
      type="button"
      onClick={() => setNoteExpanded((v) => !v)}
      aria-expanded={noteExpanded}
      aria-label={noteExpanded ? 'Collapse note' : 'Expand note'}
      tabIndex={selectMode ? -1 : undefined}
      className={
        'block w-full text-left text-xs italic leading-snug text-zinc-400 transition hover:text-zinc-300 focus:outline-none focus-visible:text-zinc-300 ' +
        // In select mode the whole row toggles selection — the note is inert
        // so taps fall through to the row instead of being swallowed.
        (selectMode ? 'pointer-events-none ' : '') +
        (noteExpanded ? 'whitespace-pre-wrap break-words' : 'truncate')
      }
    >
      “{displayedNote}”
    </button>
  ) : null

  const noteFooter = (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <button
          type="button"
          onClick={openNoteEditor}
          tabIndex={selectMode ? -1 : undefined}
          className={
            'text-xs text-zinc-500 hover:text-zinc-300' +
            // In select mode the whole row toggles selection — inert here
            // so taps fall through to the row instead of being swallowed.
            (selectMode ? ' pointer-events-none' : '')
          }
        >
          {row.note || displayedNote ? HISTORY_NOTE_EDIT : HISTORY_NOTE_ADD}
        </button>
      </div>
      <p className="shrink-0 text-xs text-zinc-500">{subtitle}</p>
    </div>
  )

  return (
    <>
      <div className="min-w-0">
        {showTwoSidedBalance ? null : (
          <p className="truncate text-sm font-medium text-zinc-300">{title}</p>
        )}
        <HistoryEntityTransfer
          sides={balanceSides}
          amount={amountValue}
          formatMoney={formatMoney}
        />
        <div className="mt-5 flex flex-col gap-1">
          {noteQuote}
          {noteFooter}
        </div>
      </div>

      <Sheet
        open={editingNote}
        onClose={closeNoteEditor}
        aria-label={sheetTitle}
      >
        <form onSubmit={saveNote} className="space-y-4">
          <header className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-zinc-300">{sheetTitle}</h2>
            <button
              type="button"
              onClick={closeNoteEditor}
              disabled={savingNote}
              className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <label className="block">
            <FieldLabel optional>{TRANSACTION_NOTE_FIELD_LABEL}</FieldLabel>
            <ClearableInput
              type="text"
              maxLength={280}
              value={draftNote}
              onValueChange={setDraftNote}
              onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
              placeholder={TRANSACTION_NOTE_PLACEHOLDER}
              autoFocus
              disabled={savingNote}
              clearAriaLabel={HISTORY_NOTE_CLEAR}
              inputClassName="w-full rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-emerald-400"
            />
          </label>

          {noteError && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30"
            >
              {noteError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeNoteEditor}
              disabled={savingNote}
              className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingNote}
              className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {savingNote ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Sheet>
    </>
  )
}

/** "342 transactions" / "12 gives & takes"; a "+" only when the total is unknown. */
function historyCountLabel(count: number, approximate: boolean, give: boolean): string {
  const noun = give
    ? count === 1
      ? 'give or take'
      : 'gives & takes'
    : count === 1
      ? 'transaction'
      : 'transactions'
  return `${count}${approximate ? '+' : ''} ${noun}`
}

function groupByDay(
  rows: TxRow[],
): Array<{ key: string; label: string; rows: TxRow[] }> {
  if (rows.length === 0) return []

  const groups = new Map<string, TxRow[]>()
  for (const row of rows) {
    const d = new Date(row.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const arr = groups.get(key)
    if (arr) arr.push(row)
    else groups.set(key, [row])
  }

  const now = new Date()
  const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`

  return Array.from(groups.entries()).map(([key, groupRows]) => {
    const sample = new Date(groupRows[0].created_at)
    let label: string
    if (key === today) label = 'Today'
    else if (key === yesterdayKey) label = 'Yesterday'
    else label = dayFormatter.format(sample)
    return { key, label, rows: groupRows }
  })
}
