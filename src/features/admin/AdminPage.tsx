import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LoadErrorPanel } from '@/components/ui/LoadErrorPanel'
import { formatLoadErrorMessage, withAuthLockRetry } from '@/lib/authLockError'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  accountTypeLabel,
  deleteManualAccount,
  isCreditCardAccount,
  type ManualAccountKind,
} from '@/lib/accounts'
import {
  ACCOUNT_CARD_OWED_SUFFIX,
  ADMIN_ADD_MONEY_SOURCE_ACTION,
  ADMIN_ADD_SOURCE_CARD_OPTION,
  ADMIN_ADD_SOURCE_LINK_OPTION,
  ADMIN_ADD_SOURCE_MANUAL_OPTION,
  adminRemoveManualSourceBody,
  ADMIN_MANUAL_GROUP_TITLE,
  ADMIN_MONEY_SOURCES_SECTION_TITLE,
  ADMIN_PAGE_TABS_ARIA_LABEL,
  ADMIN_REMOVE_MANUAL_SOURCE_CONFIRM,
  ADMIN_UNLINK_INSTITUTION_CONFIRM,
  adminLinkedAccountsMemberGate,
  adminMoneySourceGroupExpandLabel,
  adminRemoveManualSourceSheetTitle,
  adminUnlinkInstitutionSheetIntro,
  adminUnlinkInstitutionSheetTitle,
  manualSourceAddedSuccess,
  manualSourceRemovedSuccess,
  manualSourceUpdatedSuccess,
  ADMIN_ADD_SOURCE_PLAID_OPTION,
  PLAID_RECONNECT_NEEDED_NOTE,
  PLAID_RECONNECTED_SUCCESS,
  PLAID_UNLINK_KEEPS_ITEM_NOTE,
  plaidLinkedSuccess,
  SIMPLEFIN_UNLINK_REVOKE_NOTE,
  simpleFinImportedSuccess,
  TELLER_SUNSET_ADMIN_NOTE,
  VIEW_RECENT_BANK_ACTIVITY,
} from '@/lib/brand'
import { toast } from '@/lib/toast'
import {
  groupAccountsByInstitution,
  type InstitutionGroup,
} from '@/lib/adminLinkedAccounts'
import { pickHouseholdAdminName } from '@/lib/householdAdmin'
import { disconnectEnrollment, type TellerEnrollmentMeta } from '@/lib/teller'
import {
  disconnectSimpleFinConnection,
  refreshSimpleFinBalances,
  type SimpleFinConfirmedAccount,
} from '@/lib/simplefin'
import {
  completePlaidUpdateMode,
  createPlaidLinkToken,
  disconnectPlaidItem,
  exchangePlaidPublicToken,
  listPlaidItems,
  refreshPlaidBalances,
  usePlaidLink,
  type PlaidItemMeta,
  type PlaidLinkResult,
} from '@/lib/plaid'
import { useFeatureFlag } from '@/hooks/FeatureFlagsProvider'
import RefreshIconButton from '@/components/ui/RefreshIconButton'
import ManualSourceDialog from '@/features/admin/ManualSourceDialog'
import SimpleFinConnectDialog from '@/features/admin/SimpleFinConnectDialog'
import PlaidConnectSheet from '@/features/admin/PlaidConnectSheet'
import FamilyJoinSection from '@/features/admin/FamilyJoinSection'
import MembersSection from '@/features/admin/MembersSection'
import AppVersionFooter from '@/components/AppVersionFooter'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { useHideAmounts, usePeekTarget } from '@/lib/HideAmountsProvider'
import { BusyOverlay } from '@/components/ui/BusyOverlay'
import { ListSkeleton } from '@/components/ui/ListSkeleton'
import { LoadingStatus } from '@/components/ui/LoadingStatus'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { SegmentedTabIcon } from '@/components/ui/SegmentedTabIcons'
import {
  ADMIN_PAGE_TAB_OPTIONS,
  applyAdminPageTabToSearchParams,
  parseAdminPageTab,
  type AdminPageTab,
} from '@/lib/adminPageTabs'
import type { Database } from '@/types/database'

type Account = Database['public']['Tables']['accounts']['Row']

