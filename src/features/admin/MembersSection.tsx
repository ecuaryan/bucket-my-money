import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth'
import { formatLoadErrorMessage, withAuthLockRetry } from '@/lib/authLockError'
import { formatErrorMessage } from '@/lib/errorMessage'
import { supabase } from '@/lib/supabase'
import { ClearableInput } from '@/components/ui/ClearableInput'
import { FieldLabel } from '@/components/ui/FieldLabel'
import PinInput from '@/components/ui/PinInput'
import { Sheet } from '@/components/ui/Sheet'
import { BusyOverlay } from '@/components/ui/BusyOverlay'
import { LoadingStatus } from '@/components/ui/LoadingStatus'
import {
  ADMIN_HOUSEHOLD_MEMBERS_INTRO,
  ADMIN_HOUSEHOLD_MEMBERS_TITLE,
  ADMIN_HOUSEHOLD_ROLES_HELP,
  ADMIN_HOUSEHOLD_ROLES_HELP_TOGGLE,
  ADMIN_LOADING_MEMBERS,
  ADMIN_PIN_SETUP_CTA_ACTION,
  ADMIN_PIN_SETUP_CTA_BODY,
  ADMIN_PIN_SETUP_CTA_TITLE,
  ADMIN_ROLE_PIN_RESET_NOTE,
  APP_FORM_DATA_ATTR,
  ADMIN_REMOVE_SHARED_EFFECT_LOGIN,
  ADMIN_REMOVE_ADMIN_EFFECT_ACCESS,
  ADMIN_REMOVE_ADMIN_EFFECT_LOGIN,
  ADMIN_REMOVE_KID_EFFECT_ACCOUNTS,
  ADMIN_REMOVE_KID_EFFECT_BUCKETS,
  ADMIN_REMOVE_MEMBER_EFFECT_READD,
  ADMIN_REMOVE_MEMBER_EFFECT_SIGN_OUT,
  ADMIN_REMOVE_MEMBER_SHEET_INTRO,
  ADMIN_REMOVE_MEMBER_WHAT_HAPPENS,
  adminMemberAddedSuccess,
  adminMemberLockoutClearedSuccess,
  adminMemberRemovedSuccess,
  adminPinSaveSuccess,
  adminRemoveMemberSheetTitle,
  adminPinSheetBody,
  adminPinSheetTitle,
  adminRoleAddHint,
} from '@/lib/brand'
import { bindDeviceForPinSignIn } from '@/lib/familyDevice'
import {
  roleLabel,
  ACCOUNT_OWNER_LABEL,
} from '@/lib/memberRoles'
import {
  clearPinLockout,
  createMember,
  removeMember,
  setMemberPin,
} from '@/lib/memberAuth'
import { clientRandomId } from '@/lib/clientRandomId'
import {
  humaniseMemberWriteError,
  validateMemberNameForFamily,
} from '@/lib/memberName'
import { toast } from '@/lib/toast'
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
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'member' | 'child'>('member')
  const [creating, setCreating] = useState(false)

  const [pinTarget, setPinTarget] = useState<Member | null>(null)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [savingPin, setSavingPin] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [rolesHelpOpen, setRolesHelpOpen] = useState(false)

  const loadMembers = useCallback(async () => {
    setLoadError(null)
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
    } catch (e) {
      setLoadError(formatLoadErrorMessage(e, 'Could not load household members.'))
    }
  }, [])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const duplicate = validateMemberNameForFamily(members ?? [], name)
    if (duplicate) {
      toast.error(duplicate)
      return
    }
    const familyId =
      auth.status === 'signedIn' ? auth.member?.family_id ?? '' : ''
    const tempId = `pending-${clientRandomId()}`
    const optimistic: Member = {
      id: tempId,
      name,
      role: newRole,
      is_account_owner: false,
      avatar_url: null,
      pin_locked: false,
      pin_set_at: null,
      pin_failed_attempts: 0,
      created_at: new Date().toISOString(),
      family_id: familyId,
      user_id: null,
    }
    setMembers((prev) => [...(prev ?? []), optimistic])
    setNewName('')
    setCreating(true)
    setRefreshing(true)
    try {
      const created = await createMember({ name, role: newRole })
      setMembers((prev) =>
        prev
          ? prev.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    id: created.id,
                    name: created.name,
                    role: created.role,
                  }
                : m,
            )
          : prev,
      )
      toast.success(adminMemberAddedSuccess(name))
      await loadMembers()
      onRosterChanged?.()
    } catch (err) {
      // Roll back the optimistic row, and restore the typed name (cleared
      // optimistically above) so a transient failure doesn't force a retype —
      // the user can just hit Add again. Keep whatever's in the field if they
      // already started typing the next name.
      setMembers((prev) => prev?.filter((m) => m.id !== tempId) ?? prev)
      setNewName((current) => (current.trim() ? current : name))
      toast.error(formatErrorMessage(err))
    } finally {
      setCreating(false)
      setRefreshing(false)
    }
  }

  function openPinSheet(member: Member) {
    setPinTarget(member)
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
    }
  }

  function startRename(m: Member) {
    setRenameValue(m.name)
    setRenamingId(m.id)
  }

  function cancelRename() {
    setRenamingId(null)
    setRenameValue('')
  }

  async function commitRename(m: Member) {
    const next = renameValue.trim()
    if (!next || next === m.name) {
      cancelRename()
      return
    }
    const duplicate = validateMemberNameForFamily(members ?? [], next, {
      exceptMemberId: m.id,
    })
    if (duplicate) {
      toast.error(duplicate)
      cancelRename()
      return
    }
    setRenamingId(null)
    setRenameValue('')
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

  const sectionBusy = creating || (refreshing && pinTarget === null)
  const selfMember =
    selfMemberId && members
      ? members.find((m) => m.id === selfMemberId) ?? null
      : null
  const showPinSetupCta = selfMember != null && !selfMember.pin_set_at

  return (
    <BusyOverlay busy={sectionBusy} label="Saving…">
    <section aria-label="Household members" className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{ADMIN_HOUSEHOLD_MEMBERS_TITLE}</h2>
        <p className="mt-1 text-xs text-zinc-400">
          {ADMIN_HOUSEHOLD_MEMBERS_INTRO}
        </p>
        <button
          type="button"
          aria-expanded={rolesHelpOpen}
          onClick={() => setRolesHelpOpen((open) => !open)}
          className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
        >
          {ADMIN_HOUSEHOLD_ROLES_HELP_TOGGLE}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={
              'h-3.5 w-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-200 ' +
              (rolesHelpOpen ? 'rotate-180' : '')
            }
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {rolesHelpOpen ? (
          <dl className="mt-2 space-y-2 rounded-xl bg-zinc-950/60 px-3 py-2 ring-1 ring-inset ring-zinc-800/60">
            {ADMIN_HOUSEHOLD_ROLES_HELP.map(({ role, label, context }) => (
              <div key={role}>
                <dt className="text-xs font-semibold text-zinc-300">{label}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                  {context}
                </dd>
              </div>
            ))}
            <p className="pt-1 text-xs leading-relaxed text-zinc-500">
              {ADMIN_ROLE_PIN_RESET_NOTE}
            </p>
          </dl>
        ) : null}
      </div>

      {loadError && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void loadMembers()}
            className="mt-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100 ring-1 ring-red-500/40 hover:bg-red-500/30"
          >
            Try again
          </button>
        </div>
      )}
      {showPinSetupCta && (
        <div className="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/30">
          <p className="text-sm font-semibold text-emerald-200">
            {ADMIN_PIN_SETUP_CTA_TITLE}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-200/90">
            {ADMIN_PIN_SETUP_CTA_BODY}
          </p>
          <button
            type="button"
            onClick={() => openPinSheet(selfMember)}
            className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black"
          >
            {ADMIN_PIN_SETUP_CTA_ACTION}
          </button>
        </div>
      )}

      <form
        onSubmit={onCreate}
        className="space-y-3 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-0 flex-1">
            <FieldLabel spacing="tight">Name</FieldLabel>
            <ClearableInput
              wrapperClassName="mt-1 block w-full"
              value={newName}
              onValueChange={setNewName}
              placeholder="Jamie"
              inputClassName="w-full rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700"
            />
          </label>
          <label className="block sm:w-28">
            <FieldLabel spacing="tight">Role</FieldLabel>
            <select
              value={newRole}
              onChange={(e) =>
                setNewRole(e.target.value as 'admin' | 'member' | 'child')
              }
              className="mt-1 block w-full rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700"
            >
              <option value="admin">{roleLabel('admin')}</option>
              <option value="member">{roleLabel('member')}</option>
              <option value="child">{roleLabel('child')}</option>
            </select>
          </label>
          <p className="order-3 text-xs leading-relaxed text-zinc-500 sm:order-4 sm:basis-full">
            {adminRoleAddHint(newRole)}
          </p>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="order-4 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50 sm:order-3 sm:shrink-0"
          >
            {creating ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>

      {members === null ? (
        <LoadingStatus label={ADMIN_LOADING_MEMBERS} className="py-6" />
      ) : (
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
          {members.map((m) => {
            const kidHasLinkedAccount =
              m.role === 'child' &&
              linkedAccounts != null &&
              linkedAccounts.some(
                (a) =>
                  isLinkedAccount(a) &&
                  accountAssignmentChildId(a, memberRolesById) === m.id,
              )

            return (
            <li key={m.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
              {renamingId === m.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ClearableInput
                    wrapperClassName="min-w-0 flex-1"
                    autoFocus
                    type="text"
                    value={renameValue}
                    aria-label={`Rename ${m.name}`}
                    onValueChange={setRenameValue}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename(m)
                      if (e.key === 'Escape') cancelRename()
                    }}
                    onBlur={() => void commitRename(m)}
                    inputClassName="w-full min-w-0 rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-emerald-400 focus:outline focus:outline-2 focus:outline-emerald-400"
                  />
                  <span className="shrink-0 text-xs font-normal text-zinc-500">
                    ({roleLabel(m.role)})
                  </span>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-zinc-300">
                    {m.name}{' '}
                    <span className="text-xs font-normal text-zinc-500">
                      ({roleLabel(m.role)})
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {m.is_account_owner ? `${ACCOUNT_OWNER_LABEL} · ` : ''}
                    {m.pin_set_at ? 'PIN set' : 'No PIN'}
                    {m.pin_locked ? ' · locked' : ''}
                    {m.pin_failed_attempts > 0 && !m.pin_locked
                      ? ` · ${m.pin_failed_attempts} failed attempt${m.pin_failed_attempts === 1 ? '' : 's'}`
                      : ''}
                    {kidHasLinkedAccount ? ' · Linked account' : m.role === 'child' ? ' · No linked account' : ''}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {renamingId !== m.id && (
                  <button
                    type="button"
                    onClick={() => startRename(m)}
                    className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                  >
                    Edit
                  </button>
                )}
                {m.pin_locked && (
                  <button
                    type="button"
                    onClick={() => void onClearLockout(m)}
                    className="rounded-lg border border-amber-500/30 px-2 py-1 text-xs font-semibold text-amber-200"
                  >
                    Unlock
                  </button>
                )}
                {/* Only the owner changes the owner's PIN (set-pin enforces it too). */}
                {(!m.is_account_owner || m.id === selfMemberId) && (
                  <button
                    type="button"
                    onClick={() => openPinSheet(m)}
                    className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                  >
                    {m.pin_set_at ? 'Reset PIN' : 'Set PIN'}
                  </button>
                )}
                {!m.is_account_owner && m.id !== selfMemberId && (
                  <button
                    type="button"
                    onClick={() => openRemoveConfirm(m)}
                    className="rounded-lg border border-red-500/30 px-2 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                )}
              </div>
              </div>
              {m.role === 'child' && linkedAccounts != null ? (
                <KidAccountAssignment
                  kidId={m.id}
                  kidName={m.name}
                  accounts={linkedAccounts}
                  memberRolesById={memberRolesById}
                  onAccountsChanged={() => onLinkedAccountsChanged?.()}
                  onError={(msg) => toast.error(msg)}
                />
              ) : null}
            </li>
            )
          })}
        </ul>
      )}

      {removeTarget && (
        <Sheet
          open={removeTarget !== null}
          onClose={closeRemoveConfirm}
          aria-label={adminRemoveMemberSheetTitle(removeTarget.name)}
        >
          <header className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-zinc-300">
              {adminRemoveMemberSheetTitle(removeTarget.name)}
            </h2>
            <button
              type="button"
              onClick={closeRemoveConfirm}
              disabled={removing}
              className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              <span className="font-medium text-zinc-300">
                {roleLabel(removeTarget.role)}
              </span>
              {' — '}
              {ADMIN_REMOVE_MEMBER_SHEET_INTRO}
            </p>

            <div>
              <h3 className="text-sm font-medium text-zinc-300">
                {ADMIN_REMOVE_MEMBER_WHAT_HAPPENS}
              </h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-400">
                <li>{ADMIN_REMOVE_MEMBER_EFFECT_SIGN_OUT}</li>
                {removeTarget.role === 'child' ? (
                  <>
                    <li>{ADMIN_REMOVE_KID_EFFECT_BUCKETS}</li>
                    <li>{ADMIN_REMOVE_KID_EFFECT_ACCOUNTS}</li>
                  </>
                ) : removeTarget.role === 'admin' ? (
                  <>
                    <li>{ADMIN_REMOVE_ADMIN_EFFECT_ACCESS}</li>
                    <li>{ADMIN_REMOVE_ADMIN_EFFECT_LOGIN}</li>
                  </>
                ) : (
                  <li>{ADMIN_REMOVE_SHARED_EFFECT_LOGIN}</li>
                )}
                <li>{ADMIN_REMOVE_MEMBER_EFFECT_READD}</li>
              </ul>
            </div>

            {removeError ? (
              <p
                role="alert"
                className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30"
              >
                {removeError}
              </p>
            ) : null}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeRemoveConfirm}
                disabled={removing}
                className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmRemove()}
                disabled={removing}
                className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-50"
              >
                {removing ? 'Removing…' : `Remove ${removeTarget.name}`}
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {pinTarget && (
        <Sheet
          open={pinTarget !== null}
          onClose={() => {
            if (savingPin) return
            setPinTarget(null)
            setPinValue('')
            setPinError(null)
          }}
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
            <h3 id="pin-dialog-title" className="text-lg font-semibold text-zinc-300">
              {adminPinSheetTitle(pinTarget.name, pinTarget.id === selfMemberId)}
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              {adminPinSheetBody(pinTarget.name, pinTarget.id === selfMemberId)}
            </p>
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
                onClick={() => {
                  setPinTarget(null)
                  setPinValue('')
                  setPinError(null)
                }}
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
