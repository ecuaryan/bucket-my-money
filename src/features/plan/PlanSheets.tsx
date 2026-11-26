import { useId, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { SheetHeader } from '@/components/ui/SheetHeader'
import { FieldLabel } from '@/components/ui/FieldLabel'
import SwitchToggle from '@/components/ui/SwitchToggle'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import {
  PLAN_ADD_LABEL,
  PLAN_ADD_TITLES,
  PLAN_AMOUNT_LABEL,
  PLAN_BUCKET_LABEL,
  PLAN_BUCKET_NAME_LABEL,
  PLAN_BUCKET_NOTE_LABEL,
  PLAN_COLUMN_LABELS,
  PLAN_COLUMNS_LABEL,
  PLAN_COMPACT_LABEL,
  PLAN_LOCK_LABEL,
  PLAN_DELETE_BUCKET_LINE_BODY,
  PLAN_DELETE_LINE_BODY,
  PLAN_DELETE_LINE_LABEL,
  PLAN_MOVE_DOWN_LABEL,
  PLAN_MOVE_UP_LABEL,
  PLAN_DELETING_LABEL,
  PLAN_EDIT_LINE_TITLE,
  PLAN_GROSS_AMOUNT_LABEL,
  PLAN_INVALID_AMOUNT,
  PLAN_INVALID_PERCENT,
  PLAN_LINK_ACTION,
  PLAN_LINK_BUCKETS_LABEL,
  planLinkConfirmBody,
  PLAN_LINK_EACH_RUN_LABEL,
  PLAN_LINK_EMPTY,
  PLAN_LINK_NONE_LABEL,
  PLAN_LINK_OPEN_LABEL,
  PLAN_LINK_RULE_LABEL,
  PLAN_LINK_SCHEDULE_LABEL,
  PLAN_LINK_TITLE,
  PLAN_LINKING_LABEL,
  PLAN_UNLINK_ACTION,
  PLAN_UNLINK_CONFIRM_BODY,
  planLinkConfirmTitle,
  planUnlinkConfirmTitle,
  PLAN_NAME_LABEL,
  PLAN_NEW_BUCKET_NAME_LABEL,
  PLAN_NEW_BUCKET_OPTION,
  PLAN_NOTE_LABEL,
  PLAN_PAID_BY_LABEL,
  PLAN_PAID_BY_LABELS,
  PLAN_PAID_BY_NONE,
  PLAN_PER_LABEL,
  PLAN_PER_OPTIONS,
  PLAN_SAVE_LABEL,
  PLAN_SAVING_LABEL,
  PLAN_VIEW_LABEL,
  planDeleteLineTitle,
  type PlanPaidBy,
} from '@/lib/brand'
import type { PlanSection, PlanUnit } from '@/lib/planMath'
import { PLAN_COLUMNS, type PlanColumn, type PlanLine, type PlanViewPrefs } from '@/lib/plan'
import { parseCellInput } from './planCells'

const INPUT_CLASS =
  'w-full rounded-lg border-0 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-emerald-400'
const PRIMARY_CLASS =
  'w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50'
const ERROR_CLASS =
  'rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-inset ring-red-500/30'

const PAID_BY_CHOICES: readonly { value: PlanPaidBy | null; label: string }[] = [
  { value: null, label: PLAN_PAID_BY_NONE },
  { value: 'autopay', label: PLAN_PAID_BY_LABELS.autopay },
  { value: 'bill_pay', label: PLAN_PAID_BY_LABELS.bill_pay },
  { value: 'by_hand', label: PLAN_PAID_BY_LABELS.by_hand },
]

/** A single-choice row of pill buttons (Per, Paid by). */
function ChoiceChips<T>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string
  choices: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-zinc-300">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => {
          const selected = choice.value === value
          return (
            <button
              key={choice.label}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(choice.value)}
              className={
                'min-h-10 rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ' +
                (selected
                  ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/60'
                  : 'text-zinc-300 ring-zinc-700 hover:bg-zinc-800')
              }
            >
              {choice.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

const DEFAULT_UNIT: Record<PlanSection, PlanUnit> = {
  income: 'year',
  withheld: 'twice_month',
  bills: 'month',
  buckets: 'month',
}

export interface PlanBucketOption {
  id: string
  name: string
  notes: string | null
}

export interface AddLineValues {
  section: PlanSection
  unit: PlanUnit
  value: bigint
  name: string | null
  /** An existing household bucket, or null with `newBucketName` set. */
  bucketId: string | null
  newBucketName: string | null
  paidBy: PlanPaidBy | null
  /** The line's note; on a Buckets line, the bucket's note. Null when empty. */
  notes: string | null
}

/** Add a line to one section. "Add" stays disabled until the line is valid. */
export function PlanAddLineSheet({
  section,
  bucketOptions,
  onClose,
  onAdd,
}: {
  section: PlanSection
  /** Household buckets not already on the plan. */
  bucketOptions: readonly PlanBucketOption[]
  onClose: () => void
  /** Saves; throws to show the error in the sheet. */
  onAdd: (values: AddLineValues) => Promise<void>
}) {
  const ids = useId()
  const isBuckets = section === 'buckets'
  const [name, setName] = useState('')
  const [bucketChoice, setBucketChoice] = useState<string>(bucketOptions[0]?.id ?? 'new')
  // A Buckets line's note is its bucket's: picking a bucket shows the note it has.
  const [notes, setNotes] = useState(isBuckets ? (bucketOptions[0]?.notes ?? '') : '')
  const [newBucketName, setNewBucketName] = useState('')
  const [amountText, setAmountText] = useState('')
  const [unit, setUnit] = useState<PlanUnit>(DEFAULT_UNIT[section])
  const [paidBy, setPaidBy] = useState<PlanPaidBy | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const perChoices = PLAN_PER_OPTIONS.filter((o) => section !== 'income' || o.unit !== 'percent').map((o) => ({
    value: o.unit as PlanUnit,
    label: o.label,
  }))
  const value = amountText.trim() ? parseCellInput(unit as PlanColumn, amountText) : null
  const amountInvalid = amountText.trim() !== '' && value === null
  const usingNewBucket = isBuckets && bucketChoice === 'new'
  const nameOk = isBuckets
    ? usingNewBucket
      ? newBucketName.trim().length > 0
      : Boolean(bucketChoice)
    : name.trim().length > 0
  const canAdd = nameOk && value !== null && !saving

  async function submit() {
    if (!canAdd || value === null) return
    setSaving(true)
    setError(null)
    try {
      await onAdd({
        section,
        unit,
        value,
        name: isBuckets ? null : name.trim(),
        bucketId: isBuckets && !usingNewBucket ? bucketChoice : null,
        newBucketName: usingNewBucket ? newBucketName.trim() : null,
        paidBy: section === 'bills' || section === 'buckets' ? paidBy : null,
        notes: notes.trim() ? notes : null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={saving ? () => {} : onClose} aria-label={PLAN_ADD_TITLES[section]} closeOnBackdropClick={false}>
      <SheetHeader title={PLAN_ADD_TITLES[section]} onClose={onClose} disabled={saving} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {isBuckets ? (
          <>
            <label className="block">
              <FieldLabel>{PLAN_BUCKET_LABEL}</FieldLabel>
              <select
                value={bucketChoice}
                onChange={(e) => {
                  setBucketChoice(e.target.value)
                  setNotes(bucketOptions.find((b) => b.id === e.target.value)?.notes ?? '')
                }}
                className={INPUT_CLASS}
              >
                {bucketOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
                <option value="new">{PLAN_NEW_BUCKET_OPTION}</option>
              </select>
            </label>
            {usingNewBucket ? (
              <label className="block">
                <FieldLabel>{PLAN_NEW_BUCKET_NAME_LABEL}</FieldLabel>
                <input
                  type="text"
                  maxLength={40}
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  className={INPUT_CLASS}
                />
              </label>
            ) : null}
          </>
        ) : (
          <label className="block">
            <FieldLabel>{PLAN_NAME_LABEL}</FieldLabel>
            <input
              type="text"
              autoFocus
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
        )}

        <label className="block" htmlFor={`${ids}-amount`}>
          <FieldLabel>{section === 'income' ? PLAN_GROSS_AMOUNT_LABEL : PLAN_AMOUNT_LABEL}</FieldLabel>
          <span className="relative block">
            {unit === 'percent' ? null : (
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-500">
                $
              </span>
            )}
            <input
              id={`${ids}-amount`}
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              aria-invalid={amountInvalid}
              className={INPUT_CLASS + (unit === 'percent' ? ' pr-8' : ' pl-7')}
            />
            {unit === 'percent' ? (
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-500">
                %
              </span>
            ) : null}
          </span>
          {amountInvalid ? (
            <span className="mt-1 block text-xs text-red-300">
              {unit === 'percent' ? PLAN_INVALID_PERCENT : PLAN_INVALID_AMOUNT}
            </span>
          ) : null}
        </label>

        <ChoiceChips label={PLAN_PER_LABEL} choices={perChoices} value={unit} onChange={setUnit} />

        {section === 'bills' || section === 'buckets' ? (
          <ChoiceChips label={PLAN_PAID_BY_LABEL} choices={PAID_BY_CHOICES} value={paidBy} onChange={setPaidBy} />
        ) : null}

        <label className="block">
          <FieldLabel>{isBuckets ? PLAN_BUCKET_NOTE_LABEL : PLAN_NOTE_LABEL}</FieldLabel>
          <textarea
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={INPUT_CLASS + ' min-h-20 resize-y'}
          />
        </label>

        {error ? (
          <p role="alert" className={ERROR_CLASS}>
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={!canAdd} className={PRIMARY_CLASS}>
          {saving ? PLAN_SAVING_LABEL : PLAN_ADD_LABEL}
        </button>
      </form>
    </Sheet>
  )
}

export interface LineDetailsValues {
  name: string
  paidBy: PlanPaidBy | null
  notes: string | null
}

/**
 * A line's details. Admins edit name, Paid by and note (Save, like
 * BucketNotesSheet) and can delete; shared members read them.
 */
export function PlanLineSheet({
  line,
  displayName,
  displayNotes,
  canEdit,
  canMoveUp,
  canMoveDown,
  onClose,
  onSave,
  onMove,
  onDelete,
}: {
  line: PlanLine
  displayName: string
  displayNotes: string | null
  canEdit: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onClose: () => void
  onSave: (values: LineDetailsValues) => Promise<void>
  /** Moves the line within its section right away (the keyboard path for drag to reorder). */
  onMove: (direction: 'up' | 'down') => void
  onDelete: () => Promise<void>
}) {
  const isBucketLine = line.section === 'buckets'
  const payable = line.section === 'bills' || line.section === 'buckets'
  const [name, setName] = useState(displayName)
  const [paidBy, setPaidBy] = useState<PlanPaidBy | null>(line.paidBy)
  const [notes, setNotes] = useState(displayNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), paidBy, notes: notes.trim() ? notes : null })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  async function doDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e))
      setDeleting(false)
    }
  }

  if (!canEdit) {
    return (
      <Sheet open onClose={onClose} aria-label={displayName}>
        <SheetHeader title={displayName} onClose={onClose} />
        <div className="space-y-4 text-sm">
          {payable && line.paidBy ? (
            <p className="flex justify-between gap-3 border-b border-zinc-800 pb-3">
              <span className="text-zinc-400">{PLAN_PAID_BY_LABEL}</span>
              <span className="text-zinc-200">{PLAN_PAID_BY_LABELS[line.paidBy]}</span>
            </p>
          ) : null}
          {displayNotes ? (
            <p className="whitespace-pre-wrap break-words leading-relaxed text-zinc-300">{displayNotes}</p>
          ) : null}
        </div>
      </Sheet>
    )
  }

  return (
    <>
      <Sheet open onClose={saving ? () => {} : onClose} aria-label={PLAN_EDIT_LINE_TITLE} closeOnBackdropClick={false}>
        <SheetHeader title={PLAN_EDIT_LINE_TITLE} onClose={onClose} disabled={saving} />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className="block">
            <FieldLabel>{isBucketLine ? PLAN_BUCKET_NAME_LABEL : PLAN_NAME_LABEL}</FieldLabel>
            <input
              type="text"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          {payable ? (
            <ChoiceChips label={PLAN_PAID_BY_LABEL} choices={PAID_BY_CHOICES} value={paidBy} onChange={setPaidBy} />
          ) : null}
          <label className="block">
            <FieldLabel>{isBucketLine ? PLAN_BUCKET_NOTE_LABEL : PLAN_NOTE_LABEL}</FieldLabel>
            <textarea
              rows={4}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={INPUT_CLASS + ' min-h-24 resize-y'}
            />
          </label>
          {error ? (
            <p role="alert" className={ERROR_CLASS}>
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={saving || !name.trim()} className={PRIMARY_CLASS}>
            {saving ? PLAN_SAVING_LABEL : PLAN_SAVE_LABEL}
          </button>
          {canMoveUp || canMoveDown ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onMove('up')}
                disabled={saving || !canMoveUp}
                className="rounded-lg py-2.5 text-sm font-semibold text-zinc-200 ring-1 ring-inset ring-zinc-700 transition hover:bg-zinc-800 disabled:opacity-40"
              >
                {PLAN_MOVE_UP_LABEL}
              </button>
              <button
                type="button"
                onClick={() => onMove('down')}
                disabled={saving || !canMoveDown}
                className="rounded-lg py-2.5 text-sm font-semibold text-zinc-200 ring-1 ring-inset ring-zinc-700 transition hover:bg-zinc-800 disabled:opacity-40"
              >
                {PLAN_MOVE_DOWN_LABEL}
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={saving}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-red-300 ring-1 ring-inset ring-red-500/40 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            {PLAN_DELETE_LINE_LABEL}
          </button>
        </form>
      </Sheet>
      <ConfirmSheet
        open={confirmDelete}
        title={planDeleteLineTitle(displayName)}
        body={isBucketLine ? PLAN_DELETE_BUCKET_LINE_BODY : PLAN_DELETE_LINE_BODY}
        confirmLabel={PLAN_DELETE_LINE_LABEL}
        busyLabel={PLAN_DELETING_LABEL}
        busy={deleting}
        error={deleteError}
        onConfirm={() => void doDelete()}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  )
}

/** Per-person view settings: Compact and which columns show. */
export function PlanViewSheet({
  prefs,
  canLock,
  onChange,
  onClose,
}: {
  prefs: PlanViewPrefs
  /** Admins can lock their own editing on this device; shared members can't edit anyway. */
  canLock: boolean
  onChange: (prefs: PlanViewPrefs) => void
  onClose: () => void
}) {
  function toggleColumn(column: PlanColumn, visible: boolean) {
    const hidden = visible
      ? prefs.hiddenColumns.filter((c) => c !== column)
      : [...prefs.hiddenColumns, column]
    // At least one column always stays visible.
    if (hidden.length >= PLAN_COLUMNS.length) return
    onChange({ ...prefs, hiddenColumns: hidden })
  }

  return (
    <Sheet open onClose={onClose} aria-label={PLAN_VIEW_LABEL}>
      <SheetHeader title={PLAN_VIEW_LABEL} onClose={onClose} />
      {canLock ? (
        <div className="flex min-h-12 items-center justify-between border-b border-zinc-800">
          <span className="text-sm text-zinc-200">{PLAN_LOCK_LABEL}</span>
          <SwitchToggle
            checked={prefs.locked}
            label={PLAN_LOCK_LABEL}
            onChange={(locked) => onChange({ ...prefs, locked })}
          />
        </div>
      ) : null}
      <div className="flex min-h-12 items-center justify-between border-b border-zinc-800">
        <span className="text-sm text-zinc-200">{PLAN_COMPACT_LABEL}</span>
        <SwitchToggle
          checked={prefs.compact}
          label={PLAN_COMPACT_LABEL}
          onChange={(compact) => onChange({ ...prefs, compact })}
        />
      </div>
      <p className="mt-4 mb-1 text-xs font-medium text-zinc-400">{PLAN_COLUMNS_LABEL}</p>
      {PLAN_COLUMNS.map((column) => {
        const visible = !prefs.hiddenColumns.includes(column)
        return (
          <div key={column} className="flex min-h-12 items-center justify-between border-b border-zinc-800 last:border-0">
            <span className="text-sm text-zinc-200">{PLAN_COLUMN_LABELS[column]}</span>
            <SwitchToggle
              checked={visible}
              label={PLAN_COLUMN_LABELS[column]}
              onChange={(next) => toggleColumn(column, next)}
            />
          </div>
        )
      })}
    </Sheet>
  )
}

export interface PlanLinkRule {
  id: string
  name: string
  cadenceSummary: string
  /** Distinct buckets in the rule's lines right now. */
  bucketCount: number
}

/**
 * The Plan's Auto-bucket link: what the linked rule does each run, and (for
 * admins) which household rule the plan sets. Changing it confirms first.
 */
export function PlanLinkSheet({
  canEdit,
  linked,
  linkableRules,
  eachRunText,
  bucketCount,
  planBucketCount,
  onOpenAutoBucket,
  onLink,
  onClose,
}: {
  canEdit: boolean
  linked: PlanLinkRule | null
  linkableRules: readonly PlanLinkRule[]
  /** The linked rule's total per run, already formatted (respects Hide amounts). */
  eachRunText: string
  bucketCount: number
  /** Buckets lines in the plan: none means linking copies the rule's in. */
  planBucketCount: number
  onOpenAutoBucket: () => void
  /** Link a rule, or unlink with null; throws to show the error. */
  onLink: (ruleId: string | null) => Promise<void>
  onClose: () => void
}) {
  // The choice being confirmed. It stays set while the confirm sheet animates
  // closed, so its title and text don't change mid-close.
  const [pending, setPending] = useState<{ ruleId: string | null; name: string; body: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)


  function choose(ruleId: string | null) {
    if (ruleId === (linked?.id ?? null)) return
    const rule = ruleId ? linkableRules.find((r) => r.id === ruleId) : undefined
    const name = ruleId ? rule?.name ?? '' : linked?.name ?? ''
    const body = ruleId ? planLinkConfirmBody(rule?.bucketCount ?? 0, planBucketCount) : PLAN_UNLINK_CONFIRM_BODY
    setPending({ ruleId, name, body })
    setError(null)
    setConfirmOpen(true)
  }

  async function confirm() {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      await onLink(pending.ruleId)
      setConfirmOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet open onClose={onClose} aria-label={PLAN_LINK_TITLE}>
        <SheetHeader title={linked ? linked.name : PLAN_LINK_TITLE} onClose={onClose} />
        <div className="space-y-4 text-sm">
          {linked ? (
            <dl className="divide-y divide-zinc-800 border-y border-zinc-800">
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-zinc-400">{PLAN_LINK_SCHEDULE_LABEL}</dt>
                <dd className="text-right text-zinc-200">{linked.cadenceSummary}</dd>
              </div>
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-zinc-400">{PLAN_LINK_EACH_RUN_LABEL}</dt>
                <dd className="font-semibold tabular-nums text-emerald-300">{eachRunText}</dd>
              </div>
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-zinc-400">{PLAN_LINK_BUCKETS_LABEL}</dt>
                <dd className="tabular-nums text-zinc-200">{bucketCount}</dd>
              </div>
            </dl>
          ) : null}

          {canEdit ? (
            linkableRules.length > 0 ? (
              <label className="block">
                <FieldLabel>{PLAN_LINK_RULE_LABEL}</FieldLabel>
                <select
                  value={linked?.id ?? ''}
                  onChange={(e) => choose(e.target.value || null)}
                  className={INPUT_CLASS}
                >
                  <option value="">{PLAN_LINK_NONE_LABEL}</option>
                  {linkableRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name} · {rule.cadenceSummary}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-zinc-400">{PLAN_LINK_EMPTY}</p>
            )
          ) : null}

          <button
            type="button"
            onClick={onOpenAutoBucket}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-zinc-200 ring-1 ring-inset ring-zinc-700 transition hover:bg-zinc-800"
          >
            {PLAN_LINK_OPEN_LABEL}
          </button>
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirmOpen}
        tone="caution"
        title={pending?.ruleId ? planLinkConfirmTitle(pending.name) : planUnlinkConfirmTitle(pending?.name ?? '')}
        body={pending?.body ?? ''}
        confirmLabel={pending?.ruleId ? PLAN_LINK_ACTION : PLAN_UNLINK_ACTION}
        busyLabel={PLAN_LINKING_LABEL}
        busy={busy}
        error={error}
        onConfirm={() => void confirm()}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  )
}
