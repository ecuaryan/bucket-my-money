/** Shown when demo hide-amounts is on — mirrors HIDDEN_MONEY_LABEL. */
export const HIDDEN_BTC_LABEL = '₿•.••'

/**
 * Format a BTC amount with up to 8 decimals, trimming trailing zeros but
 * always keeping at least 2 decimal places so small holdings read as an
 * amount ("₿0.00020134", "₿0.25", "₿1.50").
 */
export function formatBtc(amount: number, hidden = false): string {
  if (hidden) return HIDDEN_BTC_LABEL
  if (!Number.isFinite(amount)) return HIDDEN_BTC_LABEL
  const sats = Math.round(amount * 1e8)
  const fixed = (sats / 1e8).toFixed(8)
  const trimmed = fixed.replace(/(\.\d{2}\d*?)0+$/, '$1')
  return `₿${trimmed}`
}

/** Shown when demo hide-amounts is on and the unit is sats. */
export const HIDDEN_SATS_LABEL = '•••'

const satsFormat = new Intl.NumberFormat('en-US')

/**
 * Format a BTC amount as whole satoshis, number only ("20,134") — the sat
 * symbol renders separately as an SVG (see BtcAmount.tsx / SatsIcon.tsx).
 */
export function formatSats(amount: number, hidden = false): string {
  if (hidden) return HIDDEN_SATS_LABEL
  if (!Number.isFinite(amount)) return HIDDEN_SATS_LABEL
  return satsFormat.format(Math.round(amount * 1e8))
}

/**
 * Plain-decimal string for prefilling a BTC input. `String(1e-7)` is "1e-7",
 * which `sanitizeBtcInput` would mangle into "17" on the next keystroke.
 */
export function btcInputValue(amount: number): string {
  return amount.toFixed(8).replace(/\.?0+$/, '')
}

/** Strip invalid characters while typing a BTC amount (digits + one decimal, max 8 decimals). */
export function sanitizeBtcInput(value: string): string {
  const noMinus = value.replace(/-/g, '')
  const digitsAndDots = noMinus.replace(/[^\d.]/g, '')
  const firstDot = digitsAndDots.indexOf('.')
  if (firstDot === -1) return digitsAndDots
  const whole = digitsAndDots.slice(0, firstDot)
  const fraction = digitsAndDots.slice(firstDot + 1).replace(/\./g, '').slice(0, 8)
  return `${whole}.${fraction}`
}
