import { describe, expect, it } from 'vitest'
import { sanitizeAmountInput } from './amountInput'

describe('sanitizeAmountInput', () => {
  it('keeps digits and one decimal point', () => {
    expect(sanitizeAmountInput('12.34')).toBe('12.34')
    expect(sanitizeAmountInput('0.5')).toBe('0.5')
  })

  it('strips letters and symbols', () => {
    expect(sanitizeAmountInput('abc')).toBe('')
    expect(sanitizeAmountInput('12a3b')).toBe('123')
    expect(sanitizeAmountInput('$50.00')).toBe('50.00')
  })

  it('strips minus signs', () => {
    expect(sanitizeAmountInput('-25')).toBe('25')
  })

  it('collapses extra decimal points', () => {
    expect(sanitizeAmountInput('1.2.3')).toBe('1.23')
  })

  it('stops at whole cents', () => {
    expect(sanitizeAmountInput('0.005')).toBe('0.00')
    expect(sanitizeAmountInput('1.999')).toBe('1.99')
    expect(sanitizeAmountInput('12.')).toBe('12.')
  })
})
