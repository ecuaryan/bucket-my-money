import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth'
import { formatLoadErrorMessage, withAuthLockRetry } from '@/lib/authLockError'
import { formatErrorMessage } from '@/lib/errorMessage'
import { supabase } from '@/lib/supabase'
import { ClearableInput } from '@/components/ui/ClearableInput'
import { FieldLabel } from '@/components/ui/FieldLabel'
import PinInput from '@/components/ui/PinInput'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Sheet } from '@/components/ui/Sheet'
import { SheetHeader } from '@/components/ui/SheetHeader'
import { BusyOverlay } from '@/components/ui/BusyOverlay'
import { ListSkeleton } from '@/components/ui/ListSkeleton'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import {
  ADMIN_ADD_MEMBER_LABEL,
  ADMIN_HOUSEHOLD_MEMBERS_TITLE,
  ADMIN_LOADING_MEMBERS,
  ADMIN_MEMBER_ROLE_TABS_LABEL,
  APP_FORM_DATA_ATTR,
  adminMemberStatusLine,
  adminRemoveMemberSheetBody,
  adminMemberAddedSuccess,
  adminMemberLockoutClearedSuccess,
  adminMemberRemovedSuccess,
  adminPinSaveSuccess,
  adminRemoveMemberSheetTitle,
  adminPinSheetBody,
  adminPinSheetTitle,
  adminRoleAddHint,
  type HouseholdMemberRole,
} from '@/lib/brand'
import { bindDeviceForPinSignIn } from '@/lib/familyDevice'
import { roleLabel } from '@/lib/memberRoles'
import {
  clearPinLockout,
  createMember,
  removeMember,
  setMemberPin,
} from '@/lib/memberAuth'
import {
  humaniseMemberWriteError,
  validateMemberNameForFamily,
} from '@/lib/memberName'
import { toast } from '@/lib/toast'
import { clientRandomId } from '@/lib/clientRandomId'
import KidAccountAssignment from '@/features/admin/KidAccountAssignment'
import { accountAssignmentChildId, isLinkedAccount } from '@/lib/accounts'
import type { Database } from '@/types/database'

type LinkedAccount = Database['public']['Tables']['accounts']['Row']

type Member = {
  id: string
  name: string
  role: string
  is_account_owner: boolean
  avatar_url: string | null
  pin_locked: boolean
  pin_set_at: string | null
  pin_failed_attempts: number
  created_at: string
  family_id: string
  user_id: string | null
}

const ROLE_OPTIONS = (['admin', 'member', 'child'] as const).map((role) => ({
  value: role,
  label: roleLabel(role),
}))

const fieldInputClassName =
  'w-full rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 focus:outline focus:outline-2 focus:outline-emerald-400'

const sheetActionClassName =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800'

function Chevron() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-zinc-600"
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

type MembersSectionProps = {
  /** Called when the family roster changes (add/remove) so siblings can refresh. */
  onRosterChanged?: () => void
  /** Linked bank accounts for kid assignment UI (admin Household tab). */
  linkedAccounts?: LinkedAccount[] | null
  memberRolesById?: ReadonlyMap<string, string>
  onLinkedAccountsChanged?: () => void
}

