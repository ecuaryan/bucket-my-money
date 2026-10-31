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
  FLOAT_CARD_PAYMENT_LAG_NOTE,
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
import { useContentFade } from '@/hooks/useContentFade'
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
import { SegmentedTabIcon } from '@/components/ui/SegmentedTabIcons'
import { loadBucketsPage } from '@/lib/bucketsPageLoad'
import {
  renameBucketInList,
  reorderBucketList,
  swapBucketOrder,
} from '@/lib/bucketsPageOptimistic'
import { toast } from '@/lib/toast'
import {
  EMPTY_GROUP_LAYOUT,
  UNGROUPED_KEY,
  applyLayoutOrder,
  buildSections,
  createBucketGroup,
  deleteBucketGroup,
  hasRealGroups,
  isHiddenSection,
  layoutFromVisibleOrder,
  moveSection,
  moveSectionByHeaders,
  normalizeGroupName,
  orderFromSections,
  renameBucketGroup,
  sameOrder,
  saveBucketLayout,
  type BucketGroupLayout,
  type LayoutOrder,
} from '@/lib/bucketGroups'
import {
  BucketGroupDeleteSheet,
  BucketGroupNameSheet,
} from '@/features/buckets/BucketGroupSheets'
import {
  BUCKET_GROUPS_COLLAPSE_ALL,
  BUCKET_GROUPS_EXPAND_ALL,
  BUCKET_GROUP_NEW_LABEL,
} from '@/lib/brand'
import {
  GROUP_COLLAPSE_MS,
  type GroupAnimation,
} from '@/lib/groupCollapseAnimation'
import { prefersReducedMotion } from '@/lib/motion'
import {
  planCollapseAll,
  readCollapsedGroupKeys,
  writeCollapsedGroupKeys,
} from '@/lib/bucketGroupCollapse'
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
import { refreshBalancesErrorMessage, refreshThrottledMessage } from '@/lib/bankLink'
import {
  formatBucketsHeaderSubtitle,
  formatFloatCashSubtext,
  floatHeroTiles,
  floatMathRows,
  mayBeCardPaymentLag,
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
import { HERO_RADIUS, HERO_TONE_POSITIVE } from '@/components/ui/heroTone'
import { useHeaderAccent, useReportFloat } from '@/hooks/HeaderGlowProvider'
import { useHeroMathPref } from '@/hooks/useHeroMathPref'
import BitcoinTab from '@/features/bitcoin/BitcoinTab'
import { fetchOwnBitcoinEntryCount } from '@/lib/bitcoinData'
import { useFeatureFlag } from '@/hooks/FeatureFlagsProvider'

type Bucket = Database['public']['Tables']['buckets']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

const BITCOIN_GLOW_RGB = '247 147 26'

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
  const [showHeroMath] = useHeroMathPref(memberId)

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

  const [groupLayout, setGroupLayout] =
    useState<BucketGroupLayout>(EMPTY_GROUP_LAYOUT)
  const [groupSheet, setGroupSheet] = useState<
    { mode: 'create' } | { mode: 'rename'; key: string } | null
  >(null)
  const [groupDeleteKey, setGroupDeleteKey] = useState<string | null>(null)
  const grouped = hasRealGroups(groupLayout)
  // Collapsed groups are a per-device preference (localStorage), not DB state.
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    () => (memberId ? readCollapsedGroupKeys(memberId) : new Set<string>()),
  )
  const [collapseMemberId, setCollapseMemberId] = useState(memberId)
  if (collapseMemberId !== memberId) {
    setCollapseMemberId(memberId)
    setCollapsedKeys(memberId ? readCollapsedGroupKeys(memberId) : new Set())
  }
  const updateCollapsedKeys = (
    update: (prev: ReadonlySet<string>) => Set<string>,
  ) => {
    const next = update(collapsedKeys)
    setCollapsedKeys(next)
    if (memberId) writeCollapsedGroupKeys(memberId, next)
  }
  const [groupAnimation, setGroupAnimation] = useState<GroupAnimation | null>(
    null,
  )
  const groupAnimationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const sections = useMemo(
    () => buildSections(buckets ?? [], groupLayout, collapsedKeys),
    [buckets, groupLayout, collapsedKeys],
  )
  const visibleSections = useMemo(
    () => sections.filter((s) => !isHiddenSection(s, grouped)),
    [sections, grouped],
  )
  // The app header's glow follows Unbucketed (red when negative, on every page)
  // and turns Bitcoin orange on the (flag-gated) Bitcoin tab. See HeaderGlowProvider.
  useReportFloat(balanceBreakdown?.float ?? null)
  useHeaderAccent(activeTab === 'bitcoin' ? BITCOIN_GLOW_RGB : null)
  // "Collapse all" while anything is open, "Expand all" once everything is closed.
  // Only worth a control when there are at least two sections to act on.
  const collapseAllPlan = useMemo(
    () =>
      grouped && visibleSections.length >= 2
        ? planCollapseAll(
            visibleSections.map((s) => s.key),
            collapsedKeys,
          )
        : null,
    [grouped, visibleSections, collapsedKeys],
  )

  const loadData = useCallback(async () => {
    if (!familyId || !memberId) return
    const generation = ++loadGeneration.current
    setLoadError(null)

    try {
      const data = await loadBucketsPage()
      if (generation !== loadGeneration.current) return
      setBuckets(data.buckets)
      if (data.groupLayout) setGroupLayout(data.groupLayout)
      setAccounts(data.accounts)
      setBalanceBreakdown(data.breakdown)
      setBalanceUsesFallback(data.usedFallback)
      setHouseholdAdminName(data.householdAdminName)
      writeBucketsPageCache(familyId, memberId, {
        groupLayout: data.groupLayout,
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
      setGroupLayout(EMPTY_GROUP_LAYOUT)
      setAccounts(null)
      setBalanceBreakdown(null)
      setHouseholdAdminName(null)
      return
    }
    if (isAppBackgroundExpired() || isSessionGateActive()) return

    const cached = readBucketsPageCache(familyId, memberId)
    if (cached) {
      setBuckets(cached.buckets)
      if (cached.groupLayout) setGroupLayout(cached.groupLayout)
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
      specs.push({
        event: '*' as const,
        table: 'member_bucket_groups',
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

  // Build the Auto-bucket content quietly once the page is idle, so the first
  // switch to its tab finds it (and its rules) ready. Mounting it on the click
  // meant mount work plus a loading-cards-to-real-cards height jump landed in
  // the middle of the tab animation.
  const canWarmAutoOrganize =
    showAutoOrganizeTab && canSeeAutoOrganize && Boolean(familyId && memberId)
  useEffect(() => {
    if (autoOrganizePanelMounted || !canWarmAutoOrganize) return
    const warm = () => setAutoOrganizePanelMounted(true)
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 2000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(warm, 1000)
    return () => window.clearTimeout(id)
  }, [autoOrganizePanelMounted, canWarmAutoOrganize])

  // Tab content eases in only once the user has switched tabs (not on page open).
  const [tabSwitched, setTabSwitched] = useState(false)
  const panelMotion = tabSwitched ? 'tab-panel-enter' : undefined

  const onBucketsPageTabChange = useCallback(
    (tab: BucketsPageTab) => {
      setTabSwitched(true)
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

  /** Optimistically apply + persist a full group layout; revert on failure. */
  async function commitLayout(order: LayoutOrder, expandKeys: string[] = []) {
    if (!buckets) return
    prepareFlip()
    const snapshot = { buckets, layout: groupLayout }
    const applied = applyLayoutOrder(buckets, groupLayout, order)
    setBuckets(applied.buckets)
    setGroupLayout(applied.layout)
    if (expandKeys.length > 0) {
      updateCollapsedKeys((prev) => {
        const next = new Set(prev)
        expandKeys.forEach((key) => next.delete(key))
        return next
      })
    }
    try {
      await saveBucketLayout(order)
      void loadData()
    } catch (e) {
      setBuckets(snapshot.buckets)
      setGroupLayout(snapshot.layout)
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    if (grouped) {
      // Within the bucket's section; at an edge it hops into the neighbour section.
      const order = orderFromSections(sections)
      const si = order.findIndex((o) => o.bucketIds.includes(id))
      if (si < 0) return
      const next = order.map((o) => ({ ...o, bucketIds: [...o.bucketIds] }))
      const ids = next[si].bucketIds
      const bi = ids.indexOf(id)
      if (direction === 'up') {
        if (bi > 0) {
          ;[ids[bi - 1], ids[bi]] = [ids[bi], ids[bi - 1]]
        } else if (si > 0) {
          ids.splice(bi, 1)
          next[si - 1].bucketIds.push(id)
        } else return
      } else if (bi < ids.length - 1) {
        ;[ids[bi + 1], ids[bi]] = [ids[bi], ids[bi + 1]]
      } else if (si < next.length - 1) {
        ids.splice(bi, 1)
        next[si + 1].bucketIds.unshift(id)
      } else return
      const target = next.find((o) => o.bucketIds.includes(id))
      const expand =
        target && sections.find((s) => s.key === target.key)?.collapsed
          ? [target.key]
          : []
      await commitLayout(next, expand)
      return
    }
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

  async function handleDragReorder(orderedRowIds: string[]) {
    if (grouped) {
      const { order, expandKeys } = layoutFromVisibleOrder(
        sections,
        orderedRowIds,
      )
      if (sameOrder(order, orderFromSections(sections)) && expandKeys.length === 0) {
        return
      }
      await commitLayout(order, expandKeys)
      return
    }
    const snapshot = buckets
    setBuckets((prev) => (prev ? reorderBucketList(prev, orderedRowIds) : prev))
    try {
      await reorderBuckets(orderedRowIds)
      void loadData()
    } catch (e) {
      setBuckets(snapshot)
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleGroupDragReorder(activeHeaderId: string, overHeaderId: string) {
    const current = orderFromSections(sections)
    await commitLayout(moveSectionByHeaders(current, activeHeaderId, overHeaderId))
  }

  async function handleMoveGroup(key: string, direction: 'up' | 'down') {
    // Step over a hidden (empty) Ungrouped so one tap always moves on screen.
    const keys = visibleSections.map((s) => s.key)
    const target = keys[keys.indexOf(key) + (direction === 'up' ? -1 : 1)]
    if (!target) return
    const current = orderFromSections(sections)
    const next = moveSection(
      current,
      key,
      current.findIndex((o) => o.key === target),
    )
    if (next === current) return
    await commitLayout(next)
  }

  /** Take a bucket out of its group (it joins Ungrouped, which reappears). */
  async function handleRemoveFromGroup(bucketId: string) {
    const order = orderFromSections(sections).map((o) => ({
      ...o,
      bucketIds: o.bucketIds.filter((id) => id !== bucketId),
    }))
    const ungrouped = order.find((o) => o.key === UNGROUPED_KEY)
    if (!ungrouped) return
    ungrouped.bucketIds.push(bucketId)
    await commitLayout(order, collapsedKeys.has(UNGROUPED_KEY) ? [UNGROUPED_KEY] : [])
  }

  /** Animate the given groups opening/closing, then clear the animation state. */
  function playGroupAnimation(keys: string[], dir: 'open' | 'close') {
    clearTimeout(groupAnimationTimer.current)
    if (prefersReducedMotion() || keys.length === 0) {
      setGroupAnimation(null)
      return
    }
    setGroupAnimation({ keys, dir })
    groupAnimationTimer.current = setTimeout(
      () => setGroupAnimation(null),
      GROUP_COLLAPSE_MS + 30,
    )
  }

  function handleToggleGroupCollapsed(key: string) {
    const collapsing = !collapsedKeys.has(key)
    playGroupAnimation([key], collapsing ? 'close' : 'open')
    updateCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  function handleCollapseAll() {
    if (!collapseAllPlan) return
    playGroupAnimation(
      collapseAllPlan.animateKeys,
      collapseAllPlan.action === 'collapse' ? 'close' : 'open',
    )
    updateCollapsedKeys(() => collapseAllPlan.next)
  }

  async function submitGroupName(name: string) {
    if (!groupSheet) return
    const normalized = normalizeGroupName(name)
    if (groupSheet.mode === 'create') {
      await createBucketGroup(normalized)
    } else {
      await renameBucketGroup(groupSheet.key, normalized)
    }
    setGroupSheet(null)
    prepareFlip()
    await loadData()
  }

  /** Empty groups go straight away (nothing to explain); others ask first. */
  async function requestDeleteGroup(key: string) {
    const section = sections.find((sec) => sec.key === key)
    if (section && section.buckets.length > 0) {
      setGroupDeleteKey(key)
      return
    }
    prepareFlip()
    const snapshot = groupLayout
    setGroupLayout((prev) => {
      const groups = prev.groups.filter((g) => g.id !== key)
      return {
        ...prev,
        // Last real group gone → plain list again (server drops the Ungrouped row too).
        groups: groups.some((g) => !g.isUngrouped) ? groups : [],
      }
    })
    try {
      await deleteBucketGroup(key)
      void loadData()
    } catch (e) {
      setGroupLayout(snapshot)
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function confirmDeleteGroup() {
    if (!groupDeleteKey) return
    prepareFlip()
    await deleteBucketGroup(groupDeleteKey)
    setGroupDeleteKey(null)
    await loadData()
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

  const authLoading =
    auth.status === 'signedIn' && auth.memberLoading
  const tabAvailabilityPending = isAutoOrganizeTabAvailabilityPending(
    canSeeAutoOrganize,
    isAutoOrganizeAuthor,
    autoOrganizeTabAvailable,
  )
  const showSkeleton =
    authLoading ||
    !familyId ||
    buckets === null ||
    accounts === null ||
    balanceBreakdown === null ||
    tabAvailabilityPending
  const contentFade = useContentFade(showSkeleton)
  if (loadError) {
    return (
      <LoadErrorPanel
        title="Could not load buckets"
        message={loadError}
        onRetry={() => void loadData()}
      />
    )
  }

  if (showSkeleton) {
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
  const heroTiles = !balanceUsesFallback
    ? floatHeroTiles(balanceBreakdown, breakdownOpts, formatMoney)
    : null
  const heroMath = !balanceUsesFallback
    ? floatMathRows(balanceBreakdown, breakdownOpts, formatMoney)
    : null
  const cashSubtext =
    !balanceUsesFallback && !heroTiles
      ? formatFloatCashSubtext(balanceBreakdown, breakdownOpts, formatMoney)
      : null

  const floatHint =
    showAddSourceCard || showCoach
      ? null
      : float < 0
        ? balanceBreakdown.cardDebt > 0
          ? floatShortWithCardsHint(formatMoney(Math.abs(float))) +
            (mayBeCardPaymentLag(float, balanceBreakdown)
              ? ' ' + FLOAT_CARD_PAYMENT_LAG_NOTE
              : '')
          : floatOverbucketedHint(formatMoney(Math.abs(float)))
        : cashSubtext || heroTiles
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
        <div className={'space-y-6 ' + (contentFade ?? '')}>
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
          className={`${HERO_RADIUS} px-4 py-5 ${HERO_TONE_POSITIVE}`}
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
          negative={float < 0}
          cashSubtext={cashSubtext}
          tiles={heroTiles}
          math={showHeroMath ? heroMath : null}
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
          renderIcon={(tab) => <SegmentedTabIcon tab={tab} />}
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
        className={panelMotion}
      >
      <ReorderHintProvider
        reorderable={(buckets.length >= 2 || grouped) && renamingId === null}
      >
      <section aria-label="Buckets">
        <header
          className={
            (showBucketsPageTabs
              ? 'mb-3 flex items-center justify-end'
              : 'mb-3 flex items-baseline justify-between gap-3')
          }
        >
          <h2
            className={
              showBucketsPageTabs ? 'sr-only' : 'text-lg font-semibold'
            }
          >
            Buckets
          </h2>
          {collapseAllPlan ? (
            <button
              type="button"
              onClick={handleCollapseAll}
              className="-my-1.5 mr-auto ml-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-800/60 hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              {collapseAllPlan.action === 'collapse'
                ? BUCKET_GROUPS_COLLAPSE_ALL
                : BUCKET_GROUPS_EXPAND_ALL}
            </button>
          ) : null}
          <span className="text-right text-xs text-zinc-500">
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
            sections={visibleSections}
            onRemoveFromGroup={(id) => void handleRemoveFromGroup(id)}
            grouped={grouped}
            groupAnimation={groupAnimation}
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
            onGroupDragReorder={(a, o) => void handleGroupDragReorder(a, o)}
            onToggleGroupCollapsed={handleToggleGroupCollapsed}
            onRenameGroup={(key) => setGroupSheet({ mode: 'rename', key })}
            onDeleteGroup={(key) => void requestDeleteGroup(key)}
            onMoveGroup={(key, dir) => void handleMoveGroup(key, dir)}
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
        {buckets.length > 0 && (
          <button
            type="button"
            onClick={() => setGroupSheet({ mode: 'create' })}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            {BUCKET_GROUP_NEW_LABEL}
          </button>
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
          id="segmented-panel-auto-bucket"
          aria-labelledby="segmented-tab-auto-bucket"
          hidden={activeTab !== 'auto-bucket'}
          className={panelMotion}
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
          id="segmented-panel-bank"
          aria-labelledby="segmented-tab-bank"
          hidden={activeTab !== 'bank'}
          className={panelMotion}
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
          className={panelMotion}
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

      {groupSheet && (
        <BucketGroupNameSheet
          mode={groupSheet.mode}
          initialName={
            groupSheet.mode === 'rename'
              ? (groupLayout.groups.find((g) => g.id === groupSheet.key)?.name ??
                '')
              : ''
          }
          onClose={() => setGroupSheet(null)}
          onSubmit={submitGroupName}
        />
      )}
      {groupDeleteKey && (
        <BucketGroupDeleteSheet
          name={
            groupLayout.groups.find((g) => g.id === groupDeleteKey)?.name ?? null
          }
          bucketCount={
            sections.find((sec) => sec.key === groupDeleteKey)?.buckets.length ?? 0
          }
          onClose={() => setGroupDeleteKey(null)}
          onConfirm={confirmDeleteGroup}
        />
      )}
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
