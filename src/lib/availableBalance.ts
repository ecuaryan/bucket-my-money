import {
  latestCashSyncAt,
  sumCardDebt,
  sumCardPendingPayments,
  sumCashBalance,
} from '@/lib/accounts'
import { withAuthLockRetry } from '@/lib/authLockError'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { Json } from '@/types/database'

type Account = Database['public']['Tables']['accounts']['Row']

/** PostgREST when migration 15/19 is not applied on the linked project yet. */
export function isMissingDbFunctionError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('could not find the function') ||
    lower.includes('schema cache')
  )
}

export type ChildSetAsideLine = {
  memberId: string
  name: string
  amount: number
  /** Recallable Unbucketed for virtual kids (adult breakdown only). */
  availableFloat?: number
  /** Net gives — a linked kid's takeable virtual component (adult breakdown only). */
  giveNet?: number
}

export type BucketsBalanceBreakdown = {
  float: number
  totalCash: number
  bankCash: number
  manualCash: number
  /** Family credit-card balances (positive = owed); 0 for child viewers. */
  cardDebt: number
  /** Part of the card debt payments already in flight cover (0 when none). */
  cardPendingPayments: number
  bucketAllocated: number
  childrenSetAside: number
  children: ChildSetAsideLine[]
  /** Family-wide latest bank sync (ISO), or null when nothing is synced. */
  bankLastSyncedAt: string | null
  /** True when the signed-in member personally owns a Teller-linked account. */
  hasLinkedBank: boolean
}

/** Net gives for a child (positive when funded by family). */
export function childFamilyFunding(breakdown: BucketsBalanceBreakdown): number {
  return breakdown.float + breakdown.bucketAllocated - breakdown.totalCash
}

/** Child's total funds before bucket splits (linked cash + net gives). */
export function childTotalBalance(breakdown: BucketsBalanceBreakdown): number {
  return breakdown.float + breakdown.bucketAllocated
}

function parseChildLines(raw: unknown): ChildSetAsideLine[] {
  if (!Array.isArray(raw)) return []
  const lines: ChildSetAsideLine[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const memberId = row.member_id
    const name = row.name
    if (typeof memberId !== 'string' || typeof name !== 'string') continue
    lines.push({
      memberId,
      name,
      amount: Number(row.amount ?? 0),
      availableFloat:
        row.available_float !== undefined
          ? Number(row.available_float ?? 0)
          : undefined,
      giveNet:
        row.give_net !== undefined ? Number(row.give_net ?? 0) : undefined,
    })
  }
  return lines
}

export function parseBreakdownRow(data: Json): BucketsBalanceBreakdown | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const row = data as Record<string, unknown>
  const num = (key: string) => Number(row[key] ?? 0)
  const children = parseChildLines(row.children)
  const bankLastSyncedAt =
    typeof row.bank_last_synced_at === 'string'
      ? row.bank_last_synced_at
      : null
  const hasLinkedBank = row.has_linked_bank === true
  const totalCash = num('total_cash')
  const bankCash =
    row.bank_cash !== undefined ? num('bank_cash') : totalCash
  const manualCash =
    row.manual_cash !== undefined ? num('manual_cash') : 0
  return {
    float: num('float'),
    totalCash,
    bankCash,
    manualCash,
    // Absent until migration 79 is applied — treat as no card debt.
    cardDebt: row.card_debt !== undefined ? num('card_debt') : 0,
    // Absent until migration 100 is applied.
    cardPendingPayments:
      row.card_pending_payments !== undefined ? num('card_pending_payments') : 0,
    bucketAllocated: num('bucket_allocated'),
    childrenSetAside: num('children_set_aside'),
    children,
    bankLastSyncedAt,
    hasLinkedBank,
  }
}

/**
 * Client-side float estimate (cash − visible bucket allocations).
 * Omits child virtual draw and gives — use only when the RPC is unavailable.
 */
export function computeClientFloat(
  accounts: Account[],
  buckets: { allocated_amount: string | number }[],
): number {
  const allocated = buckets.reduce(
    (sum, b) => sum + Number(b.allocated_amount),
    0,
  )
  return sumCashBalance(accounts) - sumCardDebt(accounts) - allocated
}

function sumCashBySource(
  accounts: Account[],
  source: Account['source'],
): number {
  return sumCashBalance(accounts.filter((a) => a.source === source))
}

function clientBreakdownFallback(
  accounts: Account[],
  buckets: { allocated_amount: string | number }[],
): BucketsBalanceBreakdown {
  const totalCash = sumCashBalance(accounts)
  const bankCash = sumCashBySource(accounts, 'teller')
  const manualCash = sumCashBySource(accounts, 'manual')
  const cardDebt = sumCardDebt(accounts)
  const cardPendingPayments = sumCardPendingPayments(accounts)
  const bucketAllocated = buckets.reduce(
    (sum, b) => sum + Number(b.allocated_amount),
    0,
  )
  return {
    float: totalCash - cardDebt - bucketAllocated,
    totalCash,
    bankCash,
    manualCash,
    cardDebt,
    cardPendingPayments,
    bucketAllocated,
    childrenSetAside: 0,
    children: [],
    bankLastSyncedAt: latestCashSyncAt(accounts),
    hasLinkedBank: accounts.some((a) => a.source === 'teller'),
  }
}

/**
 * Authoritative balance from Postgres when migrations are deployed;
 * falls back to client math so the Buckets tab still loads if the DB lags the frontend.
 */
export async function fetchAvailableBalance(
  fallback: { accounts: Account[]; buckets: { allocated_amount: string | number }[] },
): Promise<{ balance: number; usedFallback: boolean }> {
  const { breakdown, usedFallback } = await fetchBucketsBalanceBreakdown(fallback)
  return { balance: breakdown.float, usedFallback }
}

export async function fetchBucketsBalanceBreakdown(
  fallback: { accounts: Account[]; buckets: { allocated_amount: string | number }[] },
): Promise<{ breakdown: BucketsBalanceBreakdown; usedFallback: boolean }> {
  return withAuthLockRetry(async () =>
    fetchBucketsBalanceBreakdownInner(fallback),
  )
}

async function fetchBucketsBalanceBreakdownInner(
  fallback: { accounts: Account[]; buckets: { allocated_amount: string | number }[] },
): Promise<{ breakdown: BucketsBalanceBreakdown; usedFallback: boolean }> {
  const { data, error } = await supabase.rpc('get_home_balance_breakdown')
  if (!error) {
    const parsed = parseBreakdownRow(data)
    if (parsed) {
      return { breakdown: parsed, usedFallback: false }
    }
  }

  const breakdownMissing =
    error != null && isMissingDbFunctionError(error.message)

  const { data: legacy, error: legacyError } = await supabase.rpc(
    'get_float_balance',
  )

  if (!legacyError) {
    const partial = clientBreakdownFallback(fallback.accounts, fallback.buckets)
    return {
      breakdown: { ...partial, float: Number(legacy ?? 0) },
      // Breakdown RPC may be missing (migration 19); balance RPC is still authoritative.
      usedFallback: false,
    }
  }

  if (
    breakdownMissing ||
    isMissingDbFunctionError(legacyError?.message ?? '')
  ) {
    return {
      breakdown: clientBreakdownFallback(fallback.accounts, fallback.buckets),
      usedFallback: true,
    }
  }

  throw new Error(legacyError?.message ?? error?.message ?? 'Balance lookup failed')
}
