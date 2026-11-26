/** Strip invalid characters while typing a USD amount (digits + one decimal, max 2 decimals). */
export function sanitizeAmountInput(value: string): string {
  const noMinus = value.replace(/-/g, '')
  const digitsAndDots = noMinus.replace(/[^\d.]/g, '')
  const firstDot = digitsAndDots.indexOf('.')
  if (firstDot === -1) return digitsAndDots
  const whole = digitsAndDots.slice(0, firstDot)
  const fraction = digitsAndDots.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)
  return `${whole}.${fraction}`
}