type FamilyMemberRow = {
  id: string
  name: string
  role: string
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function formatLastSynced(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return dateFormat.format(d)
}

export default function AdminPage() {
  const { formatMoney } = useHideAmounts()
  const auth = useAuth()
  const member = auth.status === 'signedIn' ? auth.member : null

  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [members, setMembers] = useState<FamilyMemberRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [unlinkingKey, setUnlinkingKey] = useState<string | null>(null)
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null)
  const [accountsSyncing, setAccountsSyncing] = useState(false)
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [simpleFinDialogOpen, setSimpleFinDialogOpen] = useState(false)
  // Plaid is flag-gated (10 lifetime Items — owner's household only).
  const plaidEnabled = useFeatureFlag('plaid')
  const plaidLink = usePlaidLink()
  const [plaidItems, setPlaidItems] = useState<PlaidItemMeta[]>([])
  const [plaidSheetOpen, setPlaidSheetOpen] = useState(false)
  const [plaidBusy, setPlaidBusy] = useState(false)
  const [reconnectingKey, setReconnectingKey] = useState<string | null>(null)
  const [manualDialog, setManualDialog] = useState<
    | { mode: 'create'; kind: ManualAccountKind }
    | {
        mode: 'edit'
        kind: ManualAccountKind
        accountId: string
        label: string
        amount: number
      }
    | null
  >(null)
  const addSourceMenuRef = useRef<HTMLDivElement | null>(null)
  // Groups are expanded by default; this tracks the ones the user collapsed.
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [removeManualTarget, setRemoveManualTarget] = useState<{
    id: string
    label: string
    kind: ManualAccountKind
    balance: number
  } | null>(null)
  const [removingManual, setRemovingManual] = useState(false)
  const [removeManualError, setRemoveManualError] = useState<string | null>(null)
  const [unlinkTarget, setUnlinkTarget] = useState<InstitutionGroup | null>(null)

  const isAdmin = member?.role === 'admin'

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseAdminPageTab(searchParams.get('tab'))
  // The Money sources tab shows account balances, so Peek belongs there when it
  // has accounts (the other Admin tabs have no amounts).
  usePeekTarget(activeTab === 'money-sources' && (accounts?.length ?? 0) > 0)
  const [householdPanelMounted, setHouseholdPanelMounted] = useState(
    () => parseAdminPageTab(searchParams.get('tab')) === 'household',
  )

  useEffect(() => {
    if (activeTab === 'household') setHouseholdPanelMounted(true)
  }, [activeTab])

  // Tab content eases in only once the user has switched tabs (not on page open).
  const [tabSwitched, setTabSwitched] = useState(false)
  const panelMotion = tabSwitched ? 'tab-panel-enter' : undefined

  const onAdminPageTabChange = useCallback(
    (tab: AdminPageTab) => {
      setTabSwitched(true)
      setSearchParams(
        (prev) => applyAdminPageTabToSearchParams(prev, tab),
        { replace: true },
      )
    },
    [setSearchParams],
  )

  function toggleGroupExpanded(groupKey: string) {
    setCollapsedGroupKeys((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  useEffect(() => {
    if (!addSourceOpen) return
    function onDocClick(e: MouseEvent) {
      if (!addSourceMenuRef.current) return
      if (!addSourceMenuRef.current.contains(e.target as Node)) {
        setAddSourceOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAddSourceOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [addSourceOpen])

  const loadAccounts = useCallback(async () => {
    setLoadError(null)
    try {
      await withAuthLockRetry(async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
        if (error) throw new Error(error.message)
        setAccounts(data ?? [])
      })
    } catch (e) {
      setLoadError(formatLoadErrorMessage(e, 'Could not load accounts.'))
    }
  }, [])

  const loadMembers = useCallback(async () => {
    try {
      await withAuthLockRetry(async () => {
        const { data, error } = await supabase
          .from('family_members')
          .select('id, name, role')
          .order('created_at', { ascending: true })
        if (error) throw new Error(error.message)
        setMembers(data ?? [])
      })
    } catch (e) {
      setLoadError(formatLoadErrorMessage(e, 'Could not load household members.'))
    }
  }, [])

  const retryAdminLoad = useCallback(() => {
    void loadAccounts()
    void loadMembers()
  }, [loadAccounts, loadMembers])

  // Plaid Item metadata (institution names for detached Items, reconnect
  // state). Best-effort: the page must not break if the flag flips off or
  // the function is unreachable.
  const loadPlaidItems = useCallback(async () => {
    if (!plaidEnabled) return
    try {
      setPlaidItems(await listPlaidItems())
    } catch (e) {
      console.warn('[plaid] items list failed', e)
    }
  }, [plaidEnabled])

  useEffect(() => {
    if (!member) return
    void loadAccounts()
    void loadMembers()
    if (member.role === 'admin' && plaidEnabled) {
      void loadPlaidItems()
    }
  }, [member, loadAccounts, loadMembers, loadPlaidItems, plaidEnabled])

  const memberRolesById = useMemo(
    () => new Map((members ?? []).map((m) => [m.id, m.role])),
    [members],
  )

  const householdAdminName = useMemo(
    () => pickHouseholdAdminName(members ?? []),
    [members],
  )

  // Teller enrollment metadata used to feed institution-name fallbacks and
  // Connect reconnect ids. Teller is quiesced (its API shut down), so the
  // grouping runs on account rows alone.
  const emptyEnrollmentMeta = useMemo(
    () => new Map<string, TellerEnrollmentMeta>(),
    [],
  )
  const plaidItemMeta = useMemo(
    () => new Map(plaidItems.map((item) => [item.id, item])),
    [plaidItems],
  )
  const detachedPlaidItems = useMemo(
    () => plaidItems.filter((item) => item.status === 'detached'),
    [plaidItems],
  )

  const groups = useMemo(
    () =>
      accounts
        ? groupAccountsByInstitution(accounts, emptyEnrollmentMeta, plaidItemMeta)
        : [],
    [accounts, emptyEnrollmentMeta, plaidItemMeta],
  )

  async function afterSimpleFinImport(imported: SimpleFinConfirmedAccount[]) {
    // No cards notice here (unlike the old Teller link flow): the admin just
    // classified each account cash vs card in the confirm step, so a card's
    // effect on the balance was named before it landed.
    toast.success(simpleFinImportedSuccess(imported.length))
    setAccountsSyncing(true)
    try {
      await loadAccounts()
    } finally {
      setAccountsSyncing(false)
    }
  }

  async function onRefresh(group: InstitutionGroup) {
    setRefreshingKey(group.groupKey)
    setAccountsSyncing(true)
    try {
      if (group.provider === 'plaid' && group.plaidItemIds.length > 0) {
        await refreshPlaidBalances(group.plaidItemIds)
      } else if (group.simplefinConnectionIds.length > 0) {
        await refreshSimpleFinBalances(group.simplefinConnectionIds)
      }
      await loadAccounts()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshingKey(null)
      setAccountsSyncing(false)
    }
  }

  async function afterPlaidLinked(result: PlaidLinkResult) {
    toast.success(plaidLinkedSuccess(result.accounts.length))
    setAccountsSyncing(true)
    try {
      await Promise.all([loadAccounts(), loadPlaidItems()])
    } finally {
      setAccountsSyncing(false)
    }
  }

  /** New Plaid link — the only action that consumes a lifetime Item. */
  async function startPlaidNewLink() {
    setPlaidBusy(true)
    try {
      const linkToken = await createPlaidLinkToken()
      setPlaidSheetOpen(false)
      plaidLink.open(linkToken, {
        onSuccess: async (publicToken, metadata) => {
          try {
            const result = await exchangePlaidPublicToken(
              publicToken,
              metadata.institution ?? null,
            )
            await afterPlaidLinked(result)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e))
          } finally {
            setPlaidBusy(false)
          }
        },
        onExit: () => setPlaidBusy(false),
      })
    } catch (e) {
      setPlaidBusy(false)
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  /** Re-import a detached Item's accounts — no Link session, no slot. */
  async function reattachPlaidItem(item: PlaidItemMeta) {
    setPlaidSheetOpen(false)
    setAccountsSyncing(true)
    try {
      const result = await completePlaidUpdateMode(item.id)
      toast.success(plaidLinkedSuccess(result.accounts.length))
      await Promise.all([loadAccounts(), loadPlaidItems()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setAccountsSyncing(false)
    }
  }

  /** Link update-mode repair for ITEM_LOGIN_REQUIRED — never uses a slot. */
  async function reconnectPlaidGroup(group: InstitutionGroup) {
    const itemId = group.plaidItemIds[0]
    if (!itemId) return
    setReconnectingKey(group.groupKey)
    try {
      const linkToken = await createPlaidLinkToken(itemId)
      plaidLink.open(linkToken, {
        onSuccess: async () => {
          try {
            await completePlaidUpdateMode(itemId)
            toast.success(PLAID_RECONNECTED_SUCCESS)
            await Promise.all([loadAccounts(), loadPlaidItems()])
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e))
          } finally {
            setReconnectingKey(null)
          }
        },
        onExit: () => setReconnectingKey(null),
      })
    } catch (e) {
      setReconnectingKey(null)
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  function requestRemoveManualSource(account: Account) {
    setRemoveManualError(null)
    setRemoveManualTarget({
      id: account.id,
      label: account.account_name ?? 'this source',
      kind: isCreditCardAccount(account) ? 'card' : 'cash',
      balance: Number(account.current_balance),
    })
  }

  async function confirmRemoveManualSource() {
    if (!removeManualTarget) return
    setRemovingManual(true)
    setRemoveManualError(null)
    setAccountsSyncing(true)
    const removedLabel = removeManualTarget.label
    try {
      await deleteManualAccount(removeManualTarget.id)
      setRemoveManualTarget(null)
      toast.success(manualSourceRemovedSuccess(removedLabel))
      await loadAccounts()
    } catch (e) {
      setRemoveManualError(e instanceof Error ? e.message : String(e))
    } finally {
      setRemovingManual(false)
      setAccountsSyncing(false)
    }
  }

  function requestUnlinkInstitution(group: InstitutionGroup) {
    if (
      group.enrollmentIds.length === 0 &&
      group.simplefinConnectionIds.length === 0 &&
      group.plaidItemIds.length === 0
    ) {
      return
    }
    setUnlinkTarget(group)
  }

  async function confirmUnlinkInstitution() {
    if (!unlinkTarget) return
    const group = unlinkTarget
    setUnlinkTarget(null)
    setUnlinkingKey(group.groupKey)
    try {
      if (group.provider === 'plaid') {
        for (const itemId of group.plaidItemIds) {
          await disconnectPlaidItem(itemId)
        }
        toast.success(`Unlinked ${group.institutionName ?? 'bank'}.`)
        void loadPlaidItems()
      } else if (group.provider === 'simplefin') {
        for (const connectionId of group.simplefinConnectionIds) {
          await disconnectSimpleFinConnection(connectionId)
        }
        toast.success(`Unlinked ${group.institutionName ?? 'bank'}.`)
      } else {
        // Teller is quiesced: the edge function still deletes the local rows
        // and best-effort-notifies Teller (which is likely gone).
        let lastResult: Awaited<
          ReturnType<typeof disconnectEnrollment>
        > | null = null
        for (const enrollmentId of group.enrollmentIds) {
          lastResult = await disconnectEnrollment(enrollmentId)
        }
        if (lastResult?.tellerDisconnected) {
          toast.success(`Unlinked ${group.institutionName ?? 'bank'} cleanly.`)
        } else {
          toast.success(
            `Unlinked ${group.institutionName ?? 'bank'} locally. Teller has shut down, so there was nothing to disconnect on their side.`,
          )
        }
      }
      setAccountsSyncing(true)
      try {
        await loadAccounts()
      } finally {
        setAccountsSyncing(false)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setUnlinkingKey(null)
    }
  }

  if (!member) {
    return <LoadingStatus label="Loading household…" className="py-8" />
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-200 ring-1 ring-amber-500/30">
        <p className="font-semibold">Admins only</p>
        <p className="mt-1">{adminLinkedAccountsMemberGate(householdAdminName)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Admin</h1>
        </div>
      </header>

      <SegmentedTabs
        value={activeTab}
        options={ADMIN_PAGE_TAB_OPTIONS}
        renderIcon={(tab) => <SegmentedTabIcon tab={tab} />}
        onChange={onAdminPageTabChange}
        ariaLabel={ADMIN_PAGE_TABS_ARIA_LABEL}
      />

      <div
        role="tabpanel"
        id="segmented-panel-money-sources"
        aria-labelledby="segmented-tab-money-sources"
        hidden={activeTab !== 'money-sources'}
        className={panelMotion}
      >
      <BusyOverlay
        busy={
          manualDialog === null &&
          !simpleFinDialogOpen &&
          (unlinkingKey !== null || refreshingKey !== null || accountsSyncing)
        }
        label={
          refreshingKey ? 'Refreshing balances…' : 'Updating accounts…'
        }
      >
      <section aria-label="Money sources">
        <div className="mb-3 flex items-start justify-end gap-3">
          <h2 className="sr-only">{ADMIN_MONEY_SOURCES_SECTION_TITLE}</h2>
          <div ref={addSourceMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setAddSourceOpen((v) => !v)}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ADMIN_ADD_MONEY_SOURCE_ACTION}
            </button>
            {addSourceOpen ? (
              <div className="absolute right-0 z-10 mt-1 w-max min-w-[12rem] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
                <button
                  type="button"
                  className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  onClick={() => {
                    setAddSourceOpen(false)
                    setSimpleFinDialogOpen(true)
                  }}
                >
                  {ADMIN_ADD_SOURCE_LINK_OPTION}
                </button>
                {plaidEnabled ? (
                  <button
                    type="button"
                    disabled={!plaidLink.ready || plaidLink.linking || plaidBusy}
                    className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    onClick={() => {
                      setAddSourceOpen(false)
                      // The chooser sheet only earns its tap when a detached
                      // Item offers a free re-add; otherwise straight to Link.
                      if (detachedPlaidItems.length > 0) {
                        setPlaidSheetOpen(true)
                      } else {
                        void startPlaidNewLink()
                      }
                    }}
                  >
                    {ADMIN_ADD_SOURCE_PLAID_OPTION}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  onClick={() => {
                    setAddSourceOpen(false)
                    setManualDialog({ mode: 'create', kind: 'cash' })
                  }}
                >
                  {ADMIN_ADD_SOURCE_MANUAL_OPTION}
                </button>
                <button
                  type="button"
                  className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  onClick={() => {
                    setAddSourceOpen(false)
                    setManualDialog({ mode: 'create', kind: 'card' })
                  }}
                >
                  {ADMIN_ADD_SOURCE_CARD_OPTION}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {loadError ? (
          <LoadErrorPanel
            title="Could not load money sources"
            message={loadError}
            onRetry={retryAdminLoad}
            className="rounded-lg p-3"
          />
        ) : accounts === null ? (
          <ListSkeleton label="Loading accounts…" rows={2} />
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 p-6 text-center">
            <p className="text-sm font-medium text-zinc-300">
              No money sources yet
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => {
              const expanded = !collapsedGroupKeys.has(group.groupKey)
              const accountsPanelId = `admin-group-${group.groupKey}-accounts`
              // SimpleFIN and Plaid groups have live actions; Teller groups
              // are quiesced (frozen balances, unlink only).
              const canRefresh =
                group.simplefinConnectionIds.length > 0 ||
                group.plaidItemIds.length > 0
              const canUnlink = group.provider !== null
              const showPlaidReconnect =
                group.provider === 'plaid' && group.plaidReconnectRequired
              return (
              <li
                key={group.groupKey}
                className="overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800"
              >
                <header
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${
                    expanded ? 'border-b border-zinc-800' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroupExpanded(group.groupKey)}
                    aria-expanded={expanded}
                    aria-controls={accountsPanelId}
                    aria-label={adminMoneySourceGroupExpandLabel(
                      expanded,
                      group.accounts.length,
                    )}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className={
                        'h-4 w-4 shrink-0 text-zinc-400 motion-safe:transition-transform motion-safe:duration-200 ' +
                        (expanded ? 'rotate-180' : '')
                      }
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-300">
                        {group.isManual
                          ? ADMIN_MANUAL_GROUP_TITLE
                          : (group.institutionName ?? 'Unknown institution')}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {group.accounts.length} account
                        {group.accounts.length === 1 ? '' : 's'} ·{' '}
                        {formatMoney(group.totalBalance)} ·{' '}
                        {/* "Refreshed" means a bank pull; a manual row's
                            timestamp is when the admin last set the amount. */}
                        {group.isManual ? 'updated' : 'last refreshed'}{' '}
                        {formatLastSynced(group.lastSyncedAt)}
                      </p>
                    </div>
                  </button>
                  {canUnlink && (
                    <div className="flex shrink-0 items-center gap-2">
                      {canRefresh && (
                        <RefreshIconButton
                          busy={refreshingKey === group.groupKey}
                          disabled={
                            refreshingKey === group.groupKey ||
                            unlinkingKey === group.groupKey ||
                            reconnectingKey === group.groupKey
                          }
                          onClick={() => void onRefresh(group)}
                          className="text-zinc-400 hover:text-zinc-200"
                        />
                      )}
                      {showPlaidReconnect && (
                        <button
                          type="button"
                          onClick={() => void reconnectPlaidGroup(group)}
                          disabled={
                            !plaidLink.ready ||
                            reconnectingKey === group.groupKey ||
                            unlinkingKey === group.groupKey ||
                            refreshingKey === group.groupKey
                          }
                          className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {reconnectingKey === group.groupKey
                            ? 'Reconnecting…'
                            : 'Reconnect'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => requestUnlinkInstitution(group)}
                        disabled={
                          unlinkingKey === group.groupKey ||
                          refreshingKey === group.groupKey
                        }
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {unlinkingKey === group.groupKey
                          ? 'Unlinking…'
                          : 'Unlink'}
                      </button>
                    </div>
                  )}
                </header>
                {group.provider === 'teller' ? (
                  <p className="border-b border-zinc-800 bg-amber-500/5 px-4 py-2 text-xs text-amber-200/90">
                    {TELLER_SUNSET_ADMIN_NOTE}
                  </p>
                ) : null}
                {showPlaidReconnect ? (
                  <p className="border-b border-zinc-800 bg-amber-500/5 px-4 py-2 text-xs text-amber-200/90">
                    {PLAID_RECONNECT_NEEDED_NOTE}
                  </p>
                ) : null}
                {expanded ? (
                <ul
                  id={accountsPanelId}
                  className="divide-y divide-zinc-800"
                >
                  {group.accounts.map((a) => {
                    const balance = isCreditCardAccount(a) ? (
                      <p className="shrink-0 text-sm font-medium tabular-nums text-rose-300">
                        {formatMoney(Number(a.current_balance))}{' '}
                        <span className="text-xs font-normal text-rose-300/70">
                          {ACCOUNT_CARD_OWED_SUFFIX}
                        </span>
                      </p>
                    ) : (
                      <p className="shrink-0 text-sm font-medium tabular-nums text-zinc-300">
                        {formatMoney(Number(a.current_balance))}
                      </p>
                    )
                    return (
                      <li key={a.id}>
                        {group.isManual ? (
                          // Manual rows open their editor (which also removes).
                          <button
                            type="button"
                            onClick={() =>
                              setManualDialog({
                                mode: 'edit',
                                kind: isCreditCardAccount(a) ? 'card' : 'cash',
                                accountId: a.id,
                                label: a.account_name ?? a.institution_name ?? '',
                                amount: Number(a.current_balance),
                              })
                            }
                            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-zinc-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400"
                          >
                            <span className="min-w-0 truncate text-sm text-zinc-300">
                              {a.account_name ?? 'Account'}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {balance}
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                aria-hidden="true"
                                className="h-4 w-4 text-zinc-600"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm text-zinc-300">
                                {a.account_name ?? 'Account'}
                              </p>
                              <p className="text-xs text-zinc-400">
                                {/* A multi-bank connection card names each row's
                                    bank so the mix stays readable. */}
                                {group.spansInstitutions && a.institution_name
                                  ? `${a.institution_name} · `
                                  : ''}
                                {accountTypeLabel(a.account_type)}
                              </p>
                            </div>
                            {balance}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
                ) : null}
              </li>
            )})}
          </ul>
        )}
        {!loadError && accounts !== null && groups.some((g) => !g.isManual) ? (
          <div className="mt-3 rounded-2xl bg-zinc-900 px-4 py-3 ring-1 ring-zinc-800">
            <Link
              to="/?tab=bank"
              className="text-xs font-semibold text-emerald-400 transition hover:text-emerald-300"
            >
              {VIEW_RECENT_BANK_ACTIVITY} →
            </Link>
          </div>
        ) : null}
      </section>
      </BusyOverlay>
      </div>

      <div
        role="tabpanel"
        id="segmented-panel-household"
        aria-labelledby="segmented-tab-household"
        hidden={activeTab !== 'household'}
        className={panelMotion}
      >
        {householdPanelMounted ? (
          <div className="space-y-6">
            <MembersSection
              onRosterChanged={() => {
                void loadMembers()
                void loadAccounts()
              }}
              linkedAccounts={accounts}
              memberRolesById={memberRolesById}
              onLinkedAccountsChanged={() => void loadAccounts()}
            />
            <FamilyJoinSection />
          </div>
        ) : null}
      </div>

      <ManualSourceDialog
        open={manualDialog !== null}
        mode={manualDialog?.mode ?? 'create'}
        kind={manualDialog?.kind ?? 'cash'}
        accountId={
          manualDialog?.mode === 'edit' ? manualDialog.accountId : undefined
        }
        initialLabel={
          manualDialog?.mode === 'edit' ? manualDialog.label : undefined
        }
        initialAmount={
          manualDialog?.mode === 'edit' ? manualDialog.amount : undefined
        }
        onClose={() => setManualDialog(null)}
        onRemove={() => {
          if (manualDialog?.mode !== 'edit') return
          const account = accounts?.find((a) => a.id === manualDialog.accountId)
          setManualDialog(null)
          if (account) requestRemoveManualSource(account)
        }}
        onSaved={async ({ label, mode }) => {
          toast.success(
            mode === 'create'
              ? manualSourceAddedSuccess(label)
              : manualSourceUpdatedSuccess(label),
          )
          setAccountsSyncing(true)
          try {
            await loadAccounts()
          } finally {
            setAccountsSyncing(false)
          }
        }}
      />

      <SimpleFinConnectDialog
        open={simpleFinDialogOpen}
        onClose={() => setSimpleFinDialogOpen(false)}
        onImported={afterSimpleFinImport}
      />

      {plaidEnabled ? (
        <PlaidConnectSheet
          open={plaidSheetOpen}
          busy={plaidBusy || plaidLink.linking}
          detachedItems={detachedPlaidItems}
          onClose={() => setPlaidSheetOpen(false)}
          onConnectNew={() => void startPlaidNewLink()}
          onReattach={(item) => void reattachPlaidItem(item)}
        />
      ) : null}

      {removeManualTarget ? (
        <ConfirmSheet
          title={adminRemoveManualSourceSheetTitle(removeManualTarget.label)}
          body={adminRemoveManualSourceBody(
            removeManualTarget.kind,
            formatMoney(removeManualTarget.balance),
          )}
          confirmLabel={ADMIN_REMOVE_MANUAL_SOURCE_CONFIRM}
          busyLabel="Removing…"
          busy={removingManual}
          error={removeManualError}
          onConfirm={() => void confirmRemoveManualSource()}
          onClose={() => {
            setRemoveManualTarget(null)
            setRemoveManualError(null)
          }}
        />
      ) : null}

      {unlinkTarget ? (
        <ConfirmSheet
          title={adminUnlinkInstitutionSheetTitle(unlinkTarget.institutionName)}
          body={
            adminUnlinkInstitutionSheetIntro(unlinkTarget.accounts.length) +
            (unlinkTarget.provider === 'simplefin'
              ? ' ' + SIMPLEFIN_UNLINK_REVOKE_NOTE
              : unlinkTarget.provider === 'plaid'
                ? ' ' + PLAID_UNLINK_KEEPS_ITEM_NOTE
                : '')
          }
          confirmLabel={ADMIN_UNLINK_INSTITUTION_CONFIRM}
          onConfirm={() => void confirmUnlinkInstitution()}
          onClose={() => setUnlinkTarget(null)}
        />
      ) : null}

      <AppVersionFooter />
    </div>
  )
}
