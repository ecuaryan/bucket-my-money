import type { HistoryTxRow } from '@/features/history/historyQueries'

/**
 * Remembers the first page of History (per member, per filter) so coming back
 * to the page shows what you last saw instantly while a fresh page loads
 * behind it. Same shape and lifetime as the Buckets page cache: session
 * storage, 5 minutes, cleared on sign-out. The fresh fetch always runs and
 * always wins; this only removes the blank skeleton.
 */
export type HistoryPageCache = {
  rows: HistoryTxRow[]
  total: number | null
  hasMore: boolean
  savedAt: number
}

const CACHE_PREFIX = 'bucketmymoney:history:'
const MAX_AGE_MS = 5 * 60 * 1000

function cacheKey(familyId: string, memberId: string, filterKey: string): string {
  return `${CACHE_PREFIX}${familyId}:${memberId}:${filterKey}`
}

export function readHistoryPageCache(
  familyId: string,
  memberId: string,
  filterKey: string,
): HistoryPageCache | null {
  const key = cacheKey(familyId, memberId, filterKey)
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HistoryPageCache
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(key)
      return null
    }
    if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

/** Saves only the first page (older rows are never cached, so they can't go stale). */
export function writeHistoryPageCache(
  familyId: string,
  memberId: string,
  filterKey: string,
  data: Omit<HistoryPageCache, 'savedAt'>,
): void {
  try {
    const payload: HistoryPageCache = { ...data, savedAt: Date.now() }
    sessionStorage.setItem(
      cacheKey(familyId, memberId, filterKey),
      JSON.stringify(payload),
    )
  } catch {
    // Quota or private mode — ignore.
  }
}

/** The filter dropdown's bucket list: per member, not per filter. */
export type HistoryBucketOption = {
  id: string
  name: string
  display_order: number
  created_at: string
}

type HistoryBucketsCache = { buckets: HistoryBucketOption[]; savedAt: number }

// Starts with CACHE_PREFIX, so clearAllHistoryPageCaches() removes it on sign-out.
function bucketsKey(familyId: string, memberId: string): string {
  return `${CACHE_PREFIX}buckets:${familyId}:${memberId}`
}

export function readHistoryBucketsCache(
  familyId: string,
  memberId: string,
): HistoryBucketOption[] | null {
  const key = bucketsKey(familyId, memberId)
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HistoryBucketsCache
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(key)
      return null
    }
    return Array.isArray(parsed.buckets) ? parsed.buckets : null
  } catch {
    return null
  }
}

export function writeHistoryBucketsCache(
  familyId: string,
  memberId: string,
  buckets: HistoryBucketOption[],
): void {
  try {
    const payload: HistoryBucketsCache = { buckets, savedAt: Date.now() }
    sessionStorage.setItem(bucketsKey(familyId, memberId), JSON.stringify(payload))
  } catch {
    // Quota or private mode — ignore.
  }
}

export function clearAllHistoryPageCaches(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
    }
    for (const key of keys) sessionStorage.removeItem(key)
  } catch {
    // private mode
  }
}
