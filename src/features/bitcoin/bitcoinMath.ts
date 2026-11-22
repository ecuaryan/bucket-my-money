/**
 * Pure derived-value math for Bitcoin entries. Supabase returns numeric
 * columns as strings, so every input accepts number | string and is
 * normalized at this boundary. Components never do arithmetic inline —
 * all price-dependent derivation (and its price-unavailable null path)
 * lives here.
 */

type NumericLike = number | string

export type BitcoinEntryAmounts = {
  usd_amount: NumericLike
  btc_amount: NumericLike
}

export type BitcoinTotals = {
  originalUsd: number
  btc: number
  /**
   * Average cost basis per whole BTC (total spent ÷ BTC held), directly
   * comparable to the live spot price. null when nothing is held (no
   * divide-by-zero) — price-independent, so it's always present otherwise.
   */
  avgCostPerBtc: number | null
  /** null when the live price is unavailable */
  currentUsd: number | null
  /** null when the live price is unavailable */
  gainLoss: number | null
}

function toNumber(value: NumericLike): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/** BTC amounts sum in satoshis to avoid float drift across 8-decimal values. */
function toSats(btc: NumericLike): number {
  return Math.round(toNumber(btc) * 1e8)
}

/**
 * What this purchase paid per whole BTC (cost ÷ BTC bought) — the spot price
 * it effectively bought at. null when the entry holds no BTC (no
 * divide-by-zero). Price-independent.
 */
export function entryPricePaid(entry: BitcoinEntryAmounts): number | null {
  const btc = toSats(entry.btc_amount) / 1e8
  if (btc <= 0) return null
  return roundCents(toNumber(entry.usd_amount) / btc)
}

export function entryCurrentValue(
  entry: BitcoinEntryAmounts,
  priceUsd: number,
): number {
  return roundCents(toNumber(entry.btc_amount) * priceUsd)
}

export function entryGainLoss(
  entry: BitcoinEntryAmounts,
  priceUsd: number,
): number {
  return roundCents(entryCurrentValue(entry, priceUsd) - toNumber(entry.usd_amount))
}

export function totalsForEntries(
  entries: BitcoinEntryAmounts[],
  priceUsd: number | null,
): BitcoinTotals {
  const originalUsd = roundCents(
    entries.reduce((sum, e) => sum + toNumber(e.usd_amount), 0),
  )
  const sats = entries.reduce((sum, e) => sum + toSats(e.btc_amount), 0)
  const btc = sats / 1e8
  const avgCostPerBtc = btc > 0 ? roundCents(originalUsd / btc) : null
  if (priceUsd === null) {
    return { originalUsd, btc, avgCostPerBtc, currentUsd: null, gainLoss: null }
  }
  const currentUsd = roundCents(
    entries.reduce((sum, e) => sum + entryCurrentValue(e, priceUsd), 0),
  )
  return {
    originalUsd,
    btc,
    avgCostPerBtc,
    currentUsd,
    gainLoss: roundCents(currentUsd - originalUsd),
  }
}
