import {
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  HISTORY_NOTE_ADD,
  HISTORY_NOTE_CLEAR,
  HISTORY_NOTE_EDIT,
  HISTORY_NOTE_SAVED,
  HISTORY_NOTE_SHEET_TITLE_ADD,
  HISTORY_NOTE_SHEET_TITLE_EDIT,
  TRANSACTION_NOTE_FIELD_LABEL,
  TRANSACTION_NOTE_PLACEHOLDER,
} from '@/lib/brand'
import { ClearableInput } from '@/components/ui/ClearableInput'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Sheet } from '@/components/ui/Sheet'
import { useHideAmounts } from '@/lib/HideAmountsProvider'
import { scrollFocusedIntoView } from '@/lib/keyboardViewport'
import { updateTransactionNote } from '@/lib/transactions'
import { toast } from '@/lib/toast'
import type { HistoryDisplayRow } from '@/features/history/historyQueries'
import { useHistoryRowExpandAnimation } from '@/features/history/useHistoryRowExpandAnimation'
import {
  bucketEndpointLabel,
  historyBucketMoveSubtitle,
  historyGiveActor,
  historyGiveSubtitle,
  historyShowBucketMoveActor,
  historyShowGiveActor,
  historyTakeSubtitle,
  isParentTakeFromChild,
  giveMemberEndpointLabel,
} from '@/lib/historyLabels'
import { HistoryEntityTransfer } from '@/features/history/HistoryEntityTransfer'
import { historyBalanceSides } from '@/lib/historyBalanceSides'
import { historyTransactionNoteDisplay } from '@/lib/historyTransactionNote'

export type TxRow = HistoryDisplayRow

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
})

export function HistoryRowShell({
  justArrived,
  selectMode,
  selected,
  onToggleSelect,
  children,
}: {
  justArrived: boolean
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
  children: ReactNode
}) {
  const shellRef = useRef<HTMLLIElement>(null)
  useHistoryRowExpandAnimation(shellRef, justArrived)

  return (
    <li ref={shellRef}>
      <div className="min-h-0 overflow-hidden">
        <div
          onClick={selectMode ? onToggleSelect : undefined}
          onKeyDown={
            selectMode
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onToggleSelect()
                  }
                }
              : undefined
          }
          role={selectMode ? 'checkbox' : undefined}
          aria-checked={selectMode ? selected : undefined}
          aria-label={
            selectMode
              ? selected
                ? 'Deselect transaction'
                : 'Select transaction'
              : undefined
          }
          tabIndex={selectMode ? 0 : undefined}
          className={
            // Border (not ring): the row's overflow-hidden wrapper clips the
            // outer pixel of a box-shadow ring.
            // In select mode the border itself is the selection affordance —
            // dashed while unselected, solid emerald when selected — so no
            // checkbox is needed and the layout never shifts.
            'rounded-2xl border px-3 py-3 transition ' +
            (selectMode ? 'cursor-pointer ' : '') +
            (selected
              ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
              : selectMode
                ? 'border-dashed border-zinc-600 bg-zinc-900'
                : 'border-zinc-800 bg-zinc-900')
          }
        >
          {children}
        </div>
      </div>
    </li>
  )
}

