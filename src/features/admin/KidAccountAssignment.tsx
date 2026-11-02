import { useState } from 'react'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { FieldLabel } from '@/components/ui/FieldLabel'
import {
  ADMIN_KID_ADD_LINKED_ACCOUNT_LABEL,
  ADMIN_KID_LINKED_ACCOUNTS_LABEL,
  ADMIN_KID_LINKED_ACCOUNT_NONE_AVAILABLE,
  ADMIN_KID_NO_LINKED_ACCOUNTS_HINT,
  adminAssignAccountToKidConfirm,
  adminAssignAccountToKidSheetBody,
  adminAssignAccountToKidSheetTitle,
  adminUnassignLinkedAccountAria,
} from '@/lib/brand'
import {
  accountAssignmentChildId,
  assignAccountOwner,
  isCreditCardAccount,
  isLinkedAccount,
} from '@/lib/accounts'
import type { Database } from '@/types/database'

type Account = Database['public']['Tables']['accounts']['Row']

type PendingAssign = {
  accountId: string
  accountLabel: string
}

type KidAccountAssignmentProps = {
  kidId: string
  kidName: string
  accounts: Account[]
  memberRolesById: ReadonlyMap<string, string>
  onAccountsChanged: () => void
  onError: (message: string) => void
}

function accountRowLabel(account: Account): string {
  return account.account_name ?? account.institution_name ?? 'Account'
}

export default function KidAccountAssignment({
  kidId,
  kidName,
  accounts,
  memberRolesById,
  onAccountsChanged,
  onError,
}: KidAccountAssignmentProps) {
  const [saving, setSaving] = useState(false)
  const [pendingAssign, setPendingAssign] = useState<PendingAssign | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // Credit cards stay on the household balance — never assignable to a kid
  // (the accounts trigger enforces the same rule at the database layer).
  const linkedAccountsPool = accounts.filter(
    (a) => isLinkedAccount(a) && !isCreditCardAccount(a),
  )
  const assigned = linkedAccountsPool.filter(
    (a) => accountAssignmentChildId(a, memberRolesById) === kidId,
  )
  const assignablePool = linkedAccountsPool.filter((a) => {
    const childId = accountAssignmentChildId(a, memberRolesById)
    return childId === null
  })

  async function unassignAccount(accountId: string) {
    setSaving(true)
    try {
      await assignAccountOwner(accountId, null)
      onAccountsChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function confirmAssign() {
    if (!pendingAssign) return
    setSaving(true)
    setConfirmError(null)
    try {
      await assignAccountOwner(pendingAssign.accountId, kidId)
      setPendingAssign(null)
      onAccountsChanged()
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function onPickAccount(accountId: string) {
    const account = linkedAccountsPool.find((a) => a.id === accountId)
    if (!account) return
    setConfirmError(null)
    setPendingAssign({
      accountId: account.id,
      accountLabel: accountRowLabel(account),
    })
  }

  if (linkedAccountsPool.length === 0) {
    return (
      <p className="mt-2 text-xs text-zinc-500">
        No linked accounts yet. Link a bank in Money sources first.
      </p>
    )
  }

  return (
    <>
      <div className="mt-2 space-y-1.5">
        <FieldLabel spacing="tight" compact>
          {ADMIN_KID_LINKED_ACCOUNTS_LABEL}
        </FieldLabel>

        {assigned.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {assigned.map((account) => {
              const label = accountRowLabel(account)
              return (
                <li key={account.id} className="max-w-full">
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-950/80 py-1 pl-2.5 pr-1 text-xs text-zinc-300 ring-1 ring-inset ring-zinc-700">
                    <span className="min-w-0 truncate">{label}</span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void unassignAccount(account.id)}
                      aria-label={adminUnassignLinkedAccountAria(label, kidName)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                        className="h-3 w-3"
                      >
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-zinc-500">{ADMIN_KID_NO_LINKED_ACCOUNTS_HINT}</p>
        )}

        {assignablePool.length > 0 ? (
          <label className="flex flex-col gap-1">
            <FieldLabel spacing="tight" compact>
              {ADMIN_KID_ADD_LINKED_ACCOUNT_LABEL}
            </FieldLabel>
            <select
              value=""
              disabled={saving}
              onChange={(e) => {
                const id = e.target.value
                if (id) onPickAccount(id)
              }}
              className="rounded-lg border-0 bg-zinc-950 py-1.5 pl-2 pr-7 text-xs text-zinc-300 ring-1 ring-inset ring-zinc-700 focus:outline focus:outline-2 focus:outline-emerald-400 disabled:opacity-50"
            >
              <option value="">Choose an account…</option>
              {assignablePool.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountRowLabel(account)}
                </option>
              ))}
            </select>
          </label>
        ) : assigned.length === 0 ? (
          <p className="text-xs text-zinc-500">
            {ADMIN_KID_LINKED_ACCOUNT_NONE_AVAILABLE}
          </p>
        ) : null}
      </div>

      {pendingAssign ? (
        <AssignConfirmSheet
          kidName={kidName}
          pendingAssign={pendingAssign}
          saving={saving}
          confirmError={confirmError}
          onClose={() => {
            if (saving) return
            setPendingAssign(null)
            setConfirmError(null)
          }}
          onConfirm={() => void confirmAssign()}
        />
      ) : null}
    </>
  )
}

function AssignConfirmSheet({
  kidName,
  pendingAssign,
  saving,
  confirmError,
  onClose,
  onConfirm,
}: {
  kidName: string
  pendingAssign: PendingAssign
  saving: boolean
  confirmError: string | null
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <ConfirmSheet
      title={adminAssignAccountToKidSheetTitle(kidName, pendingAssign.accountLabel)}
      body={adminAssignAccountToKidSheetBody(kidName)}
      confirmLabel={adminAssignAccountToKidConfirm(kidName)}
      busyLabel="Assigning…"
      busy={saving}
      error={confirmError}
      tone="caution"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  )
}
