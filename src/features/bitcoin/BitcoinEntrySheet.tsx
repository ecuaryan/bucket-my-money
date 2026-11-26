import { useState, type FormEvent } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { ClearableInput } from '@/components/ui/ClearableInput'
import { sanitizeAmountInput } from '@/lib/amountInput'
import { scrollFocusedIntoView } from '@/lib/keyboardViewport'
import {
  insertBitcoinEntry,
  updateBitcoinEntry,
  type BitcoinEntryRow,
} from '@/lib/bitcoinData'
import { btcInputValue, sanitizeBtcInput } from './formatBtc'

type BitcoinEntrySheetProps = {
  kids: { id: string; name: string }[]
  familyId: string
  /** Editing an existing entry when set; otherwise creating a new one. */
  entry?: BitcoinEntryRow | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

/** Today as YYYY-MM-DD in the user's local timezone (what type=date expects). */
function todayDateString(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const INPUT_CLASS =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-[#F7931A] focus:outline-none focus:ring-1 focus:ring-[#F7931A]'

export default function BitcoinEntrySheet({
  kids,
  familyId,
  entry,
  open,
  onClose,
  onSaved,
}: BitcoinEntrySheetProps) {
  const editing = Boolean(entry)
  const [kidId, setKidId] = useState(
    entry?.child_member_id ?? kids[0]?.id ?? '',
  )
  const [dateStr, setDateStr] = useState(
    entry?.purchased_on ?? todayDateString(),
  )
  const [usdStr, setUsdStr] = useState(
    entry ? String(Number(entry.usd_amount)) : '',
  )
  const [btcStr, setBtcStr] = useState(
    entry ? btcInputValue(Number(entry.btc_amount)) : '',
  )
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const usd = parseFloat(usdStr)
  const btc = parseFloat(btcStr)
  const valid =
    kidId !== '' &&
    dateStr !== '' &&
    Number.isFinite(usd) &&
    usd > 0 &&
    Number.isFinite(btc) &&
    btc > 0

  function handleClose() {
    if (submitting) return
    onClose()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!valid) {
      setSubmitError('Enter a kid, date, USD amount, and BTC amount.')
      return
    }
    setSubmitting(true)
    try {
      const input = {
        childMemberId: kidId,
        purchasedOn: dateStr,
        usdAmount: usd,
        btcAmount: btc,
      }
      if (entry) {
        await updateBitcoinEntry(entry.id, input)
      } else {
        await insertBitcoinEntry(familyId, input)
      }
      onSaved()
      onClose()
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not save the entry.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const title = editing ? 'Edit Bitcoin entry' : 'Add Bitcoin entry'

  return (
    <Sheet open onClose={handleClose} aria-label={title}>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-zinc-300">{title}</h2>
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
          <FieldLabel spacing="tight">Kid</FieldLabel>
          <select
            value={kidId}
            onChange={(e) => {
              setKidId(e.target.value)
              setSubmitError(null)
            }}
            className={`mt-1 ${INPUT_CLASS}`}
          >
            {kids.map((kid) => (
              <option key={kid.id} value={kid.id}>
                {kid.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <FieldLabel spacing="tight">Purchase date</FieldLabel>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => {
              setDateStr(e.target.value)
              setSubmitError(null)
            }}
            onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
            className={`mt-1 ${INPUT_CLASS} [color-scheme:dark]`}
          />
        </label>

        <label className="block">
          <FieldLabel spacing="tight">Original value (USD)</FieldLabel>
          <ClearableInput
            wrapperClassName="mt-1 block w-full"
            type="text"
            inputMode="decimal"
            value={usdStr}
            onValueChange={(v) => {
              setUsdStr(sanitizeAmountInput(v))
              setSubmitError(null)
            }}
            onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
            placeholder="0.00"
            leading={
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                $
              </span>
            }
            inputClassName={`${INPUT_CLASS} pl-7 tabular-nums`}
          />
        </label>

        <label className="block">
          <FieldLabel spacing="tight">BTC amount</FieldLabel>
          <ClearableInput
            wrapperClassName="mt-1 block w-full"
            type="text"
            inputMode="decimal"
            value={btcStr}
            onValueChange={(v) => {
              setBtcStr(sanitizeBtcInput(v))
              setSubmitError(null)
            }}
            onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
            placeholder="0.00000000"
            leading={
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                ₿
              </span>
            }
            inputClassName={`${INPUT_CLASS} pl-7 tabular-nums`}
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
          disabled={submitting || !valid}
          className="w-full rounded-xl bg-[#F7931A] py-3 text-sm font-semibold text-black transition hover:bg-[#F7931A]/90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : editing ? 'Save changes' : 'Add entry'}
        </button>
      </form>
    </Sheet>
  )
}
