import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  BUCKETS_ADD_SOURCE_ADMIN_BODY,
  BUCKETS_ADD_SOURCE_LINK_ACTION,
  BUCKETS_ADD_SOURCE_MANUAL_ACTION,
  BUCKETS_ADD_SOURCE_TITLE,
  BUCKETS_EMPTY_BODY,
  BUCKETS_EMPTY_TITLE,
  bucketsAddSourceMemberBody,
  bucketsDeleteBucketAutoOrganizeConfirmAriaLabel,
  bucketsDeleteBucketConfirm,
  bucketsDeleteBucketEffectFloat,
  bucketsDeleteBucketEmptyIntro,
  bucketsDeleteBucketSheetIntro,
  bucketsDeleteBucketSheetTitle,
  BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_CONFIRM_LABEL,
  BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_SUBMITTING_LABEL,
  BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_USED_IN_LABEL,
  bucketsDeleteBucketAutoOrganizeActionHint,
  bucketsDeleteBucketAutoOrganizeIntro,
  bucketsDeleteBucketAutoOrganizeLoadFallback,
  BUCKETS_DELETE_BUCKET_EFFECT_HISTORY,
  BUCKETS_DELETE_BUCKET_EFFECT_LABEL,
  BUCKETS_DELETE_BUCKET_WHAT_HAPPENS,
  bucketsKidFloatHint,
  BUCKETS_DB_UPDATE_PENDING_BODY,
  bucketsMemberNoBucketsHint,
  FLOAT_HERO_SUBTITLE,
  FLOAT_HERO_SUBTITLE_WITH_CARDS,
  floatOverbucketedHint,
  floatShortWithCardsHint,
  FLOAT_LABEL,
} from '@/lib/brand'
import ManualSourceDialog from '@/features/admin/ManualSourceDialog'
import OnboardingCoachCard from '@/features/buckets/OnboardingCoachCard'
import FloatHero from '@/features/buckets/FloatHero'
import SuggestedBucketChips from '@/features/buckets/SuggestedBucketChips'
import { Sheet } from '@/components/ui/Sheet'
import { isCashAccount, isLinkedAccount } from '@/lib/accounts'
import BucketsPageSkeleton from '@/components/BucketsPageSkeleton'
import { BusyOverlay } from '@/components/ui/BusyOverlay'
import { ClearableInput } from '@/components/ui/ClearableInput'
import {
  childTotalBalance,
  type BucketsBalanceBreakdown,
} from '@/lib/availableBalance'
import {
  isAppBackgroundExpired,
  isSessionGateActive,
} from '@/lib/backgroundSignOut'
import { readBucketsPageCache, writeBucketsPageCache } from '@/lib/bucketsPageCache'
import { formatRelativeTime } from '@/lib/relativeTime'
import { formatLoadErrorMessage } from '@/lib/authLockError'
import { LoadErrorPanel } from '@/components/ui/LoadErrorPanel'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { loadBucketsPage } from '@/lib/bucketsPageLoad'
import {
  renameBucketInList,
  reorderBucketList,
  swapBucketOrder,
} from '@/lib/bucketsPageOptimistic'
import { toast } from '@/lib/toast'
import {
  deleteBucket,
  BUCKET_NAME_MAX_LENGTH,
  humaniseBucketWriteError,
  renameBucket,
  updateBucketNotes,
  reorderBucket,
  reorderBuckets,
  validateBucketNameForList,
} from '@/lib/buckets'
import {
  fetchAutoOrganizesUsingBucket,
  fetchAutoOrganizes,
  type AutoOrganizeBucketRef,
} from '@/lib/autoOrganize'
import { formatErrorMessage } from '@/lib/errorMessage'
import type { Database } from '@/types/database'
import MoveMoneyDialog from '@/features/buckets/MoveMoneyDialog'
import BucketNotesSheet from '@/features/buckets/BucketNotesSheet'
import AutoOrganizeSection from '@/features/buckets/AutoOrganizeSection'
import SortableBucketList from '@/features/buckets/SortableBucketList'
import { ReorderHintProvider } from '@/features/buckets/ReorderHintContext'
import { usePostgresChanges } from '@/hooks/usePostgresChanges'
import { useFlipList } from '@/hooks/useFlipList'
import { useHideAmounts, usePeekTarget } from '@/lib/HideAmountsProvider'
import { refreshAllBankBalances } from '@/lib/bankProviders'
import { refreshBalancesErrorMessage } from '@/lib/bankLink'
import {
  formatBucketsHeaderSubtitle,
  formatFloatCashSubtext,
} from '@/lib/floatBreakdown'
import {
  getOnboardingCoachState,
  shouldShowOnboardingCoach,
} from '@/lib/onboardingCoach'
import {
  readOnboardingCoachDismissed,
  writeOnboardingCoachDismissed,
} from '@/lib/onboardingCoachStorage'
import type { MoveMoneyIntent } from '@/lib/moveMoneyDialogCopy'
import {
  bucketsPageTabOptions,
  applyBucketsPageTabToSearchParams,
  resolveBucketsPageTab,
  parseBucketsPageTab,
  shouldShowAutoOrganizeTab,
  isAutoOrganizeTabAvailabilityPending,
  type BucketsPageTab,
} from '@/lib/bucketsPageTabs'
import {
  BUCKETS_PAGE_TAB_ACCOUNT_LABEL,
  BUCKETS_PAGE_TABS_ARIA_LABEL,
  REFRESH_BALANCES_ERROR,
} from '@/lib/brand'
import BankAccountsTab from '@/features/accounts/BankAccountsTab'
import BitcoinTab from '@/features/bitcoin/BitcoinTab'
import { fetchOwnBitcoinEntryCount } from '@/lib/bitcoinData'
import { useFeatureFlag } from '@/hooks/FeatureFlagsProvider'

