import { useCallback, useEffect, useState } from 'react'
import { formatLoadErrorMessage } from '@/lib/authLockError'
import { useAuth } from '@/lib/auth'
import { useHideAmounts } from '@/lib/HideAmountsProvider'
import {
  fetchBitcoinEntries,
  type BitcoinEntryRow,
} from '@/lib/bitcoinData'
import { totalsForEntries } from './bitcoinMath'
import { useBtcPrice } from './useBtcPrice'
import { useBtcUnit } from './btcUnit'
import BitcoinEntryTable from './BitcoinEntryTable'
import BitcoinPriceBadge from './BitcoinPriceBadge'
import BtcAmount from './BtcAmount'
import BtcUnitToggle from './BtcUnitToggle'

/**
 * The kid's read-only Bitcoin tab on the Buckets page. RLS limits the fetch
 * to their own entries. The host page only mounts this when the flag is on
 * and the kid has at least one entry.
 */
export default function BitcoinTab() {
  const { hidden, peeking, formatMoney } = useHideAmounts()
  // Mask BTC amounts the same way formatMoney does — Peek reveals them too.
  const btcHidden = hidden && !peeking
  const auth = useAuth()
  const viewerMemberId =
    auth.status === 'signedIn' ? (auth.member?.id ?? null) : null
  const [btcUnit, toggleBtcUnit] = useBtcUnit(viewerMemberId)
  const priceState = useBtcPrice()
  const price = priceState.status === 'ready' ? priceState.price : null

  const [entries, setEntries] = useState<BitcoinEntryRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const loadEntries = useCallback(async () => {
    try {
      setEntries(await fetchBitcoinEntries())
      setLoadError(null)
    } catch (e) {
      setLoadError(formatLoadErrorMessage(e, 'Could not load your Bitcoin.'))
    }
  }, [])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  async function retryLoad() {
    setRetrying(true)
    try {
      await loadEntries()
    } finally {
      setRetrying(false)
    }
  }

  const totals = entries ? totalsForEntries(entries, price) : null

  return (
    <section
      className="overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-[#F7931A]/25"
      aria-label="Bitcoin"
    >
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#F7931A]">
            Your Bitcoin
          </h2>
          <div className="flex items-center gap-2">
            <BitcoinPriceBadge {...priceState} />
            <BtcUnitToggle unit={btcUnit} onToggle={toggleBtcUnit} />
          </div>
        </div>
        {totals && totals.originalUsd > 0 ? (
          <div className="mt-2">
            <p className="text-base tabular-nums">
              <span className="font-semibold text-zinc-100">
                {totals.currentUsd !== null
                  ? formatMoney(totals.currentUsd)
                  : '—'}
              </span>
              {totals.gainLoss !== null ? (
                <span
                  className={`ml-2 text-sm ${
                    totals.gainLoss > 0
                      ? 'text-emerald-300'
                      : totals.gainLoss < 0
                        ? 'text-red-300'
                        : 'text-zinc-400'
                  }`}
                >
                  {totals.gainLoss > 0 ? '+' : totals.gainLoss < 0 ? '-' : ''}
                  {formatMoney(Math.abs(totals.gainLoss))}
                </span>
              ) : null}
            </p>
            <p className="text-[11px] tabular-nums text-zinc-500">
              {formatMoney(totals.originalUsd)} cost
              <span className="text-zinc-600"> · </span>
              <BtcAmount amount={totals.btc} unit={btcUnit} hidden={btcHidden} />
              {totals.avgCostPerBtc !== null ? (
                <>
                  <span className="text-zinc-600"> · </span>
                  avg {formatMoney(totals.avgCostPerBtc)}/
                  <span aria-hidden>₿</span>
                  <span className="sr-only">BTC</span>
                </>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>

      <div className="px-4 py-3">
        {loadError ? (
          <div>
            <p className="text-sm text-zinc-400">{loadError}</p>
            <button
              type="button"
              onClick={() => void retryLoad()}
              disabled={retrying}
              className="mt-2 text-xs font-semibold text-[#F7931A] transition hover:text-[#F7931A]/80"
            >
              {retrying ? 'Trying…' : 'Try again'}
            </button>
          </div>
        ) : entries === null ? (
          <div className="space-y-2" aria-hidden>
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-800" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-800" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-zinc-400">No Bitcoin entries yet.</p>
        ) : (
          <BitcoinEntryTable
            entries={entries}
            price={price}
            formatMoney={formatMoney}
            btcUnit={btcUnit}
            btcHidden={btcHidden}
          />
        )}
      </div>
    </section>
  )
}