export default function MembersSection({
  onRosterChanged,
  linkedAccounts = null,
  memberRolesById = new Map(),
  onLinkedAccountsChanged,
}: MembersSectionProps) {
  const auth = useAuth()
  const selfMemberId =
    auth.status === 'signedIn' ? auth.member?.id ?? null : null

  const [members, setMembers] = useState<Member[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<HouseholdMemberRole>('member')
  const [creating, setCreating] = useState(false)

  /** The member whose sheet is open (by id, so roster reloads stay in sync). */
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')

  const [pinTarget, setPinTarget] = useState<Member | null>(null)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [savingPin, setSavingPin] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)
  const [removing, setRemoving] = useState(false)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    try {
      await withAuthLockRetry(async () => {
        const { data, error } = await supabase
          .from('family_members')
          .select(
            'id, name, role, is_account_owner, avatar_url, pin_locked, pin_set_at, pin_failed_attempts, created_at, family_id, user_id',
          )
          .order('created_at', { ascending: true })
        if (error) throw new Error(error.message)
        setMembers(data ?? [])
      })
      setLoadError(null)
    } catch (e) {
      setLoadError(formatLoadErrorMessage(e, 'Could not load household members.'))
    }
  }, [])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  async function retryLoad() {
    setRetrying(true)
    try {
      await loadMembers()
    } finally {
      setRetrying(false)
    }
  }

  function openAddSheet() {
    setNewName('')
    setNewRole('member')
    setAddOpen(true)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const duplicate = validateMemberNameForFamily(members ?? [], name)
    if (duplicate) {
      toast.error(duplicate)
      return
    }
    const role = newRole
    const familyId =
      auth.status === 'signedIn' ? auth.member?.family_id ?? '' : ''
    const tempId = `pending-${clientRandomId()}`
    // Show the new row right away; the sheet closes so the list is visible.
    setMembers((prev) => [
      ...(prev ?? []),
      {
        id: tempId,
        name,
        role,
        is_account_owner: false,
        avatar_url: null,
        pin_locked: false,
        pin_set_at: null,
        pin_failed_attempts: 0,
        created_at: new Date().toISOString(),
        family_id: familyId,
        user_id: null,
      },
    ])
    setAddOpen(false)
    setCreating(true)
    try {
      await createMember({ name, role })
      toast.success(adminMemberAddedSuccess(name))
      await loadMembers()
      onRosterChanged?.()
    } catch (err) {
      // Roll back the row and reopen the sheet with what was typed.
      setMembers((prev) => prev?.filter((m) => m.id !== tempId) ?? prev)
      setNewName(name)
      setNewRole(role)
      setAddOpen(true)
      toast.error(formatErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  function openMemberSheet(m: Member) {
    setNameDraft(m.name)
    setOpenMemberId(m.id)
  }

  /**
   * Done (or Enter) saves a changed name; Escape or a backdrop tap closes
   * without saving. Blank or unchanged names are a no-op.
   */
  function closeMemberSheet(save: boolean) {
    const m = members?.find((row) => row.id === openMemberId)
    setOpenMemberId(null)
    if (save && m) void commitRename(m, nameDraft)
  }

  function openPinSheet(member: Member) {
    setPinTarget(member)
    setPinValue('')
    setPinError(null)
  }

  function closePinSheet() {
    if (savingPin) return
    setPinTarget(null)
    setPinValue('')
    setPinError(null)
  }

  async function linkDeviceForPinSignIn(familyId: string, memberId: string) {
    const { data } = await supabase
      .from('families')
      .select('join_code')
      .eq('id', familyId)
      .maybeSingle()
    if (!data?.join_code) return
    bindDeviceForPinSignIn(familyId, data.join_code, memberId)
  }

  async function onSavePin(e: FormEvent) {
    e.preventDefault()
    if (!pinTarget) return
    if (!/^\d{4}$/.test(pinValue)) {
      setPinError('PIN must be exactly 4 digits.')
      return
    }
    const isSelf = pinTarget.id === selfMemberId
    setSavingPin(true)
    setPinError(null)
    try {
      await setMemberPin(pinTarget.id, pinValue, {
        signOutOtherDevices: isSelf,
      })
      if (isSelf) {
        await linkDeviceForPinSignIn(pinTarget.family_id, pinTarget.id)
      }
      toast.success(adminPinSaveSuccess(pinTarget.name, isSelf))
      setPinTarget(null)
      setPinValue('')
      const pinNow = new Date().toISOString()
      setMembers((prev) =>
        prev
          ? prev.map((m) =>
              m.id === pinTarget.id
                ? {
                    ...m,
                    pin_set_at: pinNow,
                    pin_locked: false,
                    pin_failed_attempts: 0,
                  }
                : m,
            )
          : prev,
      )
      setRefreshing(true)
      try {
        await loadMembers()
      } finally {
        setRefreshing(false)
      }
    } catch (err) {
      setPinError(formatErrorMessage(err))
    } finally {
      setSavingPin(false)
    }
  }

  function openRemoveConfirm(m: Member) {
    if (m.is_account_owner) return
    setRemoveError(null)
    setRemoveTarget(m)
  }

  function closeRemoveConfirm() {
    if (removing) return
    setRemoveTarget(null)
    setRemoveError(null)
  }

  async function confirmRemove() {
    const m = removeTarget
    if (!m || m.is_account_owner) return

    const snapshot = members
    setRemoving(true)
    setRemoveError(null)
    if (pinTarget?.id === m.id) {
      setPinTarget(null)
      setPinValue('')
    }
    setMembers((prev) => (prev ? prev.filter((x) => x.id !== m.id) : prev))
    setRefreshing(true)
    try {
      await removeMember(m.id)
      toast.success(adminMemberRemovedSuccess(m.name))
      setRemoveTarget(null)
      setOpenMemberId(null)
      await loadMembers()
      onRosterChanged?.()
    } catch (err) {
      setMembers(snapshot)
      setRemoveError(formatErrorMessage(err))
    } finally {
      setRemoving(false)
      setRefreshing(false)
    }
  }

  async function onClearLockout(m: Member) {
    if (unlockingId) return
    setUnlockingId(m.id)
    try {
      await clearPinLockout(m.id)
      toast.success(adminMemberLockoutClearedSuccess(m.name))
      setMembers((prev) =>
        prev
          ? prev.map((row) =>
              row.id === m.id
                ? { ...row, pin_locked: false, pin_failed_attempts: 0 }
                : row,
            )
          : prev,
      )
      setRefreshing(true)
      try {
        await loadMembers()
      } finally {
        setRefreshing(false)
      }
    } catch (err) {
      toast.error(formatErrorMessage(err))
    } finally {
      setUnlockingId(null)
    }
  }

  async function commitRename(m: Member, value: string) {
    const next = value.trim()
    if (!next || next === m.name) return
    const duplicate = validateMemberNameForFamily(members ?? [], next, {
      exceptMemberId: m.id,
    })
    if (duplicate) {
      toast.error(duplicate)
      return
    }
    const snapshot = members
    setMembers((prev) =>
      prev
        ? prev.map((row) => (row.id === m.id ? { ...row, name: next } : row))
        : prev,
    )
    setRefreshing(true)
    try {
      const { error } = await supabase
        .from('family_members')
        .update({ name: next })
        .eq('id', m.id)
      if (error) throw new Error(humaniseMemberWriteError(error))
      await loadMembers()
      onRosterChanged?.()
      if (m.id === selfMemberId) {
        await auth.refreshMember()
      }
    } catch (err) {
      setMembers(snapshot)
      toast.error(formatErrorMessage(err))
    } finally {
      setRefreshing(false)
    }
  }

  const sectionBusy = refreshing && pinTarget === null && openMemberId === null
  const openMember = members?.find((m) => m.id === openMemberId) ?? null

  function kidHasLinkedAccount(m: Member): boolean {
    return (
      m.role === 'child' &&
      linkedAccounts != null &&
      linkedAccounts.some(
        (a) =>
          isLinkedAccount(a) &&
          accountAssignmentChildId(a, memberRolesById) === m.id,
      )
    )
  }

  function statusLine(m: Member): string {
    return adminMemberStatusLine({
      role: m.role,
      isAccountOwner: m.is_account_owner,
      pinSet: Boolean(m.pin_set_at),
      pinLocked: m.pin_locked,
      failedAttempts: m.pin_failed_attempts,
      kidLinked: m.role === 'child' ? kidHasLinkedAccount(m) : null,
    })
  }

  return (
    <BusyOverlay busy={sectionBusy} label="Saving…">
    <section aria-label="Household members" className="space-y-3">
      <h2 className="text-base font-semibold">{ADMIN_HOUSEHOLD_MEMBERS_TITLE}</h2>

      {loadError && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void retryLoad()}
            disabled={retrying}
            className="mt-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100 ring-1 ring-red-500/40 hover:bg-red-500/30"
          >
            {retrying ? 'Trying…' : 'Try again'}
          </button>
        </div>
      )}

      {members === null ? (
        <ListSkeleton label={ADMIN_LOADING_MEMBERS} rows={3} />
      ) : (
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => openMemberSheet(m)}
                // Not tappable until the server confirms a just-added member.
                disabled={m.id.startsWith('pending-')}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-zinc-800/50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-300">
                    {m.name}
                  </span>
                  <span
                    className={
                      'block truncate text-xs ' +
                      (m.pin_locked ? 'text-amber-200/90' : 'text-zinc-500')
                    }
                  >
                    {statusLine(m)}
                  </span>
                </span>
                <Chevron />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={openAddSheet}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-emerald-400 transition hover:bg-zinc-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400"
            >
              <span aria-hidden="true" className="text-base leading-none">+</span>
              {ADMIN_ADD_MEMBER_LABEL}
            </button>
          </li>
        </ul>
      )}

      <Sheet
        open={addOpen}
        onClose={() => {
          if (!creating) setAddOpen(false)
        }}
        aria-label={ADMIN_ADD_MEMBER_LABEL}
      >
        <SheetHeader
          title={ADMIN_ADD_MEMBER_LABEL}
          onClose={() => setAddOpen(false)}
        />
        <form onSubmit={onCreate} className="space-y-4">
          <label className="block">
            <FieldLabel spacing="tight">Name</FieldLabel>
            <ClearableInput
              wrapperClassName="mt-1 block w-full"
              autoFocus
              value={newName}
              onValueChange={setNewName}
              placeholder="Jamie"
              inputClassName={fieldInputClassName}
            />
          </label>
          <div>
            <SegmentedTabs
              value={newRole}
              options={ROLE_OPTIONS}
              onChange={setNewRole}
              ariaLabel={ADMIN_MEMBER_ROLE_TABS_LABEL}
            />
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {adminRoleAddHint(newRole)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              disabled={creating}
              className="flex-1 rounded-lg py-2.5 text-sm font-medium text-zinc-300 ring-1 ring-inset ring-zinc-700 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="flex-1 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {creating ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </Sheet>

      {openMember ? (
        <Sheet
          open
          onClose={() => closeMemberSheet(false)}
          aria-label={openMember.name}
        >
          <SheetHeader onClose={() => closeMemberSheet(false)}>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-zinc-200">
                {openMember.name}
              </h2>
              <p
                className={
                  'text-xs ' +
                  (openMember.pin_locked ? 'text-amber-200/90' : 'text-zinc-500')
                }
              >
                {statusLine(openMember)}
              </p>
            </div>
          </SheetHeader>
          <div className="space-y-4">

            <label className="block">
              <FieldLabel spacing="tight">Name</FieldLabel>
              <ClearableInput
                wrapperClassName="mt-1 block w-full"
                value={nameDraft}
                aria-label={`Rename ${openMember.name}`}
                onValueChange={setNameDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') closeMemberSheet(true)
                }}
                inputClassName={fieldInputClassName}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {/* Only the owner changes the owner's PIN (set-pin enforces it too). */}
              {!openMember.is_account_owner || openMember.id === selfMemberId ? (
                <button
                  type="button"
                  onClick={() => openPinSheet(openMember)}
                  className={sheetActionClassName}
                >
                  {openMember.pin_set_at ? 'Reset PIN' : 'Set PIN'}
                </button>
              ) : null}
              {openMember.pin_locked ? (
                <button
                  type="button"
                  onClick={() => void onClearLockout(openMember)}
                  disabled={unlockingId === openMember.id}
                  className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-200 disabled:opacity-60"
                >
                  {unlockingId === openMember.id ? 'Unlocking…' : 'Unlock'}
                </button>
              ) : null}
            </div>

            {openMember.role === 'child' && linkedAccounts != null ? (
              <KidAccountAssignment
                kidId={openMember.id}
                kidName={openMember.name}
                accounts={linkedAccounts}
                memberRolesById={memberRolesById}
                onAccountsChanged={() => onLinkedAccountsChanged?.()}
                onError={(msg) => toast.error(msg)}
              />
            ) : null}

            <div className="flex gap-2 border-t border-zinc-800 pt-4">
              {!openMember.is_account_owner && openMember.id !== selfMemberId ? (
                <button
                  type="button"
                  onClick={() => openRemoveConfirm(openMember)}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-red-300 ring-1 ring-inset ring-red-500/30 transition hover:bg-red-500/10"
                >
                  Remove
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => closeMemberSheet(true)}
                className="flex-1 rounded-lg bg-zinc-800 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-700"
              >
                Done
              </button>
            </div>
          </div>
        </Sheet>
      ) : null}

      {removeTarget && (
        <ConfirmSheet
          title={adminRemoveMemberSheetTitle(removeTarget.name)}
          body={adminRemoveMemberSheetBody(removeTarget.name, removeTarget.role)}
          confirmLabel={`Remove ${removeTarget.name}`}
          busyLabel="Removing…"
          busy={removing}
          error={removeError}
          onConfirm={() => void confirmRemove()}
          onClose={closeRemoveConfirm}
        />
      )}

      {pinTarget && (
        <Sheet
          open={pinTarget !== null}
          onClose={closePinSheet}
          aria-label={
            pinTarget.id === selfMemberId
              ? 'Set your PIN'
              : `Set PIN for ${pinTarget.name}`
          }
        >
          <form
            onSubmit={onSavePin}
            autoComplete="off"
            {...{ [APP_FORM_DATA_ATTR]: 'admin-set-pin' }}
          >
            <SheetHeader onClose={closePinSheet} disabled={savingPin}>
              <div className="min-w-0">
                <h2 id="pin-dialog-title" className="text-lg font-semibold text-zinc-300">
                  {adminPinSheetTitle(pinTarget.name, pinTarget.id === selfMemberId)}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {adminPinSheetBody(pinTarget.name, pinTarget.id === selfMemberId)}
                </p>
              </div>
            </SheetHeader>
            {pinError ? (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30"
              >
                {pinError}
              </p>
            ) : null}
            <PinInput
              autoFocus
              aria-label={`4-digit PIN for ${pinTarget.name}`}
              value={pinValue}
              onChange={setPinValue}
              className="mt-4 block w-full rounded-lg bg-zinc-950 px-3 py-3 text-center text-2xl tracking-[0.5em] text-zinc-300 ring-1 ring-zinc-700"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closePinSheet}
                disabled={savingPin}
                className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPin || pinValue.length !== 4}
                className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {savingPin ? 'Saving…' : 'Save PIN'}
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </section>
    </BusyOverlay>
  )
}
