import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { LoadErrorPanel } from '@/components/ui/LoadErrorPanel'
import {
  HERO_RADIUS,
  HERO_TONE_NEGATIVE,
  HERO_TONE_POSITIVE,
} from '@/components/ui/heroTone'
import { formatLoadErrorMessage, withAuthLockRetry } from '@/lib/authLockError'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import {
  childTotalBalance,
  fetchBucketsBalanceBreakdown,
  type BucketsBalanceBreakdown,
} from '@/lib/availableBalance'
import {
  BUCKETS_ADD_SOURCE_LINK_ACTION,
  BUCKETS_ADD_SOURCE_MANUAL_ACTION,
  bucketsAddSourceMemberBody,
  GIVE_ADD_SOURCE_ADMIN_BODY,
  GIVE_ADD_SOURCE_TITLE,
  GIVE_KID_INTRO,
  GIVE_SHARED_BALANCE_INTRO,
  GIVE_DB_NOT_READY_BODY,
  GIVE_LINKED_KID_BODY,
  GIVE_LINKED_KID_TITLE,
  GIVE_LINKED_KIDS_EXCLUDED_HINT,
  FLOAT_LABEL_LOWER,
} from '@/lib/brand'
import ManualSourceDialog from '@/features/admin/ManualSourceDialog'
import { fetchHouseholdAdminName } from '@/lib/householdAdmin'
import { subscribeHouseholdRosterRefresh } from '@/lib/householdRosterRefresh'
import { filterGiveRecipients, isLinkedChild } from '@/lib/giveRecipients'
import { fetchLinkedChildMemberIds, giveMoney } from '@/lib/give'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import { usePostgresChanges } from '@/hooks/usePostgresChanges'
import { AmountLimitHint } from '@/components/AmountLimitHint'
import { ClearableInput } from '@/components/ui/ClearableInput'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { BusyOverlay } from '@/components/ui/BusyOverlay'
import { LoadingStatus } from '@/components/ui/LoadingStatus'
import { amountLimitDescribedBy } from '@/lib/amountLimitHint'
import { sanitizeAmountInput } from '@/lib/amountInput'
import { scrollFocusedIntoView } from '@/lib/keyboardViewport'
import { useHideAmounts, usePeekTarget } from '@/lib/HideAmountsProvider'
import type { Database } from '@/types/database'

type Member = Pick<
  Database['public']['Tables']['family_members']['Row'],
  'id' | 'name' | 'role'
>
type Account = Database['public']['Tables']['accounts']['Row']

