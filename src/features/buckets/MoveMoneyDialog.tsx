import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ClearableInput } from '@/components/ui/ClearableInput'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Sheet } from '@/components/ui/Sheet'
import { AmountLimitHint } from '@/components/AmountLimitHint'
import { amountLimitDescribedBy } from '@/lib/amountLimitHint'
import {
  FLOAT_ENDPOINT_KEY,
  defaultMoveMoneyEndpoints,
  endpointKey,
} from '@/features/buckets/moveMoneyDefaults'
import { moveMoney } from '@/lib/buckets'
import {
  AUTO_ORGANIZE_SET_ASIDE_FLOAT_CONFIRM_TITLE,
  FLOAT_LABEL,
  autoOrganizeSetAsideFloatConfirmBody,
} from '@/lib/brand'
import {
  detectMoveMoneyIntent,
  moveMoneyDialogSubmitLabel,
  moveMoneyDialogSubmittingLabel,
  moveMoneyDialogTitle,
  moveMoneySuccessToast,
  type MoveMoneyIntent,
} from '@/lib/moveMoneyDialogCopy'
import { toast } from '@/lib/toast'
import { HistoryEntityTransfer } from '@/features/history/HistoryEntityTransfer'
import { useHideAmounts } from '@/lib/HideAmountsProvider'
import { scrollFocusedIntoView } from '@/lib/keyboardViewport'
import { sanitizeAmountInput } from '@/lib/amountInput'
import type { Database } from '@/types/database'

type Bucket = Database['public']['Tables']['buckets']['Row']

type Endpoint = { id: string | null; label: string; balance: number | null }

function endpointFromKey(key: string): string | null {
  return key === FLOAT_ENDPOINT_KEY ? null : key
}

type Props = {
  open: boolean
  buckets: Bucket[]
  float: number
  /** Bucket the user tapped to open the dialog. Usually pre-fills as
   *  From; if that bucket or Unbucketed is $0, the empty side defaults
   *  to To so funding an empty bucket is one less swap. */
  initialBucketId: string
  /** Override intent for coach flows (e.g. force set-aside). */
  preferredIntent?: MoveMoneyIntent
  onClose: () => void
  onMoved: (move: {
    fromBucketId: string | null
    toBucketId: string | null
    amount: number
  }) => void | Promise<void>
}

