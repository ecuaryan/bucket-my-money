import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ClearableInput } from '@/components/ui/ClearableInput'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Sheet } from '@/components/ui/Sheet'
import { SheetHeader } from '@/components/ui/SheetHeader'
import { AmountLimitHint } from '@/components/AmountLimitHint'
import {
  addManualAccount,
  updateManualAccount,
  type ManualAccountKind,
} from '@/lib/accounts'
import {
  MANUAL_CARD_AMOUNT_LABEL,
  MANUAL_CARD_DEFAULT_LABEL,
  MANUAL_CARD_DIALOG_TITLE,
  MANUAL_CARD_EDIT_DIALOG_TITLE,
  MANUAL_CARD_LABEL_PLACEHOLDER,
  MANUAL_SOURCE_DEFAULT_LABEL,
  MANUAL_SOURCE_DIALOG_TITLE,
  MANUAL_SOURCE_LABEL_PLACEHOLDER,
  MANUAL_SOURCE_SUGGESTED_AMOUNT,
} from '@/lib/brand'
import { scrollFocusedIntoView } from '@/lib/keyboardViewport'
import { sanitizeAmountInput } from '@/lib/amountInput'
import { formatErrorMessage } from '@/lib/errorMessage'

type Props = {
  open: boolean
  mode: 'create' | 'edit'
  /** 'card' tracks a credit-card balance (owed; counts against the household balance). */
  kind?: ManualAccountKind
  accountId?: string
  initialLabel?: string
  initialAmount?: number
  onClose: () => void
  /** Edit mode: shows Remove, which hands off to the caller's confirm sheet. */
  onRemove?: () => void
  onSaved: (result: {
    label: string
    mode: 'create' | 'edit'
  }) => void | Promise<void>
}

export default function ManualSourceDialog({
  open,
  mode,
  kind = 'cash',
  accountId,
  initialLabel,
  initialAmount,
  onClose,
  onRemove,
  onSaved,
}: Props) {
  const isCard = kind === 'card'
  const defaultLabel = isCard
    ? MANUAL_CARD_DEFAULT_LABEL
    : MANUAL_SOURCE_DEFAULT_LABEL
  const [label, setLabel] = useState(initialLabel ?? defaultLabel)
  const [amountStr, setAmountStr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setLabel(initialLabel ?? defaultLabel)
    setAmountStr(
      mode === 'create'
        ? // Never prefill debt — a suggested balance only makes sense for cash.
          isCard
          ? ''
          : String(MANUAL_SOURCE_SUGGESTED_AMOUNT)
        : initialAmount !== undefined
          ? String(initialAmount)
          : '',
    )
    setError(null)
    setTimeout(() => {
      const el = amountRef.current
      if (!el) return
      el.focus()
      el.select()
    }, 0)
  }, [open, mode, initialLabel, initialAmount, defaultLabel, isCard])

  const title = isCard
    ? mode === 'create'
      ? MANUAL_CARD_DIALOG_TITLE
      : MANUAL_CARD_EDIT_DIALOG_TITLE
    : mode === 'create'
      ? MANUAL_SOURCE_DIALOG_TITLE
      : 'Edit money source'

  const amount = Number.parseFloat(amountStr)
  const amountValid =
    amountStr.trim() !== '' && Number.isFinite(amount) && amount >= 0
  const canSubmit = Boolean(label.trim()) && amountValid && !submitting

  function onAmountFocus(e: React.FocusEvent<HTMLInputElement>) {
    scrollFocusedIntoView(e.currentTarget)
    e.currentTarget.select()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const trimmed = label.trim()
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'create') {
        await addManualAccount(amount, trimmed, kind)
      } else {
        if (!accountId) throw new Error('Missing account')
        await updateManualAccount(accountId, amount, trimmed)
      }
      onClose()
      await onSaved({ label: trimmed, mode })
    } catch (err) {
      setError(formatErrorMessage(err, 'Could not save. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} aria-label={title}>
      <SheetHeader title={title} onClose={onClose} disabled={submitting} />
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">

        <label className="block">
          <FieldLabel spacing="tight">Label</FieldLabel>
          <ClearableInput
            wrapperClassName="mt-1"
            type="text"
            value={label}
            maxLength={60}
            onValueChange={setLabel}
            placeholder={
              isCard
                ? MANUAL_CARD_LABEL_PLACEHOLDER
                : MANUAL_SOURCE_LABEL_PLACEHOLDER
            }
            inputClassName="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <FieldLabel spacing="tight">
            {isCard ? MANUAL_CARD_AMOUNT_LABEL : 'Amount'}
          </FieldLabel>
          <ClearableInput
            ref={amountRef}
            wrapperClassName="mt-1"
            type="text"
            inputMode="decimal"
            value={amountStr}
            onValueChange={(v) => setAmountStr(sanitizeAmountInput(v))}
            onFocus={onAmountFocus}
            inputClassName="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm tabular-nums text-zinc-100"
          />
          <AmountLimitHint
            id="manual-source-amount-hint"
            availableHint={null}
            overdraftMessage={null}
          />
        </label>

        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : null}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Saving…' : mode === 'create' ? 'Add' : 'Save'}
          </button>
        </div>
        {mode === 'edit' && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={submitting}
            className="w-full rounded-lg py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
      </form>
    </Sheet>
  )
}
