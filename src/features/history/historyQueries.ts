import { formatLoadErrorMessage, withAuthLockRetry } from '@/lib/authLockError'
import { supabase } from '@/lib/supabase'
import type { HistoryFilter } from '@/features/history/historyFilters'

export type HistoryTxRow = {
  id: string
  family_id: string
  type: 'bucket_move' | 'give'
  amount: string | number
  from_bucket_id: string | null
  to_bucket_id: string | null
  from_bucket_name: string | null
  to_bucket_name: string | null
  from_bucket_balance_before: string | number | null
  from_bucket_balance_after: string | number | null
  to_bucket_balance_before: string | number | null
  to_bucket_balance_after: string | number | null
  from_member_id: string | null
  from_member_name: string | null
  to_member_id: string | null
  to_member_name: string | null
  initiated_by_member_id: string | null
  initiated_by_member_name: string | null
  from_member_balance_before: string | number | null
  from_member_balance_after: string | number | null
  to_member_balance_before: string | number | null
  to_member_balance_after: string | number | null
  float_balance_before: string | number | null
  float_balance_after: string | number | null
  note: string | null
  created_at: string
  auto_organize_run_id: string | null
  auto_organize_run_trigger: string | null
  auto_organize_kind: string | null
  from_bucket: { name: string } | null
  to_bucket: { name: string } | null
  from_member: { name: string } | null
  to_member: { name: string } | null
}

const TX_FROM = 'transactions_client' as const
const TX_SELECT =
  '*, from_bucket:buckets!from_bucket_id(name), to_bucket:buckets!to_bucket_id(name), from_member:family_members!from_member_id(name), to_member:family_members!to_member_id(name)'

export type FetchHistoryPageResult =
  | {
      ok: true
      rows: HistoryTxRow[]
      /**
       * Exact number of rows matching the filter. Only requested with the first
       * page (the same round trip); null for older pages or if the server
       * did not report it.
       */
      total: number | null
    }
  | { ok: false; error: string }

export type HistoryPageCursor = Pick<HistoryTxRow, 'created_at' | 'id'>

/** True when `row` sorts after `cursor` in history order (created_at desc, id desc). */
export function isHistoryRowOlderThan(
  row: HistoryPageCursor,
  cursor: HistoryPageCursor,
): boolean {
  if (row.created_at !== cursor.created_at) {
    return row.created_at < cursor.created_at
  }
  return row.id < cursor.id
}

function postgrestFilterValue(value: string): string {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return value
  }
  return `"${value.replaceAll('"', '\\"')}"`
}

/** Merge a fresh head page into an existing list; preserve older paginated tail. */
export function mergeHistoryHead(
  prev: HistoryTxRow[],
  headRows: HistoryTxRow[],
): { merged: HistoryTxRow[]; newlyArrivedIds: string[] } {
  if (headRows.length === 0) {
    return { merged: prev, newlyArrivedIds: [] }
  }
  const headIds = new Set(headRows.map((r) => r.id))
  const oldestInHead = headRows[headRows.length - 1]
  const prevIdSet = new Set(prev.map((r) => r.id))
  const newlyArrivedIds = headRows
    .filter((r) => !prevIdSet.has(r.id))
    .map((r) => r.id)
  const tail = prev.filter(
    (r) => !headIds.has(r.id) && isHistoryRowOlderThan(r, oldestInHead),
  )
  return { merged: [...headRows, ...tail], newlyArrivedIds }
}

export type HistoryDisplayRow = HistoryTxRow & { justArrived?: true }

/** Drop the ephemeral animation flag before persisting row state. */
export function stripJustArrived(row: HistoryDisplayRow): HistoryTxRow {
  if (!row.justArrived) return row
  const rest = { ...row }
  delete rest.justArrived
  return rest
}

/** Apply a Realtime head refresh; tag brand-new rows for entrance animation. */
export function applyHistoryHeadRefresh(
  prev: HistoryTxRow[],
  headRows: HistoryTxRow[],
): { rows: HistoryDisplayRow[]; newlyArrivedIds: string[] } {
  const { merged, newlyArrivedIds } = mergeHistoryHead(prev, headRows)
  const arrived = new Set(newlyArrivedIds)
  return {
    rows: merged.map((row) =>
      arrived.has(row.id) ? { ...row, justArrived: true } : row,
    ),
    newlyArrivedIds,
  }
}

/** Keyset filter for the page after `cursor` (same sort as fetchHistoryPage). */
export function historyPageCursorFilter(cursor: HistoryPageCursor): string {
  const ts = postgrestFilterValue(cursor.created_at)
  const id = postgrestFilterValue(cursor.id)
  return `created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id})`
}

export async function fetchHistoryPage(
  activeFilter: HistoryFilter,
  before: HistoryPageCursor | null,
  limit: number,
): Promise<FetchHistoryPageResult> {
  try {
    return await withAuthLockRetry(async () => {
      let query = supabase
        .from(TX_FROM)
        .select(TX_SELECT, before ? undefined : { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (before) query = query.or(historyPageCursorFilter(before))
      if (activeFilter.kind === 'give') {
        // 'give'-type rows cover both gives (adult → kid) and takes
        // (return_from_child), so one filter surfaces all give/take activity.
        query = query.eq('type', 'give')
      } else if (activeFilter.kind === 'bucket') {
        query = query.or(
          `from_bucket_id.eq.${activeFilter.bucketId},to_bucket_id.eq.${activeFilter.bucketId}`,
        )
      }
      const { data, error, count } = await query
      if (error) {
        return { ok: false as const, error: formatLoadErrorMessage(error.message) }
      }
      return {
        ok: true as const,
        rows: (data ?? []) as unknown as HistoryTxRow[],
        total: typeof count === 'number' ? count : null,
      }
    })
  } catch (error) {
    return {
      ok: false,
      error: formatLoadErrorMessage(error, 'Could not load history.'),
    }
  }
}
