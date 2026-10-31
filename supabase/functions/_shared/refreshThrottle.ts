/** Default server-side guard between Teller balance re-pulls (ms). */
export const REFRESH_THROTTLE_MS = 60_000

/**
 * True when a refresh should skip calling Teller — latest sync is within the
 * throttle window. Null latest means never synced, so allow refresh.
 */
export function shouldSkipRefresh(
  latestSyncedMs: number | null,
  now: number,
  windowMs: number = REFRESH_THROTTLE_MS,
): boolean {
  if (latestSyncedMs == null || Number.isNaN(latestSyncedMs)) return false
  return now - latestSyncedMs < windowMs
}

/**
 * Items (banks) whose own last good sync is outside the throttle window.
 * Judging each bank separately means one bank refreshing cleanly never blocks
 * a retry of another that failed. Null/unparsable means never synced: due.
 */
export function itemsDueForRefresh<T extends { last_synced_at: string | null }>(
  items: T[],
  now: number,
  windowMs: number = REFRESH_THROTTLE_MS,
): T[] {
  return items.filter((item) =>
    !shouldSkipRefresh(
      item.last_synced_at ? Date.parse(item.last_synced_at) : null,
      now,
      windowMs,
    ),
  )
}
