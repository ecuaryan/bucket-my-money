import type { BitcoinEntryRow } from '@/lib/bitcoinData'
import {
  entryCurrentValue,
  entryGainLoss,
  entryPricePaid,
  totalsForEntries,
} from './bitcoinMath'
import BtcAmount from './BtcAmount'
import BitcoinEntryMenu from './BitcoinEntryMenu'
import SatsIcon from './SatsIcon'
import type { BtcUnit } from './btcUnit'

type BitcoinEntryTableProps = {
  entries: BitcoinEntryRow[]
  /** null while loading or when the live price is unavailable */
  price: number | null
  formatMoney: (amount: number) => string
  btcUnit: BtcUnit
  btcHidden?: boolean
  /** Present only for admins — rows get Edit/Delete actions. Delete
   * confirmation is the caller's job (a sheet, not inline). */
  onEdit?: (entry: BitcoinEntryRow) => void
  onDelete?: (entry: BitcoinEntryRow) => void
}

function formatDate(purchasedOn: string): string {
  const date = new Date(`${purchasedOn}T00:00:00`)
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  })
}

function gainLossClass(value: number | null): string {
  if (value === null) return 'text-zinc-500'
  if (value > 0) return 'text-emerald-300'
  if (value < 0) return 'text-red-300'
  return 'text-zinc-300'
}

/**
 * The BTC price a purchase paid (cost ÷ BTC), under its amount like a trade
 * receipt: "₿0.00067603 @ $44,377". Whole dollars — cents are noise at this
 * scale, and a sixth column doesn't fit a phone-width table. On the total row
 * it is the average (same figure as the header's "avg …/₿").
 */
function PricePaid({
  value,
  formatMoney,
  average = false,
}: {
  value: number | null
  formatMoney: (amount: number) => string
  average?: boolean
}) {
  if (value === null) return null
  const label = formatMoney(Math.round(value))
  return (
    <span className="block text-[11px] font-normal text-zinc-500">
      <span aria-hidden>@ {label}</span>
      <span className="sr-only">
        {average ? 'average price paid' : 'price paid'} {label} per bitcoin
      </span>
    </span>
  )
}

function signedMoney(
  value: number,
  formatMoney: (amount: number) => string,
): string {
  const label = formatMoney(Math.abs(value))
  if (value > 0) return `+${label}`
  if (value < 0) return `-${label}`
  return label
}

/**
 * One kid's Bitcoin entries with a totals footer — the app version of one
 * spreadsheet table. Derived columns render as an em dash when the live
 * price is unavailable; original values always render.
 */
export default function BitcoinEntryTable({
  entries,
  price,
  formatMoney,
  btcUnit,
  btcHidden = false,
  onEdit,
  onDelete,
}: BitcoinEntryTableProps) {
  const totals = totalsForEntries(entries, price)
  const hasActions = Boolean(onEdit || onDelete)

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
          <th className="py-1.5 pr-2 font-medium">Date</th>
          <th className="py-1.5 pr-2 text-right font-medium">Cost</th>
          <th className="py-1.5 pr-2 text-right font-medium">
            <span className="inline-flex h-4 items-center justify-end align-middle">
              {btcUnit === 'sats' ? (
                <>
                  <SatsIcon className="h-3 w-3" />
                  <span className="sr-only">Sats</span>
                </>
              ) : (
                <>
                  <span aria-hidden>₿</span>
                  <span className="sr-only">BTC</span>
                </>
              )}
            </span>
          </th>
          <th className="py-1.5 pr-2 text-right font-medium">Now</th>
          <th className="py-1.5 text-right font-medium">
            <span aria-hidden>+/−</span>
            <span className="sr-only">Gain or loss</span>
          </th>
          {hasActions ? <th className="py-1.5" /> : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-800/70">
        {entries.map((entry, index) => {
          const current = price !== null ? entryCurrentValue(entry, price) : null
          const gainLoss = price !== null ? entryGainLoss(entry, price) : null
          return (
            <tr key={entry.id} className="text-zinc-300">
              <td className="py-2 pr-2 whitespace-nowrap text-zinc-400">
                {formatDate(entry.purchased_on)}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">
                {formatMoney(Number(entry.usd_amount))}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">
                <BtcAmount
                  amount={Number(entry.btc_amount)}
                  unit={btcUnit}
                  hidden={btcHidden}
                />
                <PricePaid
                  value={entryPricePaid(entry)}
                  formatMoney={formatMoney}
                />
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">
                {current !== null ? formatMoney(current) : '—'}
              </td>
              <td
                className={`py-2 text-right tabular-nums ${gainLossClass(gainLoss)}`}
              >
                {gainLoss !== null ? signedMoney(gainLoss, formatMoney) : '—'}
              </td>
              {hasActions ? (
                <td className="py-1 pl-1 text-right">
                  <BitcoinEntryMenu
                    isLast={index === entries.length - 1}
                    onEdit={onEdit ? () => onEdit(entry) : undefined}
                    onDelete={onDelete ? () => onDelete(entry) : undefined}
                  />
                </td>
              ) : null}
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-zinc-700 text-zinc-100">
          <td className="py-2 pr-2 text-[11px] uppercase tracking-wide text-zinc-500">
            Total
          </td>
          <td className="py-2 pr-2 text-right font-semibold tabular-nums">
            {formatMoney(totals.originalUsd)}
          </td>
          <td className="py-2 pr-2 text-right font-semibold tabular-nums">
            <BtcAmount amount={totals.btc} unit={btcUnit} hidden={btcHidden} />
            <PricePaid
              value={totals.avgCostPerBtc}
              formatMoney={formatMoney}
              average
            />
          </td>
          <td className="py-2 pr-2 text-right font-semibold tabular-nums">
            {totals.currentUsd !== null ? formatMoney(totals.currentUsd) : '—'}
          </td>
          <td
            className={`py-2 text-right font-semibold tabular-nums ${gainLossClass(totals.gainLoss)}`}
          >
            {totals.gainLoss !== null
              ? signedMoney(totals.gainLoss, formatMoney)
              : '—'}
          </td>
          {hasActions ? <td /> : null}
        </tr>
      </tfoot>
    </table>
  )
}
