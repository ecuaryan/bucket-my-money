import { useState } from 'react'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { FieldLabel } from '@/components/ui/FieldLabel'
import {
  adminAssignAccountToKidConfirm,
  adminAssignAccountToKidSheetBody,
  adminAssignAccountToKidSheetTitle,
  HOUSEHOLD_BALANCE_LABEL,
} from '@/lib/brand'
import { assignAccountOwner } from '@/lib/accounts'

export type ChildMemberOption = {
  id: string
  name: string
}

type PendingKidAssign = {
  kidId: string
  kidName: string
}

type AccountAssignmentSelectProps = {
  accountId: string
  /** null = household (shared balance); otherwise a kid member id. */
  assignedChildId: string | null
  children: ChildMemberOption[]
  onAssigned: (ownerMemberId: string | null) => void
  onError: (message: string) => void
}

export default function AccountAssignmentSelect({
  accountId,
  assignedChildId,
  children,
  onAssigned,
  onError,
}: AccountAssignmentSelectProps) {
  const [saving, setSaving] = useState(false)
  const [pendingKid, setPendingKid] = useState<PendingKidAssign | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  async function applyAssign(ownerMemberId: string | null) {
    setSaving(true)
    try {
      await assignAccountOwner(accountId, ownerMemberId)
      onAssigned(ownerMemberId)
      setPendingKid(null)
      setConfirmError(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (ownerMemberId === null) {
        onError(message)
      } else {
        setConfirmError(message)
      }
    } finally {
      setSaving(false)
    }
  }

  function onSelectChange(nextChildId: string) {
    const ownerMemberId = nextChildId === '' ? null : nextChildId
    if (ownerMemberId === assignedChildId) return

    if (ownerMemberId === null) {
      void applyAssign(null)
      return
    }

    const kid = children.find((c) => c.id === ownerMemberId)
    if (!kid) return

    setConfirmError(null)
    setPendingKid({ kidId: kid.id, kidName: kid.name })
  }

  function closeKidConfirm() {
    if (saving) return
    setPendingKid(null)
    setConfirmError(null)
  }

  async function confirmKidAssign() {
    if (!pendingKid) return
    await applyAssign(pendingKid.kidId)
  }

  if (children.length === 0) {
    return (
      <span className="text-xs text-zinc-500">
        {assignedChildId ? 'Assigned' : HOUSEHOLD_BALANCE_LABEL}
      </span>
    )
  }

  return (
    <>
      <label className="flex shrink-0 flex-col items-end gap-0.5">
        <FieldLabel spacing="tight" compact>
          Assigned to
        </FieldLabel>
        <select
          value={assignedChildId ?? ''}
          disabled={saving}
          onChange={(e) => onSelectChange(e.target.value)}
          className="max-w-[9rem] rounded-lg border-0 bg-zinc-950 py-1.5 pl-2 pr-7 text-xs text-zinc-300 ring-1 ring-inset ring-zinc-700 focus:outline focus:outline-2 focus:outline-emerald-400 disabled:opacity-50"
          aria-label={`Assign account to ${HOUSEHOLD_BALANCE_LABEL.toLowerCase()} or kid`}
        >
          <option value="">{HOUSEHOLD_BALANCE_LABEL}</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {pendingKid ? (
        <ConfirmSheet
          title={adminAssignAccountToKidSheetTitle(pendingKid.kidName)}
          body={adminAssignAccountToKidSheetBody(pendingKid.kidName)}
          confirmLabel={adminAssignAccountToKidConfirm(pendingKid.kidName)}
          busyLabel="Assigning…"
          busy={saving}
          error={confirmError}
          tone="caution"
          onConfirm={() => void confirmKidAssign()}
          onClose={closeKidConfirm}
        />
      ) : null}
    </>
  )
}
