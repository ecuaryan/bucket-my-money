import type { BucketsBalanceBreakdown } from '@/lib/availableBalance'
import type { Database } from '@/types/database'

type Member = Pick<
  Database['public']['Tables']['family_members']['Row'],
  'id' | 'name' | 'role'
>
type Account = Database['public']['Tables']['accounts']['Row']

/**
 * Remembers what the Kids tab last showed (per member) so coming back is
 * instant while a fresh copy loads behind it. Same shape and lifetime as the
 * Buckets and History caches: session storage, 5 minutes, cleared on sign-out.
 * The fresh load always runs and always wins.
 */
export type KidsPageCache = {
  children: Member[]
  accounts: Account[]
  balanceBreakdown: BucketsBalanceBreakdown
  linkedChildIds: string[]
  householdAdminName: string | null
  savedAt: number
}

const CACHE_PREFIX = 'bucketmymoney:kids:'
const MAX_AGE_MS = 5 * 60 * 1000

function cacheKey(familyId: string, memberId: string): string {
  return `${CACHE_PREFIX}${familyId}:${memberId}`
}

export function readKidsPageCache(
  familyId: string,
  memberId: string,
): KidsPageCache | null {
  const key = cacheKey(familyId, memberId)
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as KidsPageCache
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(key)
      return null
    }
    if (
      !Array.isArray(parsed.children) ||
      !Array.isArray(parsed.accounts) ||
      !Array.isArray(parsed.linkedChildIds) ||
      !parsed.balanceBreakdown
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeKidsPageCache(
  familyId: string,
  memberId: string,
  data: Omit<KidsPageCache, 'savedAt'>,
): void {
  try {
    const payload: KidsPageCache = { ...data, savedAt: Date.now() }
    sessionStorage.setItem(cacheKey(familyId, memberId), JSON.stringify(payload))
  } catch {
    // Quota or private mode — ignore.
  }
}

export function clearAllKidsPageCaches(): void {
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
