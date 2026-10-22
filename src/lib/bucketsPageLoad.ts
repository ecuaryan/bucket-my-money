import {
  fetchBucketsBalanceBreakdown,
  isMissingDbFunctionError,
  parseBreakdownRow,
  type BucketsBalanceBreakdown,
} from '@/lib/availableBalance'
import { withAuthLockRetry } from '@/lib/authLockError'
import { fetchHouseholdAdminName } from '@/lib/householdAdmin'
import { classifyMemberFetch, type MemberFetchOutcome } from '@/lib/memberFetch'
import { fetchBucketGroupLayout, type BucketGroupLayout } from '@/lib/bucketGroups'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { Json } from '@/types/database'

type Bucket = Database['public']['Tables']['buckets']['Row']
type Account = Database['public']['Tables']['accounts']['Row']
type FamilyMember = Database['public']['Tables']['family_members']['Row']

export type BucketsPageData = {
  buckets: Bucket[]
  accounts: Account[]
  breakdown: BucketsBalanceBreakdown
  usedFallback: boolean
  householdAdminName: string | null
  /** This member's bucket groups; absent on the sign-in bootstrap payload. */
  groupLayout?: BucketGroupLayout
}

function parseBucketRows(raw: unknown): Bucket[] {
  if (!Array.isArray(raw)) return []
  return raw as Bucket[]
}

function parseAccountRows(raw: unknown): Account[] {
  if (!Array.isArray(raw)) return []
  return raw as Account[]
}

type ParsedHomeRpc = {
  buckets: Bucket[]
  accounts: Account[]
  breakdown: BucketsBalanceBreakdown
  /** Present from migration 71+: the caller's own membership row (null = removed). */
  member: FamilyMember | null
  /** True once the enriched RPC (migration 71+) is deployed. */
  memberKeyPresent: boolean
  /** Admin name from the RPC, or null when an older RPC didn't include it. */
  householdAdminName: string | null
  adminNameKeyPresent: boolean
}

/** Parse the `get_home_page_data` payload, or null when it's not the expected shape. */
function parseHomeRpc(data: unknown): ParsedHomeRpc | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null
  }
  const row = data as Record<string, unknown>
  const breakdown = parseBreakdownRow(row.breakdown as Json)
  if (!breakdown) {
    return null
  }
  const memberKeyPresent = 'member' in row
  const adminNameKeyPresent = 'household_admin_name' in row
  return {
    buckets: parseBucketRows(row.buckets),
    accounts: parseAccountRows(row.accounts),
    breakdown,
    member: memberKeyPresent && row.member ? (row.member as FamilyMember) : null,
    memberKeyPresent,
    householdAdminName:
      typeof row.household_admin_name === 'string'
        ? row.household_admin_name
        : null,
    adminNameKeyPresent,
  }
}

/**
 * One RPC for the Buckets tab when migration 23 is deployed; null → use legacy
 * loaders. Throws (not null) on a real error so callers can surface it.
 */
async function fetchHomeRpc(): Promise<ParsedHomeRpc | null> {
  const { data, error } = await supabase.rpc('get_home_page_data')
  if (error) {
    if (isMissingDbFunctionError(error.message)) return null
    throw new Error(error.message)
  }
  return parseHomeRpc(data)
}

/** Legacy path when get_home_page_data is not on the linked project yet. */
export async function fetchBucketsPageDataLegacy(): Promise<
  Omit<BucketsPageData, 'householdAdminName'>
> {
  await supabase.rpc('ensure_member_bucket_orders')

  const [bucketsRes, orderRes, accountsRes] = await Promise.all([
    supabase.from('buckets').select('*'),
    supabase.from('member_bucket_order').select('bucket_id, display_order'),
    supabase.from('accounts').select('*'),
  ])

  if (bucketsRes.error) throw new Error(bucketsRes.error.message)
  if (orderRes.error) throw new Error(orderRes.error.message)
  if (accountsRes.error) throw new Error(accountsRes.error.message)

  const orderMap = new Map(
    (orderRes.data ?? []).map((r) => [r.bucket_id, r.display_order]),
  )
  const sorted = [...(bucketsRes.data ?? [])].sort((a, b) => {
    const oa = orderMap.get(a.id) ?? a.display_order
    const ob = orderMap.get(b.id) ?? b.display_order
    if (oa !== ob) return oa - ob
    return a.created_at.localeCompare(b.created_at)
  })

  const accounts = (accountsRes.data ?? []) as Account[]
  const { breakdown, usedFallback } = await fetchBucketsBalanceBreakdown({
    accounts,
    buckets: sorted,
  })

  return {
    buckets: sorted as Bucket[],
    accounts,
    breakdown,
    usedFallback,
  }
}

async function loadBucketsPageCore(): Promise<BucketsPageData> {
  return withAuthLockRetry(async () => {
    const fast = await fetchHomeRpc()
    if (fast) {
      // Migration 71+ returns the admin name in the same round trip; an older
      // RPC doesn't, so fetch it separately only then (status quo for that case).
      const householdAdminName = fast.adminNameKeyPresent
        ? fast.householdAdminName
        : await fetchHouseholdAdminName()
      return {
        buckets: fast.buckets,
        accounts: fast.accounts,
        breakdown: fast.breakdown,
        usedFallback: false,
        householdAdminName,
      }
    }
    const [legacy, householdAdminName] = await Promise.all([
      fetchBucketsPageDataLegacy(),
      fetchHouseholdAdminName(),
    ])
    return { ...legacy, householdAdminName }
  })
}

export async function loadBucketsPage(): Promise<BucketsPageData> {
  const [page, groupLayout] = await Promise.all([
    loadBucketsPageCore(),
    fetchBucketGroupLayout().catch(() => undefined),
  ])
  return { ...page, groupLayout }
}

export type HomeBootstrap = {
  /** Classified exactly like the direct family_members lookup. */
  memberOutcome: MemberFetchOutcome<FamilyMember>
  /** Home payload to warm the buckets cache, or null when unavailable. */
  page: BucketsPageData | null
}

/**
 * Sign-in bootstrap: the caller's membership row AND the home screen in one
 * round trip (migration 71+). Returns null when the enriched RPC isn't deployed
 * yet — the caller then falls back to a direct member-only lookup, so auth keeps
 * working across a deploy window. Throws on a real RPC error.
 */
export async function fetchHomeBootstrap(): Promise<HomeBootstrap | null> {
  const parsed = await fetchHomeRpc()
  if (!parsed || !parsed.memberKeyPresent) {
    // RPC missing entirely, or an older version without the member row —
    // caller uses the lightweight direct lookup instead.
    return null
  }
  return {
    memberOutcome: classifyMemberFetch(parsed.member, null),
    page: {
      buckets: parsed.buckets,
      accounts: parsed.accounts,
      breakdown: parsed.breakdown,
      usedFallback: false,
      householdAdminName: parsed.householdAdminName,
    },
  }
}