type Bucket = Database['public']['Tables']['buckets']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

export default function BucketsPage() {
  const { formatMoney } = useHideAmounts()
  usePeekTarget()
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [buckets, setBuckets] = useState<Bucket[] | null>(null)
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [balanceBreakdown, setBalanceBreakdown] =
    useState<BucketsBalanceBreakdown | null>(null)
  const [balanceUsesFallback, setBalanceUsesFallback] = useState(false)
  const [householdAdminName, setHouseholdAdminName] = useState<string | null>(
    null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newBucketName, setNewBucketName] = useState('')
  const [moveBucketId, setMoveBucketId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [notesBucketId, setNotesBucketId] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [manualSourceOpen, setManualSourceOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Bucket | null>(null)
  const [deleteAutoOrganizeRefs, setDeleteAutoOrganizeRefs] = useState<
    AutoOrganizeBucketRef[] | null
  >(null)
  const [deleteAutoOrganizeRefsLoadError, setDeleteAutoOrganizeRefsLoadError] =
    useState<string | null>(null)
  const [deletingBucket, setDeletingBucket] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [autoOrganizeRefreshToken, setAutoOrganizeRefreshToken] = useState(0)
  const [autoOrganizeTabAvailable, setAutoOrganizeTabAvailable] = useState<
    boolean | null
  >(null)
  const [bitcoinTabAvailable, setBitcoinTabAvailable] = useState<
    boolean | null
  >(null)
  const [autoOrganizePanelMounted, setAutoOrganizePanelMounted] = useState(
    () => searchParams.get('tab') === 'auto-bucket',
  )
  const [coachDismissed, setCoachDismissed] = useState(true)
  const [movePreferredIntent, setMovePreferredIntent] = useState<
    MoveMoneyIntent | undefined
  >(undefined)
  const createBucketInputRef = useRef<HTMLInputElement | null>(null)
  const [prevCoachMemberId, setPrevCoachMemberId] = useState<string | null>(
    null,
  )

  const member = auth.status === 'signedIn' ? auth.member : null
  const accessToken =
    auth.status === 'signedIn' ? auth.session.access_token : null
  const familyId = member?.family_id ?? null
  const memberId = member?.id ?? null

  if (memberId !== prevCoachMemberId) {
    setPrevCoachMemberId(memberId)
    setCoachDismissed(memberId ? readOnboardingCoachDismissed(memberId) : true)
  }

  const isAdmin = member?.role === 'admin'
  const isChild = member?.role === 'child'
  // Everyone can see Auto-organize now: admins author the household pool, kids
  // author their own scope, shared members see the household read-only.
  const canSeeAutoOrganize = true
  // Authors always get the tab (incl. the empty-state CTA to create their
  // first rule); a read-only shared member only sees it once rules exist.
  const isAutoOrganizeAuthor = isAdmin || isChild
  const showAutoOrganizeTab = shouldShowAutoOrganizeTab(
    canSeeAutoOrganize,
    isAutoOrganizeAuthor,
    autoOrganizeTabAvailable,
  )
  // Linked bank accounts visible to the viewer. RLS already scopes `accounts`
  // per role: adults (admin/member) get every family account, a child gets only
  // the one assigned to them — so this is the right set for everyone.
  const bankAccounts = (accounts ?? []).filter(isLinkedAccount)
  const showAccountTab = bankAccounts.length > 0
  // Flag-gated Bitcoin feature (docs/BITCOIN.md): a kid gets the tab only
  // once they have at least one entry. Availability resolves async and must
  // never delay the page — null just means "hidden for now".
  const bitcoinEnabled = useFeatureFlag('bitcoin')
  // Plaid joins the global balance refresh only for flagged households.
  const plaidEnabled = useFeatureFlag('plaid')
  const showBitcoinTab =
    bitcoinEnabled && isChild && bitcoinTabAvailable === true
  const showBucketsPageTabs =
    showAutoOrganizeTab || showAccountTab || showBitcoinTab
  const bucketsTabOptions = bucketsPageTabOptions({
    showAutoOrganize: showAutoOrganizeTab,
    showAccount: showAccountTab,
    showBitcoin: showBitcoinTab,
  })
  const activeTab = resolveBucketsPageTab(searchParams.get('tab'), {
    autoOrganize: showAutoOrganizeTab,
    account: showAccountTab,
    bitcoin: showBitcoinTab,
  })
  const canCreateBuckets = isAdmin || isChild
  const canManageStructure = isAdmin || isChild

  const loadGeneration = useRef(0)
  const { listRef, prepareFlip } = useFlipList(buckets)

  const loadData = useCallback(async () => {
    if (!familyId || !memberId) return
    const generation = ++loadGeneration.current
    setLoadError(null)

    try {
      const data = await loadBucketsPage()
      if (generation !== loadGeneration.current) return
      setBuckets(data.buckets)
      setAccounts(data.accounts)
      setBalanceBreakdown(data.breakdown)
      setBalanceUsesFallback(data.usedFallback)
      setHouseholdAdminName(data.householdAdminName)
      writeBucketsPageCache(familyId, memberId, {
        buckets: data.buckets,
        accounts: data.accounts,
        breakdown: data.breakdown,
        balanceUsesFallback: data.usedFallback,
        householdAdminName: data.householdAdminName,
      })
    } catch (e) {
      if (generation !== loadGeneration.current) return
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('permission denied')) {
        const { data: userData } = await supabase.auth.getUser()
        await supabase.auth.signOut()
        navigate('/login', {
          replace: true,
          state: {
            info: 'Your session expired. Sign in again.',
            email: userData.user?.email ?? '',
          },
        })
        return
      }
      setLoadError(formatLoadErrorMessage(e, msg))
    }
  }, [familyId, memberId, navigate])

  const realtimeReloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  const refreshAutoOrganizeTabAvailability = useCallback(async () => {
    if (!canSeeAutoOrganize || !familyId) {
      setAutoOrganizeTabAvailable(null)
      return
    }
    if (isAutoOrganizeAuthor) return
    try {
      const rows = await fetchAutoOrganizes()
      setAutoOrganizeTabAvailable(rows.length > 0)
    } catch {
      setAutoOrganizeTabAvailable(false)
    }
  }, [canSeeAutoOrganize, familyId, isAutoOrganizeAuthor])

  const debouncedLoadData = useCallback(() => {
    clearTimeout(realtimeReloadTimer.current)
    realtimeReloadTimer.current = setTimeout(() => {
      void loadData()
      if (canSeeAutoOrganize && !isAutoOrganizeAuthor) {
        void refreshAutoOrganizeTabAvailability()
      }
    }, 300)
  }, [
    loadData,
    canSeeAutoOrganize,
    isAutoOrganizeAuthor,
    refreshAutoOrganizeTabAvailability,
  ])

  useEffect(() => {
    loadGeneration.current += 1
    if (!familyId || !memberId) {
      setBuckets(null)
      setAccounts(null)
      setBalanceBreakdown(null)
      setHouseholdAdminName(null)
      return
    }
    if (isAppBackgroundExpired() || isSessionGateActive()) return

    const cached = readBucketsPageCache(familyId, memberId)
    if (cached) {
      setBuckets(cached.buckets)
      setAccounts(cached.accounts)
      setBalanceBreakdown(cached.breakdown)
      setBalanceUsesFallback(cached.balanceUsesFallback)
      setHouseholdAdminName(cached.householdAdminName ?? null)
    }
  }, [familyId, memberId])

  useEffect(
    () => () => {
      clearTimeout(realtimeReloadTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!familyId) return
    void loadData()
  }, [familyId, loadData])

  const realtimeSpecs = useMemo(() => {
    if (!familyId) return []
    const specs = [
      {
        event: '*' as const,
        table: 'buckets',
        filter: `family_id=eq.${familyId}`,
      },
      {
        event: '*' as const,
        table: 'accounts',
        filter: `family_id=eq.${familyId}`,
      },
      {
        event: 'INSERT' as const,
        table: 'transactions',
        filter: `family_id=eq.${familyId}`,
      },
    ]
    if (memberId) {
      specs.push({
        event: '*' as const,
        table: 'member_bucket_order',
        filter: `member_id=eq.${memberId}`,
      })
    }
    if (canSeeAutoOrganize && !isAdmin && familyId) {
      specs.push({
        event: '*' as const,
        table: 'auto_organizes',
        filter: `family_id=eq.${familyId}`,
      })
    }
    return specs
  }, [familyId, memberId, canSeeAutoOrganize, isAdmin])

  const deleteAutoOrganizeRefsAllManual = useMemo(
    () =>
      deleteAutoOrganizeRefs != null &&
      deleteAutoOrganizeRefs.length > 0 &&
      deleteAutoOrganizeRefs.every((ref) => ref.autoOrganizeType === 'manual'),
    [deleteAutoOrganizeRefs],
  )

  usePostgresChanges(
    accessToken,
    familyId ? `home:${familyId}` : null,
    realtimeSpecs,
    debouncedLoadData,
  )

  useEffect(() => {
    if (!canSeeAutoOrganize || !familyId) {
      setAutoOrganizeTabAvailable(null)
      return
    }
    if (isAutoOrganizeAuthor) {
      setAutoOrganizeTabAvailable(true)
      return
    }
    void refreshAutoOrganizeTabAvailability()
  }, [
    canSeeAutoOrganize,
    familyId,
    isAutoOrganizeAuthor,
    autoOrganizeRefreshToken,
    refreshAutoOrganizeTabAvailability,
  ])

  useEffect(() => {
    if (!bitcoinEnabled || !isChild || !familyId) {
      setBitcoinTabAvailable(null)
      return
    }
    let cancelled = false
    fetchOwnBitcoinEntryCount()
      .then((count) => {
        if (!cancelled) setBitcoinTabAvailable(count > 0)
      })
      .catch(() => {
        // A failed probe just hides the tab — never an error on this page.
        if (!cancelled) setBitcoinTabAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [bitcoinEnabled, isChild, familyId])

  useEffect(() => {
    if (!isAutoOrganizeAuthor && autoOrganizeTabAvailable === null) return
    const urlTab = parseBucketsPageTab(searchParams.get('tab'))
    // Don't strip ?tab=bank while accounts are still loading — the Bank tab
    // only looks unavailable because the data hasn't arrived yet. Waiting for
    // accounts to resolve lets a deep link (e.g. from the Kids page) land on
    // the Bank tab instead of bouncing to Buckets.
    const tabUnavailable =
      (urlTab === 'auto-bucket' && !showAutoOrganizeTab) ||
      (urlTab === 'bank' && accounts !== null && !showAccountTab) ||
      // Only strip ?tab=bitcoin after the availability probe resolves — while
      // it's pending (or the flag is off) the tab just renders as Buckets.
      (urlTab === 'bitcoin' && bitcoinTabAvailable === false)
    if (tabUnavailable) {
      setSearchParams(
        (prev) => applyBucketsPageTabToSearchParams(prev, 'buckets'),
        { replace: true },
      )
    }
  }, [
    accounts,
    autoOrganizeTabAvailable,
    bitcoinTabAvailable,
    isAutoOrganizeAuthor,
    searchParams,
    setSearchParams,
    showAutoOrganizeTab,
    showAccountTab,
  ])

  useEffect(() => {
    if (activeTab === 'auto-bucket') {
      setAutoOrganizePanelMounted(true)
    }
  }, [activeTab])

  const onBucketsPageTabChange = useCallback(
    (tab: BucketsPageTab) => {
      setSearchParams(
        (prev) => applyBucketsPageTabToSearchParams(prev, tab),
        { replace: true },
      )
    },
    [setSearchParams],
  )

  function startRename(id: string, currentName: string) {
    setRenameValue(currentName)
    setRenamingId(id)
  }

  async function commitRename(id: string) {
    const next = renameValue.trim()
    if (!next) {
      setRenamingId(null)
      return
    }
    const previous = buckets?.find((b) => b.id === id)?.name
    const invalid = validateBucketNameForList(
      buckets?.map((b) => b.name) ?? [],
      next,
      { exceptName: previous },
    )
    if (invalid) {
      toast.error(invalid)
      return
    }
    if (!previous || previous === next) {
      setRenamingId(null)
      return
    }
    setRenamingId(null)
    setBuckets((prev) => (prev ? renameBucketInList(prev, id, next) : prev))
    try {
      await renameBucket(id, next)
      void loadData()
    } catch (e) {
      setBuckets((prev) =>
        prev ? renameBucketInList(prev, id, previous) : prev,
      )
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  function cancelRename() {
    setRenamingId(null)
    setRenameValue('')
  }

  const notesBucket =
    notesBucketId != null
      ? (buckets?.find((b) => b.id === notesBucketId) ?? null)
      : null

  async function commitNotes(id: string, notes: string | null) {
    const previous = buckets?.find((b) => b.id === id)?.notes ?? null
    if ((previous ?? '') === (notes ?? '')) return
    setBuckets((prev) =>
      prev ? prev.map((b) => (b.id === id ? { ...b, notes } : b)) : prev,
    )
    try {
      await updateBucketNotes(id, notes)
      void loadData()
    } catch (e) {
      setBuckets((prev) =>
        prev
          ? prev.map((b) => (b.id === id ? { ...b, notes: previous } : b))
          : prev,
      )
      throw e
    }
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    prepareFlip()
    const snapshot = buckets
    setBuckets((prev) => (prev ? swapBucketOrder(prev, id, direction) : prev))
    try {
      await reorderBucket(id, direction)
      void loadData()
    } catch (e) {
      setBuckets(snapshot)
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDragReorder(orderedIds: string[]) {
    const snapshot = buckets
    setBuckets((prev) => (prev ? reorderBucketList(prev, orderedIds) : prev))
    try {
      await reorderBuckets(orderedIds)
      void loadData()
    } catch (e) {
      setBuckets(snapshot)
      toast.error(e instanceof Error ? e.message : String(e))
    }
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

  async function performDeleteBucket(
    b: Bucket,
    reportError: (message: string) => void,
  ) {
    const snapshot = buckets
    if (renamingId === b.id) setRenamingId(null)
    if (moveBucketId === b.id) setMoveBucketId(null)
    setBuckets((prev) => (prev ? prev.filter((x) => x.id !== b.id) : prev))
    setSyncing(true)
    try {
      await deleteBucket(b.id)
      setDeleteTarget(null)
      await loadData()
    } catch (e) {
      setBuckets(snapshot)
      reportError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeletingBucket(false)
      setSyncing(false)
    }
  }

  function requestDeleteBucket(b: Bucket) {
    void (async () => {
      setDeleteError(null)
      setDeleteAutoOrganizeRefs(null)
      setDeleteAutoOrganizeRefsLoadError(null)

      if (canSeeAutoOrganize && isAutoOrganizeAuthor) {
        try {
          const refs = await fetchAutoOrganizesUsingBucket(b.id)
          if (refs.length > 0) {
            setDeleteAutoOrganizeRefs(refs)
            setDeleteTarget(b)
            return
          }
        } catch (e) {
          setDeleteAutoOrganizeRefsLoadError(
            formatErrorMessage(e, 'Could not load schedule details.'),
          )
          setDeleteTarget(b)
          return
        }
      }

      if (Number(b.allocated_amount) > 0) {
        setDeleteTarget(b)
        return
      }
      void performDeleteBucket(b, (message) => toast.error(message))
    })()
  }

  function closeDeleteConfirm() {
    if (deletingBucket) return
    setDeleteTarget(null)
    setDeleteError(null)
    setDeleteAutoOrganizeRefs(null)
    setDeleteAutoOrganizeRefsLoadError(null)
  }

  async function confirmRemoveFromAutoOrganizeAndDelete() {
    if (!deleteTarget) return
    const snapshot = buckets
    if (renamingId === deleteTarget.id) setRenamingId(null)
    if (moveBucketId === deleteTarget.id) setMoveBucketId(null)
    setDeletingBucket(true)
    setDeleteError(null)
    setBuckets((prev) =>
      prev ? prev.filter((x) => x.id !== deleteTarget.id) : prev,
    )
    setSyncing(true)
    try {
      await deleteBucket(deleteTarget.id)
      setDeleteTarget(null)
      setDeleteAutoOrganizeRefs(null)
      await loadData()
      setAutoOrganizeRefreshToken((token) => token + 1)
    } catch (e) {
      setBuckets(snapshot)
      setDeleteError(formatErrorMessage(e, 'Could not delete bucket.'))
    } finally {
      setDeletingBucket(false)
      setSyncing(false)
    }
  }

  async function confirmDeleteBucket() {
    if (!deleteTarget) return
    setDeletingBucket(true)
    setDeleteError(null)
    await performDeleteBucket(deleteTarget, setDeleteError)
  }

  async function onCreateBucket(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!member) return
    const name = newBucketName.trim()
    if (!name) return
    const invalid = validateBucketNameForList(
      buckets?.map((b) => b.name) ?? [],
      name,
    )
    if (invalid) {
      setCreateError(invalid)
      return
    }

    setCreating(true)
    setCreateError(null)
    const { data, error } = await supabase
      .from('buckets')
      .insert({
        family_id: member.family_id,
        owner_member_id: isChild ? member.id : null,
        name,
        allocated_amount: 0,
      })
      .select()
      .single()

    setCreating(false)
    if (error) {
      setCreateError(humaniseBucketWriteError(error))
      return
    }
    setBuckets((prev) => (prev ? [...prev, data] : [data]))
    setNewBucketName('')
  }

  if (loadError) {
    return (
      <LoadErrorPanel
        title="Could not load buckets"
        message={loadError}
        onRetry={() => void loadData()}
      />
    )
  }

  const authLoading =
    auth.status === 'signedIn' && auth.memberLoading
  const tabAvailabilityPending = isAutoOrganizeTabAvailabilityPending(
    canSeeAutoOrganize,
    isAutoOrganizeAuthor,
    autoOrganizeTabAvailable,
  )
  if (
    authLoading ||
    !familyId ||
    buckets === null ||
    accounts === null ||
    balanceBreakdown === null ||
    tabAvailabilityPending
  ) {
    return <BucketsPageSkeleton />
  }

  // Server-side family pool (admin/member share one number). See migration 16.
  const float = balanceBreakdown.float
  const isAdult = !isChild
  const childTotal = isChild ? childTotalBalance(balanceBreakdown) : 0
  const hasMoneySources = accounts.length > 0
  // Once money is in a bucket it is "organized" — show the negative red
  // negative float rebalance signal rather than the getting-started CTA. Only
  // adults with nothing set up at all (no sources, nothing allocated) see it.
  const hasAllocations = balanceBreakdown.bucketAllocated > 0
  const coachState = getOnboardingCoachState({
    hasMoneySources,
    bucketCount: buckets.length,
    hasAllocations,
  })
  const showCoach = shouldShowOnboardingCoach(isAdult, coachDismissed, coachState)
  const showAddSourceCard =
    isAdult && !hasMoneySources && !hasAllocations && !showCoach
  const floatColor =
    float >= 0
      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
      : 'bg-red-500/10 text-red-300 ring-red-500/30'

  const cashAccounts = accounts.filter(
    (a) => isCashAccount(a) && Number(a.current_balance) > 0,
  )
  const cashAccountsCount = cashAccounts.length
  const bankAccountsCount = cashAccounts.filter((a) => a.source === 'teller').length
  const manualAccountsCount = cashAccounts.filter((a) => a.source === 'manual').length

  // Family-wide bank sync time. Comes from the breakdown RPC so every role —
  // including children, who can't read the accounts table — sees the same value.
  const bankSyncedLabel = formatRelativeTime(balanceBreakdown.bankLastSyncedAt)
  // A child can refresh only their OWN linked bank — never the family-wide
  // sync state. `hasLinkedBank` is authoritative (owns a linked account)
  // regardless of balance or whether it has synced yet, so virtual kids stay
  // hidden and a freshly-linked kid at $0 still gets the control.
  // Any linked account counts — a card-only family still needs the refresh
  // control so card debt doesn't go stale with no affordance.
  const canRefreshBalances =
    (isAdult && hasMoneySources && accounts.some(isLinkedAccount)) ||
    (isChild && balanceBreakdown.hasLinkedBank)

  const breakdownOpts = {
    isChild,
    cashAccountsCount,
    bankAccountsCount,
    manualAccountsCount,
    childTotal,
  }
  const cashSubtext = !balanceUsesFallback
    ? formatFloatCashSubtext(balanceBreakdown, breakdownOpts, formatMoney)
    : null

  const floatHint =
    showAddSourceCard || showCoach
      ? null
      : float < 0
        ? balanceBreakdown.cardDebt > 0
          ? floatShortWithCardsHint(formatMoney(Math.abs(float)))
          : floatOverbucketedHint(formatMoney(Math.abs(float)))
        : cashSubtext
          ? null
          : isChild
            ? bucketsKidFloatHint(householdAdminName)
            : balanceBreakdown.cardDebt > 0
              ? FLOAT_HERO_SUBTITLE_WITH_CARDS
              : FLOAT_HERO_SUBTITLE

  return (
    <>
      <BusyOverlay
        busy={
          syncing && moveBucketId === null && !manualSourceOpen
        }
        label="Updating…"
      >
        <div className="space-y-6">
      {balanceUsesFallback && (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-500/30">
          {BUCKETS_DB_UPDATE_PENDING_BODY}
        </p>
      )}
      {showCoach ? (
        <OnboardingCoachCard
          state={coachState}
          isAdmin={isAdmin}
          adminName={householdAdminName}
          onAddSource={() => setManualSourceOpen(true)}
          onFocusCreateBucket={() => createBucketInputRef.current?.focus()}
          onSetAside={() => {
            const target =
              buckets.find((b) => Number(b.allocated_amount) === 0) ?? buckets[0]
            if (!target) return
            setMovePreferredIntent('setAside')
            setMoveBucketId(target.id)
          }}
          onDismiss={() => {
            if (memberId) writeOnboardingCoachDismissed(memberId)
            setCoachDismissed(true)
          }}
        />
      ) : null}
      {showAddSourceCard ? (
        <section
          className="rounded-2xl bg-emerald-500/10 px-4 py-5 ring-1 ring-emerald-500/30"
          aria-label="Add a money source"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-300/70">
            Getting started
          </p>
          <h2 className="mt-1 text-lg font-semibold text-emerald-100">
            {BUCKETS_ADD_SOURCE_TITLE}
          </h2>
          <p className="mt-2 text-sm text-emerald-200/80">
            {isAdmin
              ? BUCKETS_ADD_SOURCE_ADMIN_BODY
              : bucketsAddSourceMemberBody(householdAdminName)}
          </p>
          {balanceBreakdown.bucketAllocated > 0 ? (
            <p className="mt-2 text-xs text-emerald-200/60">
              {formatMoney(balanceBreakdown.bucketAllocated)} allocated
              across {buckets.length} bucket{buckets.length === 1 ? '' : 's'}.
            </p>
          ) : null}
          {isAdmin ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setManualSourceOpen(true)}
                className="inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400"
              >
                {BUCKETS_ADD_SOURCE_MANUAL_ACTION}
              </button>
              <Link
                to="/admin"
                className="inline-flex rounded-lg border border-emerald-500/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/10"
              >
                {BUCKETS_ADD_SOURCE_LINK_ACTION}
              </Link>
            </div>
          ) : null}
        </section>
      ) : (
        <FloatHero
          floatLabel={FLOAT_LABEL}
          amount={formatMoney(float)}
          floatColorClass={floatColor}
          cashSubtext={cashSubtext}
          hint={floatHint}
          bankSyncedLabel={bankSyncedLabel}
          canRefresh={canRefreshBalances}
          syncing={syncing}
          refreshError={refreshError}
          onRefresh={() => void handleRefreshBalances()}
        />
      )}

      {showBucketsPageTabs ? (
        <SegmentedTabs
          value={activeTab}
          options={bucketsTabOptions}
          onChange={onBucketsPageTabChange}
          ariaLabel={BUCKETS_PAGE_TABS_ARIA_LABEL}
        />
      ) : null}

      <div
        role={showBucketsPageTabs ? 'tabpanel' : undefined}
        id={showBucketsPageTabs ? 'segmented-panel-buckets' : undefined}
        aria-labelledby={
          showBucketsPageTabs ? 'segmented-tab-buckets' : undefined
        }
        hidden={showBucketsPageTabs ? activeTab !== 'buckets' : undefined}
      >
      <ReorderHintProvider
        reorderable={buckets.length >= 2 && renamingId === null}
      >
      <section aria-label="Buckets">
        <header
          className={
            showBucketsPageTabs
              ? 'mb-3 flex justify-end'
              : 'mb-3 flex items-baseline justify-between gap-3'
          }
        >
          <h2
            className={
              showBucketsPageTabs ? 'sr-only' : 'text-lg font-semibold'
            }
          >
            Buckets
          </h2>
          <span className="text-right text-xs text-zinc-400">
            {formatBucketsHeaderSubtitle(
              buckets.length,
              balanceBreakdown.bucketAllocated,
              formatMoney,
            )}
          </span>
        </header>

        {buckets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 p-6 text-center">
            <p className="text-sm font-medium text-zinc-300">
              {canCreateBuckets ? BUCKETS_EMPTY_TITLE : 'No buckets yet'}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {canCreateBuckets
                ? BUCKETS_EMPTY_BODY
                : bucketsMemberNoBucketsHint(householdAdminName)}
            </p>
          </div>
        ) : (
          <SortableBucketList
            buckets={buckets}
            listRef={listRef}
            renamingId={renamingId}
            renameValue={renameValue}
            canManageStructure={canManageStructure}
            formatMoney={formatMoney}
            onRenameValueChange={setRenameValue}
            onCommitRename={commitRename}
            onCancelRename={cancelRename}
            onMoveMoney={setMoveBucketId}
            onViewHistory={(id) => navigate(`/history?bucket=${id}`)}
            onRename={startRename}
            onViewNotes={(bucket) => setNotesBucketId(bucket.id)}
            onMoveUp={(id) => void handleReorder(id, 'up')}
            onMoveDown={(id) => void handleReorder(id, 'down')}
            onDelete={requestDeleteBucket}
            onDragReorder={(ids) => void handleDragReorder(ids)}
          />
        )}
        {canCreateBuckets && (
          <>
            <form onSubmit={onCreateBucket} className="mt-4 flex gap-2">
              <ClearableInput
                ref={createBucketInputRef}
                wrapperClassName="min-w-0 flex-1"
                type="text"
                value={newBucketName}
                maxLength={BUCKET_NAME_MAX_LENGTH}
                onValueChange={(value) => {
                  setNewBucketName(value)
                  if (createError) setCreateError(null)
                }}
                placeholder="New bucket name"
                inputClassName="w-full rounded-lg border-0 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-emerald-400"
              />
              <button
                type="submit"
                disabled={creating || newBucketName.trim().length === 0}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? 'Adding…' : 'Add'}
              </button>
            </form>
            {buckets.length === 0 ? (
              <SuggestedBucketChips
                disabled={creating}
                onSelect={(name) => {
                  setNewBucketName(name)
                  if (createError) setCreateError(null)
                }}
              />
            ) : null}
            {createError && (
              <p className="mt-2 text-xs text-red-300">{createError}</p>
            )}
          </>
        )}
      </section>
      </ReorderHintProvider>
      </div>

      {showAutoOrganizeTab &&
      autoOrganizePanelMounted &&
      canSeeAutoOrganize &&
      familyId &&
      memberId ? (
        <div
          role="tabpanel"
          id="segmented-panel-auto-organize"
          aria-labelledby="segmented-tab-auto-organize"
          hidden={activeTab !== 'auto-bucket'}
        >
          <AutoOrganizeSection
            embedded
            isAdmin={isAdmin}
            isChild={isChild}
            memberId={memberId}
            familyId={familyId}
            accessToken={accessToken}
            buckets={buckets ?? []}
            float={float}
            onChanged={() => {
              void loadData()
              if (!isAutoOrganizeAuthor) {
                void refreshAutoOrganizeTabAvailability()
              }
            }}
            refreshToken={autoOrganizeRefreshToken}
          />
        </div>
      ) : null}

      {showAccountTab ? (
        <div
          role="tabpanel"
          id="segmented-panel-account"
          aria-labelledby="segmented-tab-account"
          hidden={activeTab !== 'bank'}
        >
          <section aria-label={BUCKETS_PAGE_TAB_ACCOUNT_LABEL}>
            <BankAccountsTab
              accounts={bankAccounts}
              viewerMemberId={memberId}
              active={activeTab === 'bank'}
            />
          </section>
        </div>
      ) : null}

      {showBitcoinTab ? (
        <div
          role="tabpanel"
          id="segmented-panel-bitcoin"
          aria-labelledby="segmented-tab-bitcoin"
          hidden={activeTab !== 'bitcoin'}
        >
          <BitcoinTab />
        </div>
      ) : null}
        </div>
      </BusyOverlay>

      <MoveMoneyDialog
        open={moveBucketId !== null}
        buckets={buckets}
        float={float}
        initialBucketId={moveBucketId ?? ''}
        preferredIntent={movePreferredIntent}
        onClose={() => {
          setMoveBucketId(null)
          setMovePreferredIntent(undefined)
        }}
        onMoved={async () => {
          setSyncing(true)
          try {
            await loadData()
          } finally {
            setSyncing(false)
          }
        }}
      />

      {notesBucket && (
        <BucketNotesSheet
          bucket={notesBucket}
          canEdit={canManageStructure}
          onClose={() => setNotesBucketId(null)}
          onSave={(notes) => commitNotes(notesBucket.id, notes)}
        />
      )}
      {deleteTarget ? (
        <Sheet
          open
          onClose={closeDeleteConfirm}
          aria-label={bucketsDeleteBucketSheetTitle(deleteTarget.name)}
        >
          <header className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-zinc-300">
              {bucketsDeleteBucketSheetTitle(deleteTarget.name)}
            </h2>
            <button
              type="button"
              onClick={closeDeleteConfirm}
              disabled={deletingBucket}
              className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <div className="space-y-4">
            {deleteAutoOrganizeRefsLoadError ? (
              <>
                <p
                  role="alert"
                  className="break-words rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200 ring-1 ring-inset ring-amber-500/30"
                >
                  {deleteAutoOrganizeRefsLoadError}
                </p>
                <p className="text-sm text-zinc-400">
                  {bucketsDeleteBucketAutoOrganizeLoadFallback(
                    deleteAutoOrganizeRefsAllManual,
                  )}
                </p>
              </>
            ) : deleteAutoOrganizeRefs && deleteAutoOrganizeRefs.length > 0 ? (
              <>
                <p className="text-sm text-zinc-300">
                  {bucketsDeleteBucketAutoOrganizeIntro(
                    deleteAutoOrganizeRefsAllManual,
                  )}
                </p>
                <p className="text-sm text-zinc-400">
                  {bucketsDeleteBucketAutoOrganizeActionHint(
                    deleteAutoOrganizeRefsAllManual,
                  )}
                </p>
                <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200 ring-1 ring-inset ring-amber-500/30">
                  <p className="text-xs font-medium text-amber-200/80">
                    {BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_USED_IN_LABEL}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {deleteAutoOrganizeRefs.map((ref) => (
                      <li key={ref.id}>{ref.name}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-400">
                  {Number(deleteTarget.allocated_amount) > 0
                    ? bucketsDeleteBucketSheetIntro(
                        formatMoney(Number(deleteTarget.allocated_amount)),
                      )
                    : bucketsDeleteBucketEmptyIntro(deleteTarget.name)}
                </p>

                <div>
                  <h3 className="text-sm font-medium text-zinc-300">
                    {BUCKETS_DELETE_BUCKET_WHAT_HAPPENS}
                  </h3>
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-400">
                    <li>
                      {bucketsDeleteBucketEffectFloat(
                        formatMoney(Number(deleteTarget.allocated_amount)),
                      )}
                    </li>
                    <li>{BUCKETS_DELETE_BUCKET_EFFECT_LABEL}</li>
                    <li>{BUCKETS_DELETE_BUCKET_EFFECT_HISTORY}</li>
                  </ul>
                </div>
              </>
            )}

            {deleteError ? (
              <p
                role="alert"
                className="break-words rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-inset ring-red-500/30"
              >
                {deleteError}
              </p>
            ) : null}

            <div
              className={
                (deleteAutoOrganizeRefs && deleteAutoOrganizeRefs.length > 0) ||
                deleteAutoOrganizeRefsLoadError
                  ? 'flex flex-col gap-2 pt-1'
                  : 'flex gap-2 pt-1'
              }
            >
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deletingBucket}
                className={
                  (deleteAutoOrganizeRefs && deleteAutoOrganizeRefs.length > 0) ||
                  deleteAutoOrganizeRefsLoadError
                    ? 'w-full rounded-lg border border-zinc-700 py-2.5 text-sm text-zinc-400 disabled:opacity-50'
                    : 'flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400 disabled:opacity-50'
                }
              >
                Cancel
              </button>
              {(deleteAutoOrganizeRefs && deleteAutoOrganizeRefs.length > 0) ||
              deleteAutoOrganizeRefsLoadError ? (
                <button
                  type="button"
                  onClick={() => void confirmRemoveFromAutoOrganizeAndDelete()}
                  disabled={deletingBucket}
                  aria-label={bucketsDeleteBucketAutoOrganizeConfirmAriaLabel(
                    deleteTarget.name,
                  )}
                  className="w-full rounded-lg bg-red-500 px-3 py-2.5 text-center text-sm font-semibold leading-snug text-white transition hover:bg-red-400 disabled:opacity-50"
                >
                  {deletingBucket
                    ? BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_SUBMITTING_LABEL
                    : deleteAutoOrganizeRefsLoadError
                      ? bucketsDeleteBucketConfirm(deleteTarget.name)
                      : BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_CONFIRM_LABEL}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void confirmDeleteBucket()}
                  disabled={deletingBucket}
                  className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-50"
                >
                  {deletingBucket
                    ? 'Deleting…'
                    : bucketsDeleteBucketConfirm(deleteTarget.name)}
                </button>
              )}
            </div>
          </div>
        </Sheet>
      ) : null}

      {isAdmin ? (
        <ManualSourceDialog
          open={manualSourceOpen}
          mode="create"
          onClose={() => setManualSourceOpen(false)}
          onSaved={async () => {
            setSyncing(true)
            try {
              await loadData()
            } finally {
              setSyncing(false)
            }
          }}
        />
      ) : null}
    </>
  )
}