export default function GivePage() {
  const { formatMoney } = useHideAmounts()
  usePeekTarget()
  const auth = useAuth()
  const member = auth.status === 'signedIn' ? auth.member : null
  const accessToken =
    auth.status === 'signedIn' ? auth.session.access_token : null
  const familyId = member?.family_id ?? null
  const memberId = member?.id ?? null

  const [members, setMembers] = useState<Member[] | null>(null)
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [householdAdminName, setHouseholdAdminName] = useState<string | null>(
    null,
  )
  const [available, setAvailable] = useState<number | null>(null)
  const [balanceBreakdown, setBalanceBreakdown] =
    useState<BucketsBalanceBreakdown | null>(null)
  const [balanceUsesFallback, setBalanceUsesFallback] = useState(false)
  const [giveEnabled, setGiveEnabled] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toMemberId, setToMemberId] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [manualSourceOpen, setManualSourceOpen] = useState(false)
  const [linkedChildIds, setLinkedChildIds] = useState<Set<string> | null>(null)

  const loadData = useCallback(async () => {
    if (!memberId) return
    setLoadError(null)
    try {
      await withAuthLockRetry(async () => {
        const [membersRes, bucketsRes, accountsRes, adminName, linkedIds] =
          await Promise.all([
            supabase
              .from('family_members')
              .select('id, name, role')
              .neq('id', memberId)
              .order('name'),
            supabase.from('buckets').select('allocated_amount'),
            supabase.from('accounts').select('*'),
            fetchHouseholdAdminName(),
            fetchLinkedChildMemberIds(),
          ])
        if (membersRes.error) throw new Error(membersRes.error.message)
        if (bucketsRes.error) throw new Error(bucketsRes.error.message)
        if (accountsRes.error) throw new Error(accountsRes.error.message)

        const accountRows = accountsRes.data ?? []
        const { breakdown, usedFallback } = await fetchBucketsBalanceBreakdown({
          accounts: accountRows,
          buckets: bucketsRes.data ?? [],
        })
        setMembers(membersRes.data ?? [])
        setAccounts(accountRows)
        setLinkedChildIds(linkedIds)
        setHouseholdAdminName(adminName)
        setBalanceBreakdown(breakdown)
        setBalanceUsesFallback(usedFallback)
        setAvailable(breakdown.float)
        setGiveEnabled(!usedFallback)
      })
    } catch (e) {
      setLoadError(formatLoadErrorMessage(e, 'Could not load give screen.'))
    }
  }, [memberId])

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
    familyId ? `give:${familyId}` : null,
    realtimeSpecs,
    loadData,
  )

  const isAdult =
    member?.role === 'admin' || member?.role === 'member'
  const isChild = member?.role === 'child'
  const childTotal =
    balanceBreakdown && isChild ? childTotalBalance(balanceBreakdown) : 0
  const showChildBreakdown =
    isChild &&
    balanceBreakdown &&
    !balanceUsesFallback &&
    (childTotal > 0 || balanceBreakdown.bucketAllocated > 0)

  const callerRole = member?.role
  const recipients = useMemo(() => {
    if (!members || !memberId || !callerRole || !linkedChildIds) return []
    return filterGiveRecipients(
      members,
      memberId,
      callerRole,
      linkedChildIds,
    )
  }, [members, memberId, callerRole, linkedChildIds])

  const isLinkedChildUser = Boolean(
    memberId &&
      callerRole &&
      linkedChildIds &&
      isLinkedChild(memberId, callerRole, linkedChildIds),
  )
  const showLinkedKidsHint = Boolean(
    linkedChildIds &&
      linkedChildIds.size > 0 &&
      !isLinkedChildUser &&
      (isAdult || isChild),
  )

  const amount = parseFloat(amountStr)
  const amountValid = Number.isFinite(amount) && amount > 0
  const overdraft =
    amountValid && available !== null && amount > available
  const overdraftMessage =
    overdraft && available !== null
      ? // Cards can pull the pool negative — "up to −$400" is nonsense.
        `You can only give up to ${formatMoney(Math.max(0, available))}.`
      : null
  const giveAvailableHint =
    available !== null && !overdraft
      ? `You have ${formatMoney(Math.max(0, available))} available to give.`
      : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    if (!toMemberId) {
      setSubmitError('Choose who to give to.')
      return
    }
    if (!amountValid) {
      setSubmitError('Enter an amount greater than $0.')
      return
    }
    if (overdraft && overdraftMessage) {
      setSubmitError(overdraftMessage)
      return
    }

    setSubmitting(true)
    try {
      await giveMoney({
        toMemberId,
        amount,
        note: note.trim() || null,
      })
      const recipient = recipients.find((m) => m.id === toMemberId)
      toast.success(
        recipient
          ? `Gave ${formatMoney(amount)} to ${recipient.name}.`
          : `Gave ${formatMoney(amount)}.`,
      )
      setAmountStr('')
      setNote('')
      setToMemberId('')
      await loadData()
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Give failed. Try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <LoadErrorPanel
        title="Could not load give"
        message={loadError}
        onRetry={() => void loadData()}
      />
    )
  }

  if (members === null || available === null || accounts === null || linkedChildIds === null) {
    return <LoadingStatus className="py-8" />
  }

  if (isAdult) {
    return <Navigate to="/kids" replace />
  }

  if (isLinkedChildUser) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <header>
          <h1 className="text-xl font-semibold">Give</h1>
        </header>
        <section
          className="rounded-2xl bg-zinc-900 px-4 py-5 ring-1 ring-zinc-800"
          aria-label="Linked account"
        >
          <h2 className="text-lg font-semibold text-zinc-100">
            {GIVE_LINKED_KID_TITLE}
          </h2>
          <p className="mt-2 text-sm text-zinc-400">{GIVE_LINKED_KID_BODY}</p>
          <Link
            to="/"
            className="mt-4 inline-flex rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
          >
            Back to Buckets
          </Link>
        </section>
      </div>
    )
  }

  if (recipients.length === 0) {
    return <Navigate to="/" replace />
  }

  const hasMoneySources = accounts.length > 0
  // Allocated buckets count as organized money: show the real (possibly
  // negative) balance instead of the getting-started CTA. Giving stays
  // blocked by the overdraft guard when there is nothing available.
  const hasAllocations = (balanceBreakdown?.bucketAllocated ?? 0) > 0
  const showAddSourceCard = isAdult && !hasMoneySources && !hasAllocations
  const canGive = giveEnabled && !showAddSourceCard

  const availableTone = available >= 0 ? HERO_TONE_POSITIVE : HERO_TONE_NEGATIVE

  return (
    <>
    <BusyOverlay
      busy={submitting && !manualSourceOpen}
      label="Giving…"
    >
      <div className="mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Give</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {isAdult ? GIVE_SHARED_BALANCE_INTRO : GIVE_KID_INTRO}
        </p>
      </header>

      {showAddSourceCard ? (
        <section
          className={`${HERO_RADIUS} px-4 py-4 ${HERO_TONE_POSITIVE}`}
          aria-label="Add a money source"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-300/70">
            Before you give
          </p>
          <h2 className="mt-1 text-lg font-semibold text-emerald-100">
            {GIVE_ADD_SOURCE_TITLE}
          </h2>
          <p className="mt-2 text-sm text-emerald-200/80">
            {member?.role === 'admin'
              ? GIVE_ADD_SOURCE_ADMIN_BODY
              : bucketsAddSourceMemberBody(householdAdminName)}
          </p>
          {member?.role === 'admin' ? (
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
        <section
          className={`${HERO_RADIUS} px-4 pt-3.5 pb-4 ${availableTone}`}
          aria-label={`Your ${FLOAT_LABEL_LOWER} balance`}
        >
          <p className="text-[11.5px] font-semibold uppercase leading-4 tracking-[0.1em] opacity-75">
            You can give
          </p>
          <p
            className={
              'mt-1 text-[32px] font-bold leading-[1.15] tracking-tight tabular-nums ' +
              (available >= 0 ? 'text-emerald-300' : 'text-red-200')
            }
          >
            {formatMoney(available)}
          </p>
          {showChildBreakdown && balanceBreakdown ? (
            <dl className="mt-3 space-y-1 border-t border-current/10 pt-3 text-xs opacity-90">
              {childTotal > 0 ? (
                <div className="flex justify-between gap-4 tabular-nums">
                  <dt>Total balance</dt>
                  <dd>{formatMoney(childTotal)}</dd>
                </div>
              ) : null}
              {balanceBreakdown.bucketAllocated > 0 ? (
                <div className="flex justify-between gap-4 tabular-nums">
                  <dt>In your buckets</dt>
                  <dd>−{formatMoney(balanceBreakdown.bucketAllocated)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </section>
      )}

      {!giveEnabled && (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-500/30">
          {GIVE_DB_NOT_READY_BODY}
        </p>
      )}

      {canGive ? (
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl bg-zinc-900 p-5 ring-1 ring-zinc-800"
        >
          <label className="block">
            <FieldLabel spacing="tight">To</FieldLabel>
            <select
              value={toMemberId}
              onChange={(e) => setToMemberId(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Select a person</option>
              {recipients.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {showLinkedKidsHint ? (
              <p className="mt-2 text-xs text-zinc-500">
                {GIVE_LINKED_KIDS_EXCLUDED_HINT}
              </p>
            ) : null}
          </label>

          <label className="block">
            <FieldLabel spacing="tight">Amount</FieldLabel>
            <ClearableInput
              wrapperClassName="mt-1"
              type="text"
              inputMode="decimal"
              value={amountStr}
              onValueChange={(v) => {
                setAmountStr(sanitizeAmountInput(v))
                setSubmitError(null)
              }}
              onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
              placeholder="0.00"
              required
              aria-invalid={overdraft || undefined}
              aria-describedby={amountLimitDescribedBy(
                'give-amount-hint',
                giveAvailableHint,
                overdraftMessage,
              )}
              leading={
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  $
                </span>
              }
              inputClassName={`w-full rounded-xl border bg-zinc-950 py-2.5 pl-7 pr-3 text-sm tabular-nums text-zinc-100 focus:outline-none focus:ring-1 ${
                overdraft
                  ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/40'
                  : 'border-zinc-700 focus:border-emerald-500 focus:ring-emerald-500'
              }`}
            />
            <AmountLimitHint
              id="give-amount-hint"
              availableHint={giveAvailableHint}
              overdraftMessage={overdraftMessage}
            />
          </label>

          <label className="block">
            <FieldLabel spacing="tight" optional>
              Note
            </FieldLabel>
            <ClearableInput
              wrapperClassName="mt-1"
              type="text"
              maxLength={280}
              value={note}
              onValueChange={setNote}
              onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
              placeholder="Lunch, allowance, …"
              clearAriaLabel="Clear note"
              inputClassName="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>

          {submitError && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
              {submitError}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || overdraft}
            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Giving…' : 'Give'}
          </button>
        </form>
      ) : !giveEnabled ? (
        <p className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-zinc-400 ring-1 ring-zinc-800">
          {GIVE_DB_NOT_READY_BODY}
        </p>
      ) : null}

      <p className="text-center text-xs text-zinc-500">
        Given money shows in{' '}
        <Link to="/history" className="text-emerald-400 hover:underline">
          History
        </Link>
        .
      </p>

      </div>
    </BusyOverlay>
      {member?.role === 'admin' ? (
        <ManualSourceDialog
          open={manualSourceOpen}
          mode="create"
          onClose={() => setManualSourceOpen(false)}
          onSaved={loadData}
        />
      ) : null}
    </>
  )
}
