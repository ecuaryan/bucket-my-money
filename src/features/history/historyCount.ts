/**
 * What the History header's count shows. The exact total loads separately from
 * the rows (it is slow on big histories), so while it is unknown and the list
 * has more rows we show a quiet placeholder instead of a "10+" that then flips.
 * If the count request fails we settle on "N+", the honest "at least".
 */
export type HistoryCountState =
  | { pending: true }
  | { pending: false; count: number; approximate: boolean }

export function historyCountState(
  loadedRows: number,
  total: number | null,
  hasMore: boolean,
  settled: boolean,
): HistoryCountState {
  if (total !== null) return { pending: false, count: total, approximate: false }
  if (hasMore && !settled) return { pending: true }
  return { pending: false, count: loadedRows, approximate: hasMore }
}
