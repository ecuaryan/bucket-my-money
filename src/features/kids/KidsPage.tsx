import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { LoadErrorPanel } from '@/components/ui/LoadErrorPanel'
import KidsPageSkeleton from '@/components/KidsPageSkeleton'
import { useContentFade } from '@/hooks/useContentFade'
import FundKidSheet from '@/features/kids/FundKidSheet'
import ReturnKidSheet from '@/features/kids/ReturnKidSheet'
import { LinkedKidRow, VirtualKidRow } from '@/features/kids/KidMoneyRow'
import { useAuth } from '@/lib/auth'
import { readKidsPageCache, writeKidsPageCache } from '@/lib/kidsPageCache'
import { formatLoadErrorMessage, withAuthLockRetry } from '@/lib/authLockError'
import {
  fetchBucketsBalanceBreakdown,
  type BucketsBalanceBreakdown,
} from '@/lib/availableBalance'
import {
  floatRefreshedLabel,
  FLOAT_REFRESH_BALANCES_LABEL,
  kidsGiveSuccessToast,
  kidsTakeSuccessToast,
  REFRESH_BALANCES_ERROR,
  VIEW_RECENT_BANK_ACTIVITY,
  KIDS_PAGE_TITLE,
} from '@/lib/brand'
import { subscribeHouseholdRosterRefresh } from '@/lib/householdRosterRefresh'
import { formatErrorMessage } from '@/lib/errorMessage'
import { formatRelativeTime } from '@/lib/relativeTime'
import { refreshAllBankBalances } from '@/lib/bankProviders'
import { refreshBalancesErrorMessage, refreshThrottledMessage } from '@/lib/bankLink'
import RefreshIcon from '@/components/ui/RefreshIcon'
import {
  buildKidsPageModel,
  type LinkedKidRow as LinkedKidRowData,
  type VirtualKidRow as VirtualKidRowData,
} from '@/lib/kidsPageModel'
import { fetchLinkedChildMemberIds } from '@/lib/give'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import { usePostgresChanges } from '@/hooks/usePostgresChanges'
import { useFeatureFlag } from '@/hooks/FeatureFlagsProvider'
import BitcoinKidsSection from '@/features/bitcoin/BitcoinKidsSection'
import { useHideAmounts, usePeekTarget } from '@/lib/HideAmountsProvider'
import type { Database } from '@/types/database'

type Member = Pick<
  Database['public']['Tables']['family_members']['Row'],
  'id' | 'name' | 'role'
>
type Account = Database['public']['Tables']['accounts']['Row']
type KidListRow =
  | { type: 'virtual'; kid: VirtualKidRowData }
  | { type: 'linked'; kid: LinkedKidRowData }

