import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ACCOUNT_CARD_OWED_SUFFIX,
  BANK_ACCOUNT_MEMBER_FALLBACK,
  BANK_ACCOUNT_SHARED_TAG,
} from '@/lib/brand'
import { bankAccountOwnerTag, isCreditCardAccount } from '@/lib/accounts'
import { useHideAmounts } from '@/lib/HideAmountsProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import BankAccountActivity from '@/features/accounts/BankAccountActivity'
import DragHandle from '@/components/ui/DragHandle'
import { ReorderMenu } from '@/features/buckets/BucketGroupHeader'
import { blockShiftY } from '@/features/buckets/rowLongPressReorder'
import { useRowLongPressReorder } from '@/features/buckets/useRowLongPressReorder'
import { useFlipList } from '@/hooks/useFlipList'
import {
  fetchBankOrder,
  institutionKey,
  moveKey,
  saveBankOrder,
  sortByBankOrder,
} from '@/lib/bankOrder'
import { headerIdForKey, keyFromHeaderId } from '@/lib/bucketGroups'
import { prefersReducedMotion } from '@/lib/motion'
import { toast } from '@/lib/toast'

type Account = Database['public']['Tables']['accounts']['Row']

type Props = {
  /** Linked bank accounts visible to the viewer (already RLS-scoped per role). */
  accounts: Account[]
  viewerMemberId: string | null
  /** True when the Bank tab is the active tab (drives the activity fetch). */
  active: boolean
}

/**
 * The Bank tab body: one card per institution, one tappable row per account
 * (name + tag + balance; tapping expands recent activity inline). Adults see
 * every family account; a child sees only their own (enforced by RLS + the
 * edge functions). Household (unassigned) accounts sort first within a card,
 * then accounts assigned to a kid.
 *
 * Cards reorder per person (grip, long-press on the card heading, or the
 * heading's menu) — whole institutions only, never the accounts inside.
 */
