import type { BucketsBalanceBreakdown } from '@/lib/availableBalance'
import type { BucketGroupLayout } from '@/lib/bucketGroups'
import type { Database } from '@/types/database'

type Bucket = Database['public']['Tables']['buckets']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

export type BucketsPageCache = {
  buckets: Bucket[]
  accounts: Account[]
  breakdown: BucketsBalanceBreakdown
  balanceUsesFallback: boolean
  householdAdminName: string | null
  groupLayout?: BucketGroupLayout
  savedAt: number
}

const CACHE_PREFIX = 'bucketmymoney:buckets:'
const MAX_AGE_MS = 5 * 60 * 1000

function cacheKey(familyId: string, memberId: string): string {
  return `${CACHE_PREFIX}${familyId}:${memberId}`
}

export function readBucketsPageCache(
  familyId: string,
  memberId: string,
): BucketsPageCache | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(familyId, memberId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as BucketsPageCache
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(cacheKey(familyId, memberId))
      return null
    }
    if (!Array.isArray(parsed.buckets) || !Array.isArray(parsed.accounts)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeBucketsPageCache(
  familyId: string,
  memberId: string,
  data: Omit<BucketsPageCache, 'savedAt'>,
): void {
  try {
    const payload: BucketsPageCache = { ...data, savedAt: Date.now() }
    sessionStorage.setItem(cacheKey(familyId, memberId), JSON.stringify(payload))
  } catch {
    // Quota or private mode — ignore.
  }
}

export function clearAllBucketsPageCaches(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      sessionStorage.removeItem(key)
    }
  } catch {
    // private mode
  }
}
