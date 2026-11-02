import { HISTORY_FILTER_GIVES_AND_TAKES } from '@/lib/brand'
import type { Database } from '@/types/database'
import { GIVE_FILTER_VALUE, type HistoryFilter } from '@/features/history/historyFilters'

export type Bucket = Pick<
  Database['public']['Tables']['buckets']['Row'],
  'id' | 'name' | 'display_order' | 'created_at'
>

export function FilterBarSkeleton() {
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

export function FilterBar({
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
