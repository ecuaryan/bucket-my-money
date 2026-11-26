import { describe, expect, it } from 'vitest'
import { formatMoney, HIDDEN_MONEY_LABEL } from '@/lib/formatMoney'

describe('formatMoney', () => {
  it('omits insignificant trailing zeros on whole dollars', () => {
    expect(formatMoney(100, false)).toBe('$100')
    expect(formatMoney(0, false)).toBe('$0')
    expect(formatMoney(1000, false)).toBe('$1,000')
  })

  it('always shows two decimal places when cents matter', () => {
    expect(formatMoney(1.1, false)).toBe('$1.10')
    expect(formatMoney(1234.5, false)).toBe('$1,234.50')
    expect(formatMoney(100.05, false)).toBe('$100.05')
    expect(formatMoney(0.01, false)).toBe('$0.01')
  })

  it('never shows a negative zero from float sums', () => {
    expect(formatMoney(0.6 - (0.1 + 0.2 + 0.3), false)).toBe('$0')
    expect(formatMoney(-0, false)).toBe('$0')
    expect(formatMoney(-0.001, false)).toBe('$0')
    expect(formatMoney(-0.01, false)).toBe('-$0.01')
  })

  it('masks when hidden', () => {
    expect(formatMoney(1234.5, true)).toBe(HIDDEN_MONEY_LABEL)
    expect(formatMoney(0, true)).toBe(HIDDEN_MONEY_LABEL)
  })
})