export default function KidsPage() {
  const { formatMoney } = useHideAmounts()
  usePeekTarget()
  const auth = useAuth()
  const member = auth.status === 'signedIn' ? auth.member : null
  const accessToken =
    auth.status === 'signedIn' ? auth.session.access_token : null
  const familyId = member?.family_id ?? null
  const memberId = member?.id ?? null

  // What the tab showed last visit: rendered instantly while a fresh load runs.
  const [cached] = useState(() =>
    familyId && memberId ? readKidsPageCache(familyId, memberId) : null,
  )
  // While we are showing remembered data, a failed refresh stays quiet.
  const servingCacheRef = useRef(cached !== null)

  const [children, setChildren] = useState<Member[] | null>(
    cached?.children ?? null,
  )
  const [accounts, setAccounts] = useState<Account[] | null>(
    cached?.accounts ?? null,
  )
  const [balanceBreakdown, setBalanceBreakdown] =
    useState<BucketsBalanceBreakdown | null>(cached?.balanceBreakdown ?? null)
  const [linkedChildIds, setLinkedChildIds] = useState<Set<string> | null>(
    cached ? new Set(cached.linkedChildIds) : null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fundKid, setFundKid] = useState<VirtualKidRowData | null>(null)
  // Take target: virtual kids cap at their total balance; linked kids cap
  // at their virtual component (net gives) — bank cash moves at the bank.
  const [returnKid, setReturnKid] = useState<{
    memberId: string
    name: string
    cap: number
    linked: boolean
  } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const isAdult =
    member?.role === 'admin' || member?.role === 'member'
  const isAdmin = member?.role === 'admin'
  const bitcoinEnabled = useFeatureFlag('bitcoin')
  // Plaid joins the global balance refresh only for flagged households.
  const plaidEnabled = useFeatureFlag('plaid')

  const loadData = useCallback(async () => {
    if (!memberId || !isAdult) return
    setLoadError(null)
    try {
      await withAuthLockRetry(async () => {
        const [childrenRes, bucketsRes, accountsRes, linkedIds] =
          await Promise.all([
            supabase
              .from('family_members')
              .select('id, name, role')
              .eq('role', 'child')
              .order('name'),
            supabase.from('buckets').select('allocated_amount'),
            supabase.from('accounts').select('*'),
            fetchLinkedChildMemberIds(),
          ])
        if (childrenRes.error) throw new Error(childrenRes.error.message)
        if (bucketsRes.error) throw new Error(bucketsRes.error.message)
        if (accountsRes.error) throw new Error(accountsRes.error.message)

        const accountRows = accountsRes.data ?? []
        const { breakdown } = await fetchBucketsBalanceBreakdown({
          accounts: accountRows,
          buckets: bucketsRes.data ?? [],
        })
        const kids = childrenRes.data ?? []
        setChildren(kids)
        setAccounts(accountRows)
        setLinkedChildIds(linkedIds)
        setBalanceBreakdown(breakdown)
        servingCacheRef.current = false
        if (familyId && memberId) {
          writeKidsPageCache(familyId, memberId, {
            children: kids,
            accounts: accountRows,
            balanceBreakdown: breakdown,
            linkedChildIds: [...linkedIds],
          })
        }
      })
    } catch (e) {
      // Remembered data is on screen: keep it rather than swap in an error panel.
      if (servingCacheRef.current) return
      setLoadError(formatLoadErrorMessage(e, 'Could not load kids.'))
    }
  }, [familyId, memberId, isAdult])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    return subscribeHouseholdRosterRefresh(() => {
      void loadData()
    })
  }, [loadData])

  const realtimeSpecs = useMemo(() => {
    if (!familyId) return []
    return [
      {
        event: '*' as const,
        table: 'family_members',
        filter: `family_id=eq.${familyId}`,
      },
      {
        event: 'INSERT' as const,
        table: 'transactions',
        filter: `family_id=eq.${familyId}`,
      },
      {
        event: '*' as const,
        table: 'accounts',
        filter: `family_id=eq.${familyId}`,
      },
    ]
  }, [familyId])

  usePostgresChanges(
    accessToken,
    familyId ? `kids:${familyId}` : null,
    realtimeSpecs,
    loadData,
  )

  const model = useMemo(() => {
    if (!children || !accounts || !linkedChildIds || !balanceBreakdown) {
      return null
    }
    return buildKidsPageModel({
      children: children.map((child) => ({ id: child.id, name: child.name })),
      childBalances: balanceBreakdown.children,
      linkedChildIds,
      accounts,
    })
  }, [children, accounts, linkedChildIds, balanceBreakdown])

  const available = balanceBreakdown?.float ?? null
  const bankSyncedLabel = balanceBreakdown
    ? formatRelativeTime(balanceBreakdown.bankLastSyncedAt)
    : null
  // One list grouped by type, each by name (children load sorted by name):
  // kids you give to first, then kids whose balance comes from the bank.
  const kidRows = useMemo((): KidListRow[] => {
    if (!model || !children) return []
    const virtualById = new Map(model.virtualKids.map((k) => [k.memberId, k]))
    const linkedById = new Map(model.linkedKids.map((k) => [k.memberId, k]))
    return [
      ...children.flatMap((child): KidListRow[] => {
        const kid = virtualById.get(child.id)
        return kid ? [{ type: 'virtual', kid }] : []
      }),
      ...children.flatMap((child): KidListRow[] => {
        const kid = linkedById.get(child.id)
        return kid ? [{ type: 'linked', kid }] : []
      }),
    ]
  }, [model, children])
  const hasLinkedKids = (model?.linkedKids.length ?? 0) > 0

  function handleGiveSuccess(kid: VirtualKidRowData, amount: number) {
    toast.success(kidsGiveSuccessToast(formatMoney(amount), kid.name))
    void loadData()
  }

  function handleTakeSuccess(kidName: string, amount: number) {
    toast.success(kidsTakeSuccessToast(formatMoney(amount), kidName))
    void loadData()
  }

  async function handleRefreshBalances() {
    setRefreshError(null)
    setSyncing(true)
    try {
      // refreshBalances resolves even when a bank errors (per-account failures
      // come back in `errors`), so surface that instead of stopping silently.
      const result = await refreshAllBankBalances({ plaidEnabled })
      setRefreshError(refreshBalancesErrorMessage(result))
      const throttled = refreshThrottledMessage(result)
      if (throttled) toast.success(throttled)
      await loadData()
    } catch (e) {
      setRefreshError(formatErrorMessage(e, REFRESH_BALANCES_ERROR))
    } finally {
      setSyncing(false)
    }
  }

  const showSkeleton =
    children === null ||
    accounts === null ||
    linkedChildIds === null ||
    balanceBreakdown === null ||
    model === null ||
    available === null
  const contentFade = useContentFade(showSkeleton)

  if (!isAdult) {
    return <Navigate to="/" replace />
  }

  if (loadError) {
    return (
      <LoadErrorPanel
        title="Could not load kids"
        message={loadError}
        onRetry={() => void loadData()}
      />
    )
  }

  if (showSkeleton) {
    return <KidsPageSkeleton />
  }

  if (children.length === 0) {
    return <Navigate to="/" replace />
  }

  return (
    <div className={'space-y-6 ' + (contentFade ?? '')}>
      <header>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{KIDS_PAGE_TITLE}</h1>
          {hasLinkedKids ? (
            <button
              type="button"
              onClick={() => void handleRefreshBalances()}
              disabled={syncing}
              aria-label={FLOAT_REFRESH_BALANCES_LABEL}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] leading-4 text-zinc-400 transition hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="whitespace-nowrap">
                {bankSyncedLabel
                  ? floatRefreshedLabel(bankSyncedLabel)
                  : FLOAT_REFRESH_BALANCES_LABEL}
              </span>
              <RefreshIcon spinning={syncing} className="h-3 w-3 shrink-0" />
            </button>
          ) : null}
        </div>
        {refreshError ? (
          <p className="mt-1.5 text-right text-[11px] text-red-300/80">
            {refreshError}
          </p>
        ) : null}
      </header>

      <section
        className="overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800"
        aria-label={KIDS_PAGE_TITLE}
      >
        <ul className="divide-y divide-zinc-800">
          {kidRows.map((row) =>
            row.type === 'virtual' ? (
              <VirtualKidRow
                key={row.kid.memberId}
                kid={row.kid}
                formatMoney={formatMoney}
                onGive={() => setFundKid(row.kid)}
                onTake={() =>
                  setReturnKid({
                    memberId: row.kid.memberId,
                    name: row.kid.name,
                    cap: row.kid.amount,
                    linked: false,
                  })
                }
              />
            ) : (
              <LinkedKidRow
                key={row.kid.memberId}
                kid={row.kid}
                formatMoney={formatMoney}
                onTake={() =>
                  setReturnKid({
                    memberId: row.kid.memberId,
                    name: row.kid.name,
                    cap: row.kid.giveNet,
                    linked: true,
                  })
                }
              />
            ),
          )}
        </ul>
        {hasLinkedKids ? (
          <div className="border-t border-zinc-800 px-4 py-3">
            <Link
              to="/?tab=bank"
              className="text-xs font-semibold text-emerald-400 transition hover:text-emerald-300"
            >
              {VIEW_RECENT_BANK_ACTIVITY} →
            </Link>
          </div>
        ) : null}
      </section>

      {bitcoinEnabled && familyId ? (
        <BitcoinKidsSection
          kids={children.map((child) => ({ id: child.id, name: child.name }))}
          isAdmin={isAdmin}
          familyId={familyId}
        />
      ) : null}

      {returnKid ? (
        <ReturnKidSheet
          kidId={returnKid.memberId}
          kidName={returnKid.name}
          available={returnKid.cap}
          linkedKid={returnKid.linked}
          open
          formatMoney={formatMoney}
          onClose={() => setReturnKid(null)}
          onSuccess={(amount) => {
            handleTakeSuccess(returnKid.name, amount)
            setReturnKid(null)
          }}
        />
      ) : null}

      {fundKid ? (
        <FundKidSheet
          kidId={fundKid.memberId}
          kidName={fundKid.name}
          available={available}
          open
          formatMoney={formatMoney}
          onClose={() => setFundKid(null)}
          onSuccess={(amount) => {
            handleGiveSuccess(fundKid, amount)
            setFundKid(null)
          }}
        />
      ) : null}
    </div>
  )
}
