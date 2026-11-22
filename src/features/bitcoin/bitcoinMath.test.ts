import { describe, expect, it } from 'vitest'
import {
  entryCurrentValue,
  entryGainLoss,
  entryPricePaid,
  totalsForEntries,
} from './bitcoinMath'

const PRICE = 50_000

describe('entryCurrentValue / entryGainLoss', () => {
  it('derives current value from btc amount and price, rounded to cents', () => {
    const entry = { usd_amount: 20, btc_amount: 0.0002013 }
    expect(entryCurrentValue(entry, PRICE)).toBe(10.07)
    expect(entryGainLoss(entry, PRICE)).toBe(-9.93)
  })

  it('reports gains as positive', () => {
    const entry = { usd_amount: 30, btc_amount: 0.00067603 }
    expect(entryGainLoss(entry, 100_000)).toBe(37.6)
  })

  it('accepts Supabase numeric strings', () => {
    const entry = { usd_amount: '20.00', btc_amount: '0.00020130' }
    expect(entryCurrentValue(entry, PRICE)).toBe(10.07)
  })
})

describe('totalsForEntries', () => {
  const entries = [
    { usd_amount: '20.00', btc_amount: '0.00020134' },
    { usd_amount: '10.00', btc_amount: '0.00012743' },
    { usd_amount: '15.00', btc_amount: '0.00014373' },
  ]

  it('sums originals, btc (satoshi-exact), current value, and gain/loss', () => {
    const totals = totalsForEntries(entries, PRICE)
    expect(totals.originalUsd).toBe(45)
    expect(totals.btc).toBe(0.0004725)
    expect(totals.currentUsd).toBe(23.63)
    expect(totals.gainLoss).toBe(-21.37)
  })

  it('derives average cost basis per whole BTC, rounded to cents', () => {
    // 45 spent / 0.0004725 held = 95,238.095… → 95,238.10 per BTC
    expect(totalsForEntries(entries, PRICE).avgCostPerBtc).toBe(95238.1)
  })

  it('reports average cost even when the price is unavailable (price-independent)', () => {
    expect(totalsForEntries(entries, null).avgCostPerBtc).toBe(95238.1)
  })

  it('propagates null current value and gain/loss when price is unavailable', () => {
    const totals = totalsForEntries(entries, null)
    expect(totals.originalUsd).toBe(45)
    expect(totals.btc).toBe(0.0004725)
    expect(totals.currentUsd).toBeNull()
    expect(totals.gainLoss).toBeNull()
  })

  it('sums many 8-decimal amounts without float drift', () => {
    const tiny = Array.from({ length: 100 }, () => ({
      usd_amount: 0.1,
      btc_amount: 0.00000001,
    }))
    const totals = totalsForEntries(tiny, null)
    expect(totals.btc).toBe(0.000001)
    expect(totals.originalUsd).toBe(10)
  })

  it('handles the empty list', () => {
    expect(totalsForEntries([], PRICE)).toEqual({
      originalUsd: 0,
      btc: 0,
      avgCostPerBtc: null,
      currentUsd: 0,
      gainLoss: 0,
    })
  })
})

describe('entryPricePaid', () => {
  it('is cost per whole BTC, rounded to cents (Kaycee 1/5/24: $30 for 0.00067603)', () => {
    expect(entryPricePaid({ usd_amount: 30, btc_amount: 0.00067603 })).toBe(44376.73)
  })

  it('accepts Supabase numeric strings', () => {
    expect(entryPricePaid({ usd_amount: '20', btc_amount: '0.00033338' })).toBe(59991.6)
  })

  it('is null when the entry holds no BTC', () => {
    expect(entryPricePaid({ usd_amount: 10, btc_amount: 0 })).toBeNull()
  })
})
