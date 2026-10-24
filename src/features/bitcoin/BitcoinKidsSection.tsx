import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { useAuth } from '@/lib/auth'
import { toast } from '@/lib/toast'
import { formatLoadErrorMessage } from '@/lib/authLockError'
import { useHideAmounts } from '@/lib/HideAmountsProvider'
import {
  deleteBitcoinEntry,
  fetchBitcoinEntries,
  type BitcoinEntryRow,
} from '@/lib/bitcoinData'
import { totalsForEntries } from './bitcoinMath'
import BtcAmount from './BtcAmount'
import { useBtcPrice } from './useBtcPrice'
import { useBtcUnit } from './btcUnit'
import BitcoinEntryTable from './BitcoinEntryTable'
import BitcoinEntrySheet from './BitcoinEntrySheet'
import BitcoinPriceBadge from './BitcoinPriceBadge'
import BtcUnitToggle from './BtcUnitToggle'

type BitcoinKidsSectionProps = {
  kids: { id: string; name: string }[]
  isAdmin: boolean
  familyId: string
}

type SheetState = { entry: BitcoinEntryRow | null } | null

/**
 * The Bitcoin section on the Kids page (adults only; flag-gated by the
 * caller). Self-contained: owns its own data fetch and error state so a
 * failure here can never take down the rest of the page.
 */
