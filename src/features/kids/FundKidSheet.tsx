import { useState, type FormEvent } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { ClearableInput } from '@/components/ui/ClearableInput'
import { AmountLimitHint } from '@/components/AmountLimitHint'
import { amountLimitDescribedBy } from '@/lib/amountLimitHint'
import {
  KIDS_GIVE_FAILED,
  KIDS_GIVE_SUBMIT,
  KIDS_GIVE_SUBMITTING,
  kidsGiveAvailableHint,
  kidsGiveOverdraftMessage,
  kidsGiveSheetTitle,
} from '@/lib/brand'
import { giveMoney } from '@/lib/give'
import { scrollFocusedIntoView } from '@/lib/keyboardViewport'
import { sanitizeAmountInput } from '@/lib/amountInput'

type FundKidSheetProps = {
  kidId: string
  kidName: string
  available: number
  open: boolean
  formatMoney: (amount: number) => string
  onClose: () => void
  onSuccess: (amount: number) => void
}

export default function FundKidSheet({
  kidId,
  kidName,
  available,
  open,
  formatMoney,
  onClose,
  onSuccess,
}: FundKidSheetProps) {
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const amount = parseFloat(amountStr)
  const amountValid = Number.isFinite(amount) && amount > 0
  const overdraft = amountValid && amount > available
  // Cards can pull the pool negative — never phrase "give up to −$400".
  const availableLabel = formatMoney(Math.max(0, available))
  const overdraftMessage = overdraft
    ? kidsGiveOverdraftMessage(availableLabel)
    : null
  const availableHint = !overdraft ? kidsGiveAvailableHint(availableLabel) : null

  function handleClose() {
    if (submitting) return
    setAmountStr('')
    setNote('')
    setSubmitError(null)
    onClose()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

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
        toMemberId: kidId,
        amount,
        note: note.trim() || null,
      })
      setAmountStr('')
      setNote('')
      onSuccess(amount)
      onClose()
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : KIDS_GIVE_FAILED,
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <Sheet open onClose={handleClose} aria-label={kidsGiveSheetTitle(kidName)}>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-zinc-300">
            {kidsGiveSheetTitle(kidName)}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <label className="block">
          <FieldLabel spacing="tight">Amount</FieldLabel>
          <ClearableInput
            wrapperClassName="mt-1 block w-full"
            type="text"
            inputMode="decimal"
            autoFocus
            value={amountStr}
            onValueChange={(v) => {
              setAmountStr(sanitizeAmountInput(v))
              setSubmitError(null)
            }}
            onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
            placeholder="0.00"
            aria-invalid={overdraft || undefined}
            aria-describedby={amountLimitDescribedBy(
              'give-kid-amount-hint',
              availableHint,
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
            id="give-kid-amount-hint"
            availableHint={availableHint}
            overdraftMessage={overdraftMessage}
          />
        </label>

        <label className="block">
          <FieldLabel spacing="tight">Note (optional)</FieldLabel>
          <ClearableInput
            wrapperClassName="mt-1 block w-full"
            value={note}
            onValueChange={setNote}
            onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
            inputClassName="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </label>

        {submitError ? (
          <p
            role="alert"
            className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30"
          >
            {submitError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          aria-describedby={amountLimitDescribedBy(
            'give-kid-amount-hint',
            availableHint,
            overdraftMessage,
          )}
          className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {submitting ? KIDS_GIVE_SUBMITTING : KIDS_GIVE_SUBMIT}
        </button>
      </form>
    </Sheet>
  )
}