export default function BankAccountsTab({
  accounts,
  viewerMemberId,
  active,
}: Props) {
  const { formatMoney } = useHideAmounts()
  const [roles, setRoles] = useState<ReadonlyMap<string, string>>(new Map())
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map())
  const [openAccountIds, setOpenAccountIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [orderKeys, setOrderKeys] = useState<string[]>([])
  const { listRef, prepareFlip } = useFlipList(orderKeys)

  // Accounts assigned to someone other than the viewer (e.g. a kid). Drives
  // both the member-name lookup and whether to show tags at all — with no such
  // account there is nothing to distinguish, so a solo viewer sees no chips.
  const hasAssignedAccounts = useMemo(
    () =>
      accounts.some(
        (a) => a.owner_member_id && a.owner_member_id !== viewerMemberId,
      ),
    [accounts, viewerMemberId],
  )

  // One card per institution; within a card, household accounts first, then
  // kid-assigned. Institutions keep first-seen order from the account list.
  const institutionGroups = useMemo(() => {
    const ordered = [...accounts].sort(
      (a, b) =>
        Number(Boolean(a.owner_member_id)) - Number(Boolean(b.owner_member_id)),
    )
    const groups = new Map<string, { name: string; accounts: Account[] }>()
    for (const account of ordered) {
      const name = account.institution_name ?? 'Bank'
      const key = institutionKey(account.institution_name)
      const group = groups.get(key)
      if (group) group.accounts.push(account)
      else groups.set(key, { name, accounts: [account] })
    }
    return [...groups.entries()].map(([key, g]) => ({ key, ...g }))
  }, [accounts])

  // The person's own card order (first-seen order until they set one).
  const sortedGroups = useMemo(
    () => sortByBankOrder(institutionGroups, orderKeys),
    [institutionGroups, orderKeys],
  )
  const canReorder = sortedGroups.length >= 2
  const sortedKeys = useMemo(() => sortedGroups.map((g) => g.key), [sortedGroups])
  const headerIds = useMemo(() => sortedKeys.map(headerIdForKey), [sortedKeys])

  useEffect(() => {
    let cancelled = false
    void fetchBankOrder().then((keys) => {
      if (!cancelled) setOrderKeys(keys)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const orderRef = useRef(orderKeys)
  useEffect(() => {
    orderRef.current = orderKeys
  }, [orderKeys])

  async function commitOrder(keys: string[]) {
    if (keys === sortedKeys) return
    prepareFlip()
    const snapshot = orderRef.current
    setOrderKeys(keys)
    try {
      await saveBankOrder(keys)
    } catch (e) {
      setOrderKeys(snapshot)
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  function moveBank(key: string, direction: 'up' | 'down') {
    const from = sortedKeys.indexOf(key)
    void commitOrder(moveKey(sortedKeys, from, from + (direction === 'up' ? -1 : 1)))
  }

  const {
    pendingBucketId,
    manualDragBucketId,
    manualDragOverlay,
    manualDragOverIndex,
    manualBlockExtents,
    getRowHandlers,
  } = useRowLongPressReorder({
    listRef,
    bucketIds: headerIds,
    // A plain tap on a heading does nothing; accounts below handle their own taps.
    onMoveMoney: () => {},
    onDragReorder: (next) => void commitOrder(next.map(keyFromHeaderId)),
    notifyDragStarted: () => {},
    disabled: !canReorder,
  })

  const draggedIndex = manualDragBucketId
    ? sortedKeys.indexOf(keyFromHeaderId(manualDragBucketId))
    : -1
  const draggedGroup = draggedIndex >= 0 ? sortedGroups[draggedIndex] : null
  const dragTransition = prefersReducedMotion() ? undefined : 'transform 250ms ease'

  function shiftStyle(index: number) {
    if (draggedIndex < 0 || !manualBlockExtents) return undefined
    if (manualDragOverIndex == null || manualDragOverIndex < 0) return undefined
    const y = blockShiftY(index, draggedIndex, manualDragOverIndex, manualBlockExtents)
    return {
      transform: y ? `translateY(${y}px)` : undefined,
      transition: dragTransition,
    }
  }

  useEffect(() => {
    if (!active) setOpenAccountIds(new Set())
  }, [active])

  useEffect(() => {
    if (!hasAssignedAccounts) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('family_members')
        .select('id, name, role')
      if (cancelled || error || !data) return
      setRoles(new Map(data.map((m) => [m.id, m.role])))
      setNames(new Map(data.map((m) => [m.id, m.name])))
    })()
    return () => {
      cancelled = true
    }
  }, [hasAssignedAccounts])

  function toggleAccount(accountId: string) {
    setOpenAccountIds((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }

  return (
    <>
    <ul ref={listRef}>
      {sortedGroups.flatMap((group, index) => {
        const headerId = headerIdForKey(group.key)
        const dragging = draggedGroup?.key === group.key
        const style = shiftStyle(index)
        const titleId = `bank-title-${index}`
        return [
          <li
            key={headerId}
            data-flip-id={headerId}
            data-group-header=""
            style={style}
            className={
              'flex items-center gap-1 rounded-t-2xl border-x border-t border-zinc-800 bg-zinc-900 py-1.5 ' +
              (canReorder ? 'pl-2 pr-1 ' : 'px-4 py-2.5 ') +
              (index > 0 ? 'mt-4 ' : '') +
              (dragging ? 'opacity-40' : '')
            }
          >
            {canReorder ? (
              <DragHandle label="Reorder bank" {...getRowHandlers(headerId, true)} />
            ) : null}
            <div
              data-reorder-row=""
              {...(canReorder ? getRowHandlers(headerId) : {})}
              className={
                'min-w-0 flex-1 select-none rounded-lg px-1.5 py-1.5 touch-pan-y [-webkit-touch-callout:none] ' +
                (pendingBucketId === headerId
                  ? 'bg-zinc-800/70 ring-2 ring-inset ring-emerald-400/45'
                  : '')
              }
            >
              <h3
                id={titleId}
                className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-500"
              >
                {group.name}
              </h3>
            </div>
            {canReorder ? (
              <ReorderMenu
                ariaLabel={`${group.name} options`}
                isFirst={index === 0}
                isLast={index === sortedGroups.length - 1}
                onMoveUp={() => moveBank(group.key, 'up')}
                onMoveDown={() => moveBank(group.key, 'down')}
              />
            ) : null}
          </li>,
          <li
            key={`body:${group.key}`}
            data-flip-id={`body:${group.key}`}
            style={style}
            aria-labelledby={titleId}
            className={
              'overflow-hidden rounded-b-2xl border border-zinc-800 bg-zinc-900 ' +
              (dragging ? 'opacity-40' : '')
            }
          >
          <ul className="divide-y divide-zinc-800/70">
            {group.accounts.map((a) => {
              const tag = bankAccountOwnerTag(a, roles, names, viewerMemberId, {
                sharedLabel: BANK_ACCOUNT_SHARED_TAG,
                fallbackName: BANK_ACCOUNT_MEMBER_FALLBACK,
              })
              const open = openAccountIds.has(a.id)
              const activityPanelId = `bank-activity-${a.id}`
              return (
                <li key={a.id} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleAccount(a.id)}
                    aria-expanded={open}
                    aria-controls={activityPanelId}
                    className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                        className={
                          'h-4 w-4 shrink-0 text-zinc-500 motion-safe:transition-transform motion-safe:duration-200 ' +
                          (open ? 'rotate-180' : '')
                        }
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="truncate text-sm font-medium text-zinc-200">
                        {a.account_name ?? 'Bank account'}
                      </span>
                      {/* Tag only when there's a mix to disambiguate; a kid
                          tag always shows. */}
                      {tag && (tag.kind === 'member' || hasAssignedAccounts) ? (
                        <span
                          className={
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ' +
                            (tag.kind === 'shared'
                              ? 'bg-zinc-800 text-zinc-400'
                              : 'bg-sky-500/15 text-sky-300')
                          }
                        >
                          {tag.label}
                        </span>
                      ) : null}
                    </span>
                    {isCreditCardAccount(a) ? (
                      <span className="shrink-0 text-sm font-medium tabular-nums text-rose-300">
                        {formatMoney(Number(a.current_balance))}{' '}
                        <span className="text-xs font-normal text-rose-300/70">
                          {ACCOUNT_CARD_OWED_SUFFIX}
                        </span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-200">
                        {formatMoney(Number(a.current_balance))}
                      </span>
                    )}
                  </button>
                  <div id={activityPanelId}>
                    <BankAccountActivity
                      accountId={a.id}
                      source={a.source}
                      open={open}
                      panelOpen={active}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          </li>,
        ]
      })}
    </ul>
    {draggedGroup && manualDragOverlay ? (
      <div
        className="pointer-events-none fixed z-[999]"
        style={{
          left: manualDragOverlay.left,
          width: manualDragOverlay.width,
          top: manualDragOverlay.top,
        }}
      >
        <div className="flex items-center gap-1 rounded-2xl bg-zinc-900 py-1.5 pl-2 pr-3 shadow-lg ring-2 ring-emerald-400">
          <DragHandle label="Reorder bank" className="cursor-grabbing text-zinc-400" tabIndex={-1} />
          <span className="truncate px-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {draggedGroup.name}
          </span>
        </div>
      </div>
    ) : null}
    </>
  )
}
