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
  kidsEmptyVirtualBody,
  kidsGiveSuccessToast,
  kidsLinkedSectionBody,
  kidsTakeSuccessToast,
  KIDS_LINKED_ONLY_BODY,
  KIDS_LINKED_SECTION_TITLE,
  REFRESH_BALANCES_ERROR,
  VIEW_RECENT_BANK_ACTIVITY,
  KIDS_PAGE_INTRO,
  KIDS_PAGE_TITLE,
  KIDS_VIRTUAL_SECTION_TITLE,
} from '@/lib/brand'
import { fetchHouseholdAdminName } from '@/lib/householdAdmin'
import { subscribeHouseholdRosterRefresh } from '@/lib/householdRosterRefresh'
import { formatErrorMessage } from '@/lib/errorMessage'
import { formatRelativeTime } from '@/lib/relativeTime'
import { refreshAllBankBalances } from '@/lib/bankProviders'
import { refreshBalancesErrorMessage } from '@/lib/bankLink'
import RefreshIconButton from '@/components/ui/RefreshIconButton'
import { buildKidsPageModel, type VirtualKidRow as VirtualKidRowData } from '@/lib/kidsPageModel'
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
  const [householdAdminName, setHouseholdAdminName] = useState<string | null>(
    cached?.householdAdminName ?? null,
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
        const [childrenRes, bucketsRes, accountsRes, linkedIds, adminName] =
          await Promise.all([
            supabase
              .from('family_members')
              .select('id, name, role')
              .eq('role', 'child')
              .order('name'),
            supabase.from('buckets').select('allocated_amount'),
            supabase.from('accounts').select('*'),
            fetchLinkedChildMemberIds(),
            fetchHouseholdAdminName(),
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
        setHouseholdAdminName(adminName)
        setBalanceBreakdown(breakdown)
        servingCacheRef.current = false
        if (familyId && memberId) {
          writeKidsPageCache(familyId, memberId, {
            children: kids,
            accounts: accountRows,
            balanceBreakdown: breakdown,
            linkedChildIds: [...linkedIds],
            householdAdminName: adminName,
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
  const linkedOnly = Boolean(
    model && model.virtualKids.length === 0 && model.linkedKids.length > 0,
  )

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
        <h1 className="text-xl font-semibold">{KIDS_PAGE_TITLE}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {linkedOnly ? KIDS_LINKED_ONLY_BODY : KIDS_PAGE_INTRO}
        </p>
      </header>

      {model.virtualKids.length > 0 ? (
        <section
          className="overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800"
          aria-label={KIDS_VIRTUAL_SECTION_TITLE}
        >
          <h2 className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-300">
            {KIDS_VIRTUAL_SECTION_TITLE}
          </h2>
          <ul className="divide-y divide-zinc-800">
            {model.virtualKids.map((kid) => (
              <VirtualKidRow
                key={kid.memberId}
                kid={kid}
                formatMoney={formatMoney}
                onGive={() => setFundKid(kid)}
                onTake={() =>
                  setReturnKid({
                    memberId: kid.memberId,
                    name: kid.name,
                    cap: kid.amount,
                    linked: false,
                  })
                }
              />
            ))}
          </ul>
        </section>
      ) : !linkedOnly ? (
        <section
          className="rounded-2xl bg-zinc-900 px-4 py-5 ring-1 ring-zinc-800"
          aria-label="No kids without a linked account"
        >
          <p className="text-sm text-zinc-400">
            {kidsEmptyVirtualBody(isAdmin, householdAdminName)}
          </p>
        </section>
      ) : null}

      {model.linkedKids.length > 0 ? (
        <section
          className="overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800"
          aria-label={KIDS_LINKED_SECTION_TITLE}
        >
          <div className="border-b border-zinc-800 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-300">
                {KIDS_LINKED_SECTION_TITLE}
              </h2>
              <RefreshIconButton
                busy={syncing}
                onClick={() => void handleRefreshBalances()}
                className="-mt-0.5 text-zinc-400 hover:text-zinc-200"
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {kidsLinkedSectionBody(isAdmin, householdAdminName)}
              {bankSyncedLabel ? ` · Synced ${bankSyncedLabel}` : ''}
            </p>
            {refreshError ? (
              <p className="mt-1.5 text-[11px] text-red-300/80">
                {refreshError}
              </p>
            ) : null}
          </div>
          <ul className="divide-y divide-zinc-800">
            {model.linkedKids.map((kid) => (
              <LinkedKidRow
                key={kid.memberId}
                kid={kid}
                formatMoney={formatMoney}
                onTake={() =>
                  setReturnKid({
                    memberId: kid.memberId,
                    name: kid.name,
                    cap: kid.giveNet,
                    linked: true,
                  })
                }
              />
            ))}
          </ul>
          <div className="border-t border-zinc-800 px-4 py-3">
            <Link
              to="/?tab=bank"
              className="text-xs font-semibold text-emerald-400 transition hover:text-emerald-300"
            >
              {VIEW_RECENT_BANK_ACTIVITY} →
            </Link>
          </div>
        </section>
      ) : null}

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