export default function BitcoinKidsSection({
  kids,
  isAdmin,
  familyId,
}: BitcoinKidsSectionProps) {
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
  const [sheet, setSheet] = useState<SheetState>(null)
  const [confirmDelete, setConfirmDelete] = useState<BitcoinEntryRow | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)
  const [expandedKids, setExpandedKids] = useState<Set<string>>(new Set())

  const loadEntries = useCallback(async () => {
    setLoadError(null)
    try {
      setEntries(await fetchBitcoinEntries())
    } catch (e) {
      setLoadError(formatLoadErrorMessage(e, 'Could not load Bitcoin entries.'))
    }
  }, [])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  const entriesByKid = useMemo(() => {
    const map = new Map<string, BitcoinEntryRow[]>()
    for (const entry of entries ?? []) {
      const list = map.get(entry.child_member_id)
      if (list) list.push(entry)
      else map.set(entry.child_member_id, [entry])
    }
    return map
  }, [entries])

  function toggleKid(kidId: string) {
    setExpandedKids((prev) => {
      const next = new Set(prev)
      if (next.has(kidId)) next.delete(kidId)
      else next.add(kidId)
      return next
    })
  }

  async function handleDeleteConfirmed(entry: BitcoinEntryRow) {
    setDeleting(true)
    try {
      await deleteBitcoinEntry(entry.id)
      setConfirmDelete(null)
      toast.success('Bitcoin entry deleted.')
      void loadEntries()
    } catch (e) {
      setConfirmDelete(null)
      toast.error(
        e instanceof Error ? e.message : 'Could not delete the entry.',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section
      className="overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-[#F7931A]/25"
      aria-label="Bitcoin"
    >
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#F7931A]">Bitcoin</h2>
          <div className="flex items-center gap-2">
            <BitcoinPriceBadge {...priceState} />
            <BtcUnitToggle unit={btcUnit} onToggle={toggleBtcUnit} />
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setSheet({ entry: null })}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-[#F7931A] ring-1 ring-[#F7931A]/40 transition hover:bg-[#F7931A]/10"
              >
                + Add
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="px-4 py-4">
          <p className="text-sm text-zinc-400">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadEntries()}
            className="mt-2 text-xs font-semibold text-[#F7931A] transition hover:text-[#F7931A]/80"
          >
            Try again
          </button>
        </div>
      ) : entries === null ? (
        <div className="space-y-2 px-4 py-4" aria-hidden>
          <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-800" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-800" />
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {kids.map((kid) => {
            const kidEntries = entriesByKid.get(kid.id) ?? []
            const kidTotals = totalsForEntries(kidEntries, price)
            const expanded = expandedKids.has(kid.id)
            return (
              <li key={kid.id}>
                <button
                  type="button"
                  onClick={() => toggleKid(kid.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-zinc-800/40"
                >
                  <span className="flex items-center gap-2 text-sm text-zinc-200">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className={
                        'h-4 w-4 shrink-0 text-zinc-500 motion-safe:transition-transform motion-safe:duration-200 ' +
                        (expanded ? 'rotate-180' : '')
                      }
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {kid.name}
                  </span>
                  {kidEntries.length === 0 ? (
                    <span className="text-xs text-zinc-500">No entries</span>
                  ) : (
                    <span className="text-right">
                      <span className="block text-xs tabular-nums">
                        <span className="font-semibold text-zinc-200">
                          {kidTotals.currentUsd !== null
                            ? formatMoney(kidTotals.currentUsd)
                            : '—'}
                        </span>
                        {kidTotals.gainLoss !== null ? (
                          <span
                            className={`ml-1.5 ${
                              kidTotals.gainLoss > 0
                                ? 'text-emerald-300'
                                : kidTotals.gainLoss < 0
                                  ? 'text-red-300'
                                  : 'text-zinc-400'
                            }`}
                          >
                            {kidTotals.gainLoss > 0 ? '+' : kidTotals.gainLoss < 0 ? '-' : ''}
                            {formatMoney(Math.abs(kidTotals.gainLoss))}
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-[11px] tabular-nums text-zinc-500">
                        {formatMoney(kidTotals.originalUsd)} cost
                        <span className="text-zinc-600"> · </span>
                        <BtcAmount
                          amount={kidTotals.btc}
                          unit={btcUnit}
                          hidden={btcHidden}
                        />
                        {kidTotals.avgCostPerBtc !== null ? (
                          <>
                            <span className="text-zinc-600"> · </span>
                            avg {formatMoney(kidTotals.avgCostPerBtc)}/
                            <span aria-hidden>₿</span>
                            <span className="sr-only">BTC</span>
                          </>
                        ) : null}
                      </span>
                    </span>
                  )}
                </button>
                {expanded ? (
                  <div className="px-4 pb-3">
                    {kidEntries.length > 0 ? (
                      <BitcoinEntryTable
                        entries={kidEntries}
                        price={price}
                        formatMoney={formatMoney}
                        btcUnit={btcUnit}
                        btcHidden={btcHidden}
                        onEdit={
                          isAdmin
                            ? (entry) => setSheet({ entry })
                            : undefined
                        }
                        onDelete={isAdmin ? setConfirmDelete : undefined}
                      />
                    ) : (
                      <p className="text-xs text-zinc-500">
                        No Bitcoin entries for {kid.name} yet.
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {confirmDelete ? (
        <Sheet
          open
          onClose={() => {
            if (!deleting) setConfirmDelete(null)
          }}
          aria-label="Delete Bitcoin entry"
        >
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-300">
              Delete Bitcoin entry?
            </h2>
            <p className="text-sm text-zinc-400">
              {kids.find((kid) => kid.id === confirmDelete.child_member_id)
                ?.name ?? 'This kid'}
              's {formatMoney(Number(confirmDelete.usd_amount))} buy (
              <BtcAmount
                amount={Number(confirmDelete.btc_amount)}
                unit={btcUnit}
                hidden={btcHidden}
              />
              ) from{' '}
              {new Date(
                `${confirmDelete.purchased_on}T00:00:00`,
              ).toLocaleDateString('en-US')}{' '}
              will be removed. This can't be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleDeleteConfirmed(confirmDelete)}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-500/90 py-3 text-sm font-semibold text-black transition hover:bg-red-400 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete entry'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </Sheet>
      ) : null}

      {sheet ? (
        <BitcoinEntrySheet
          kids={kids}
          familyId={familyId}
          entry={sheet.entry}
          open
          onClose={() => setSheet(null)}
          onSaved={() => {
            toast.success(
              sheet.entry ? 'Bitcoin entry updated.' : 'Bitcoin entry added.',
            )
            void loadEntries()
          }}
        />
      ) : null}
    </section>
  )
}