export default function MoveMoneyDialog({
  open,
  buckets,
  float,
  initialBucketId,
  preferredIntent,
  onClose,
  onMoved,
}: Props) {
  const { formatMoney } = useHideAmounts()
  const [fromKey, setFromKey] = useState<string>(FLOAT_ENDPOINT_KEY)
  const [toKey, setToKey] = useState<string>(initialBucketId)
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement | null>(null)

  // Reset state whenever the dialog re-opens (or the tapped bucket changes).
  useEffect(() => {
    if (!open) return
    const balanceById = new Map(
      buckets.map((b) => [b.id, Number(b.allocated_amount)]),
    )
    if (preferredIntent === 'setAside') {
      setFromKey(FLOAT_ENDPOINT_KEY)
      setToKey(initialBucketId)
    } else if (preferredIntent === 'cover') {
      setFromKey(initialBucketId)
      setToKey(FLOAT_ENDPOINT_KEY)
    } else {
      const { fromKey: nextFrom, toKey: nextTo } = defaultMoveMoneyEndpoints(
        initialBucketId,
        float,
        balanceById,
      )
      setFromKey(nextFrom)
      setToKey(nextTo)
    }
    setAmountStr('')
    setNote('')
    setError(null)
    setTimeout(() => amountRef.current?.focus(), 0)
  }, [open, initialBucketId, buckets, float, preferredIntent])

  const intent = detectMoveMoneyIntent({ fromKey, toKey, preferredIntent })
  const dialogTitle = moveMoneyDialogTitle(intent)

  const endpoints = useMemo<Endpoint[]>(() => {
    const list: Endpoint[] = [
      {
        id: null,
        label: FLOAT_LABEL,
        balance: float,
      },
      ...buckets.map((b) => ({
        id: b.id,
        label: b.name,
        balance: Number(b.allocated_amount),
      })),
    ]
    return list
  }, [buckets, float])

  const fromEndpoint = endpoints.find((e) => endpointKey(e.id) === fromKey)
  const toEndpoint = endpoints.find((e) => endpointKey(e.id) === toKey)

  const amount = parseFloat(amountStr)
  const amountValid = Number.isFinite(amount) && amount > 0
  const sameEndpoint = fromKey === toKey
  const fromBalance = fromEndpoint?.balance
  const fromIsFloat = fromKey === FLOAT_ENDPOINT_KEY
  const overdraft =
    amountValid &&
    !fromIsFloat &&
    fromBalance !== null &&
    fromBalance !== undefined &&
    amount > fromBalance
  const overdraftMessage =
    overdraft && fromBalance !== null && fromBalance !== undefined
      ? `You can only move up to ${formatMoney(fromBalance)}.`
      : null
  const moveAvailableHint =
    fromEndpoint &&
    fromBalance !== null &&
    fromBalance !== undefined &&
    !overdraft
      ? `${fromEndpoint.label} has ${formatMoney(fromBalance)} available.`
      : null
  // Shown live as the amount crosses the float: the warning appears and
  // disappears with the amount itself, so there is no separate confirm step.
  const needsFloatConfirm =
    amountValid &&
    fromIsFloat &&
    float >= 0 &&
    amount > float

  const canSubmit = amountValid && !sameEndpoint && !overdraft && !submitting

  async function performMove() {
    setSubmitting(true)
    setError(null)
    try {
      await moveMoney({
        fromBucketId: endpointFromKey(fromKey),
        toBucketId: endpointFromKey(toKey),
        amount,
        note: note.trim() || null,
      })
      if (fromEndpoint && toEndpoint) {
        const confirmation = moveMoneySuccessToast({
          intent,
          amount,
          from: fromEndpoint,
          to: toEndpoint,
          formatMoney,
        })
        toast.success(
          confirmation.message,
          <HistoryEntityTransfer
            sides={confirmation.sides}
            amount={amount}
            formatMoney={formatMoney}
            tone="success"
          />,
        )
      }
      onClose()
      await Promise.resolve(
        onMoved({
          fromBucketId: endpointFromKey(fromKey),
          toBucketId: endpointFromKey(toKey),
          amount,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    await performMove()
  }

  return (
    <Sheet open={open} onClose={onClose} aria-label={dialogTitle}>
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-zinc-300">{dialogTitle}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close"
        >
          ×
        </button>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-xl bg-zinc-950 p-3 ring-1 ring-inset ring-zinc-700">
            <div className="flex items-stretch gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
                <FieldLabel spacing="tight">From</FieldLabel>
                <Picker
                  label="From"
                  value={fromKey}
                  onChange={(key) => {
                    setFromKey(key)
                    setError(null)
                  }}
                  endpoints={endpoints}
                  embedded
                  hideLabel
                />
                <FieldLabel spacing="tight">To</FieldLabel>
                <Picker
                  label="To"
                  value={toKey}
                  onChange={setToKey}
                  endpoints={endpoints}
                  embedded
                  hideLabel
                />
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setFromKey(toKey)
                  setToKey(fromKey)
                }}
                aria-label="Swap From and To"
                title="Swap From and To"
                className="shrink-0 self-center rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 focus:outline focus:outline-2 focus:outline-emerald-400"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                  className="h-5 w-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 4.22a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1-1.06 1.06L6.5 6.56V14a.75.75 0 0 1-1.5 0V6.56L3.28 8.28a.75.75 0 1 1-1.06-1.06l3-3Zm9.5 11.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V6a.75.75 0 0 1 1.5 0v7.38l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          <label className="block">
            <FieldLabel>Amount</FieldLabel>
            <ClearableInput
              ref={amountRef}
              type="text"
              inputMode="decimal"
              value={amountStr}
              onValueChange={(v) => {
                setAmountStr(sanitizeAmountInput(v))
                setError(null)
              }}
              onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
              placeholder="0.00"
              aria-invalid={overdraft || undefined}
              aria-describedby={amountLimitDescribedBy(
                'move-amount-hint',
                moveAvailableHint,
                overdraftMessage,
              )}
              leading={
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-500">
                  $
                </span>
              }
              inputClassName={
                overdraft
                  ? 'w-full rounded-lg border border-red-500/60 bg-zinc-950 py-2 pl-7 pr-3 text-base tabular-nums text-zinc-300 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/40'
                  : 'w-full rounded-lg border-0 bg-zinc-950 py-2 pl-7 pr-3 text-base tabular-nums text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-emerald-400'
              }
            />
            <AmountLimitHint
              id="move-amount-hint"
              availableHint={moveAvailableHint}
              overdraftMessage={overdraftMessage}
            />
          </label>

          <label className="block">
            <FieldLabel optional>Note</FieldLabel>
            <ClearableInput
              type="text"
              value={note}
              onValueChange={setNote}
              onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
              maxLength={280}
              placeholder="What's this for?"
              clearAriaLabel="Clear note"
              inputClassName="w-full rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-emerald-400"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30"
            >
              {error}
            </p>
          )}
          {sameEndpoint && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-500/30">
              Pick a different source and destination.
            </p>
          )}

          {needsFloatConfirm && (
            <div
              aria-live="polite"
              className="space-y-2 border-t border-zinc-800 pt-4"
            >
              <h3 className="text-lg font-semibold text-zinc-100">
                {AUTO_ORGANIZE_SET_ASIDE_FLOAT_CONFIRM_TITLE}
              </h3>
              <p className="text-sm text-zinc-300">
                {autoOrganizeSetAsideFloatConfirmBody(formatMoney(amount))}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? moveMoneyDialogSubmittingLabel(intent)
                : needsFloatConfirm
                  ? 'Set aside anyway'
                  : amountValid
                    ? moveMoneyDialogSubmitLabel(
                        intent,
                        formatMoney(amount),
                        intent === 'cover'
                          ? fromEndpoint?.label
                          : toEndpoint?.label,
                      )
                    : moveMoneyDialogSubmitLabel(intent, '', undefined)}
            </button>
          </div>
        </form>
    </Sheet>
  )
}

function Picker({
  label,
  value,
  onChange,
  endpoints,
  embedded = false,
  hideLabel = false,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  endpoints: Endpoint[]
  embedded?: boolean
  hideLabel?: boolean
}) {
  const { formatMoney } = useHideAmounts()
  return (
    <label className="block min-w-0">
      {!hideLabel && (
        <FieldLabel>{label}</FieldLabel>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={hideLabel ? label : undefined}
        className={
          embedded
            ? 'w-full rounded-lg border-0 bg-zinc-900 px-2 py-2 text-sm text-zinc-300 focus:outline focus:outline-2 focus:outline-emerald-400'
            : 'w-full rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 focus:outline focus:outline-2 focus:outline-emerald-400'
        }
      >
        {endpoints.map((e) => {
          const key = endpointKey(e.id)
          const balance =
            e.balance !== null && e.balance !== undefined
              ? ` — ${formatMoney(e.balance)}`
              : ''
          return (
            <option key={key} value={key}>
              {e.label}
              {balance}
            </option>
          )
        })}
      </select>
    </label>
  )
}
