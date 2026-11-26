import { describe, expect, it } from 'vitest'
import {
  formatBtc,
  formatSats,
  HIDDEN_BTC_LABEL,
  HIDDEN_SATS_LABEL,
  btcInputValue,
  sanitizeBtcInput,
} from './formatBtc'

describe('formatBtc', () => {
  it('renders full 8-decimal precision when needed', () => {
    expect(formatBtc(0.00020134)).toBe('₿0.00020134')
    expect(formatBtc(0.00000001)).toBe('₿0.00000001')
  })

  it('trims trailing zeros but keeps at least two decimals', () => {
    expect(formatBtc(0.5)).toBe('₿0.50')
    expect(formatBtc(1)).toBe('₿1.00')
    expect(formatBtc(0.000201)).toBe('₿0.000201')
  })

  it('handles hidden and non-finite values', () => {
    expect(formatBtc(0.5, true)).toBe(HIDDEN_BTC_LABEL)
    expect(formatBtc(Number.NaN)).toBe(HIDDEN_BTC_LABEL)
  })
})

describe('formatSats', () => {
  it('renders whole satoshis with thousands separators (symbol renders separately)', () => {
    expect(formatSats(0.00020134)).toBe('20,134')
    expect(formatSats(0.00000001)).toBe('1')
    expect(formatSats(0.01)).toBe('1,000,000')
  })

  it('handles hidden and non-finite values', () => {
    expect(formatSats(0.5, true)).toBe(HIDDEN_SATS_LABEL)
    expect(formatSats(Number.NaN)).toBe(HIDDEN_SATS_LABEL)
  })
})

describe('btcInputValue', () => {
  it('prefills plain decimals, never exponent notation', () => {
    expect(btcInputValue(0.0000001)).toBe('0.0000001')
    expect(btcInputValue(0.00000001)).toBe('0.00000001')
    expect(btcInputValue(0.5)).toBe('0.5')
    expect(btcInputValue(10)).toBe('10')
    expect(btcInputValue(0)).toBe('0')
  })
})

describe('sanitizeBtcInput', () => {
  it('keeps digits and a single decimal point', () => {
    expect(sanitizeBtcInput('0.0002')).toBe('0.0002')
    expect(sanitizeBtcInput('abc1.2.3')).toBe('1.23')
    expect(sanitizeBtcInput('-0.5')).toBe('0.5')
  })

  it('caps the fraction at 8 decimals', () => {
    expect(sanitizeBtcInput('0.123456789')).toBe('0.12345678')
  })
})