export function TxItem({
  row,
  currentMemberId,
  viewerRole,
  onNoteUpdated,
  selectMode,
}: {
  row: TxRow
  currentMemberId: string
  viewerRole: string
  onNoteUpdated: (transactionId: string, note: string | null) => void
  selectMode: boolean
}) {
  const { formatMoney } = useHideAmounts()
  const [noteExpanded, setNoteExpanded] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [draftNote, setDraftNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const time = timeFormatter.format(new Date(row.created_at))
  const showBucketMoveActor = historyShowBucketMoveActor(viewerRole)
  const showSendActor = historyShowGiveActor({
    viewerRole,
    currentMemberId,
    row,
  })

  let title: string
  let subtitle: string
  let fromLabel: string
  let toLabel: string
  let actorMemberId: string | null
  let actorName: string | null | undefined

  if (row.type === 'bucket_move') {
    fromLabel = bucketEndpointLabel({
      bucketId: row.from_bucket_id,
      snapshotName: row.from_bucket_name,
      joinedName: row.from_bucket?.name,
    })
    toLabel = bucketEndpointLabel({
      bucketId: row.to_bucket_id,
      snapshotName: row.to_bucket_name,
      joinedName: row.to_bucket?.name,
    })
    title = `${fromLabel} → ${toLabel}`
    actorMemberId = row.from_member_id
    actorName = row.from_member?.name
    subtitle = historyBucketMoveSubtitle({
      time,
      actorMemberId,
      actorName,
      currentMemberId,
      showActor: showBucketMoveActor,
      autoOrganizeRunTrigger: row.auto_organize_run_trigger,
    })
  } else {
    const fromIsMe = row.from_member_id === currentMemberId
    const toIsMe = row.to_member_id === currentMemberId
    fromLabel = giveMemberEndpointLabel({
      snapshotName: row.from_member_name,
      joinedName: row.from_member?.name,
      isMe: fromIsMe,
    })
    toLabel = giveMemberEndpointLabel({
      snapshotName: row.to_member_name,
      joinedName: row.to_member?.name,
      isMe: toIsMe,
    })
    title = `${fromLabel} → ${toLabel}`
    const { actorMemberId: sendActorId, actorName: sendActorName } =
      historyGiveActor({ row })
    actorMemberId = sendActorId
    actorName = sendActorName
    const subtitleArgs = {
      time,
      actorMemberId,
      actorName,
      currentMemberId,
      showActor: showSendActor,
    }
    subtitle = isParentTakeFromChild(row)
      ? historyTakeSubtitle(subtitleArgs)
      : historyGiveSubtitle(subtitleArgs)
  }

  const amountValue = Number(row.amount)
  const balanceSides = historyBalanceSides(row, {
    fromLabel,
    toLabel,
    amount: amountValue,
    currentMemberId,
    viewerRole,
  })
  const showTwoSidedBalance = balanceSides.length >= 2

  const sheetTitle = row.note
    ? HISTORY_NOTE_SHEET_TITLE_EDIT
    : HISTORY_NOTE_SHEET_TITLE_ADD

  function closeNoteEditor() {
    if (savingNote) return
    setEditingNote(false)
    setNoteError(null)
  }

  function openNoteEditor() {
    setDraftNote(row.note ?? '')
    setNoteError(null)
    setEditingNote(true)
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault()
    setSavingNote(true)
    setNoteError(null)
    try {
      const trimmed = draftNote.trim()
      const next = trimmed === '' ? null : trimmed
      await updateTransactionNote(row.id, next)
      onNoteUpdated(row.id, next)
      setEditingNote(false)
      setNoteExpanded(Boolean(next))
      toast.success(HISTORY_NOTE_SAVED)
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Could not save note')
    } finally {
      setSavingNote(false)
    }
  }

  const displayedNote = historyTransactionNoteDisplay({
    type: row.type,
    note: row.note,
    from_bucket_id: row.from_bucket_id,
    to_bucket_id: row.to_bucket_id,
    auto_organize_run_id: row.auto_organize_run_id,
    auto_organize_kind: row.auto_organize_kind,
  })

  const noteQuote = displayedNote ? (
    <button
      type="button"
      onClick={() => setNoteExpanded((v) => !v)}
      aria-expanded={noteExpanded}
      aria-label={noteExpanded ? 'Collapse note' : 'Expand note'}
      tabIndex={selectMode ? -1 : undefined}
      className={
        'block w-full text-left text-xs italic leading-snug text-zinc-400 transition hover:text-zinc-300 focus:outline-none focus-visible:text-zinc-300 ' +
        // In select mode the whole row toggles selection — the note is inert
        // so taps fall through to the row instead of being swallowed.
        (selectMode ? 'pointer-events-none ' : '') +
        (noteExpanded ? 'whitespace-pre-wrap break-words' : 'truncate')
      }
    >
      “{displayedNote}”
    </button>
  ) : null

  const noteFooter = (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <button
          type="button"
          onClick={openNoteEditor}
          tabIndex={selectMode ? -1 : undefined}
          className={
            'text-xs text-zinc-500 hover:text-zinc-300' +
            // In select mode the whole row toggles selection — inert here
            // so taps fall through to the row instead of being swallowed.
            (selectMode ? ' pointer-events-none' : '')
          }
        >
          {row.note || displayedNote ? HISTORY_NOTE_EDIT : HISTORY_NOTE_ADD}
        </button>
      </div>
      <p className="shrink-0 text-xs text-zinc-500">{subtitle}</p>
    </div>
  )

  return (
    <>
      <div className="min-w-0">
        {showTwoSidedBalance ? null : (
          <p className="truncate text-sm font-medium text-zinc-300">{title}</p>
        )}
        <HistoryEntityTransfer
          sides={balanceSides}
          amount={amountValue}
          formatMoney={formatMoney}
        />
        <div className="mt-5 flex flex-col gap-1">
          {noteQuote}
          {noteFooter}
        </div>
      </div>

      <Sheet
        open={editingNote}
        onClose={closeNoteEditor}
        aria-label={sheetTitle}
      >
        <form onSubmit={saveNote} className="space-y-4">
          <header className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-zinc-300">{sheetTitle}</h2>
            <button
              type="button"
              onClick={closeNoteEditor}
              disabled={savingNote}
              className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <label className="block">
            <FieldLabel optional>{TRANSACTION_NOTE_FIELD_LABEL}</FieldLabel>
            <ClearableInput
              type="text"
              maxLength={280}
              value={draftNote}
              onValueChange={setDraftNote}
              onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
              placeholder={TRANSACTION_NOTE_PLACEHOLDER}
              autoFocus
              disabled={savingNote}
              clearAriaLabel={HISTORY_NOTE_CLEAR}
              inputClassName="w-full rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-emerald-400"
            />
          </label>

          {noteError && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30"
            >
              {noteError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeNoteEditor}
              disabled={savingNote}
              className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingNote}
              className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {savingNote ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Sheet>
    </>
  )
}
