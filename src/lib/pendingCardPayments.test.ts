import { describe, expect, it } from 'vitest'
import {
  CARD_PAYMENT_CATEGORY,
  MAX_SIGNAL_AGE_MS,
  cardSignalsFromPlaid,
  cashBalanceIncludesPending,
  cashSignalsFromPlaid,
  computeCardNetting,
  parseNettingMode,
  type CardSignals,
  type CashSignals,
} from '../../supabase/functions/_shared/pendingCardPayments'

const NOW = new Date('2026-10-22T12:00:00Z')
const OBSERVED = '2026-10-22T11:00:00Z'

function cash(over: Partial<CashSignals> = {}): CashSignals {
  return {
    kind: 'cash',
    accountId: 'chk',
    current: 2700,
    // Equal to current while a debit is pending → `current` already includes it.
    available: 2700,
    pendingOutflows: [{ amount: 300, date: '2026-10-22', cardPayment: true }],
    pendingInflowTotal: 0,
    observedAt: OBSERVED,
    ...over,
  }
}

function card(over: Partial<CardSignals> = {}): CardSignals {
  return {
    kind: 'card',
    accountId: 'card1',
    debt: 1200,
    credits: [{ amount: 300, date: '2026-10-22', pending: true }],
    observedAt: OBSERVED,
    ...over,
  }
}

const net = (signals: (CashSignals | CardSignals)[], mode?: 'off' | 'strict' | 'standard') =>
  computeCardNetting(signals, NOW, mode)

describe('cashBalanceIncludesPending', () => {
  it('is true when available equals current despite a pending debit', () => {
    expect(cashBalanceIncludesPending(cash())).toBe(true)
  })

  it('is false when available is lower by the pending debit (current leaves it out)', () => {
    expect(cashBalanceIncludesPending(cash({ available: 2400 }))).toBe(false)
  })

  it('is false when the gap is partial/ambiguous or available is unknown', () => {
    expect(cashBalanceIncludesPending(cash({ available: 2550 }))).toBe(false)
    expect(cashBalanceIncludesPending(cash({ available: null }))).toBe(false)
  })

  it('is false with nothing pending, and nets pending inflows', () => {
    expect(cashBalanceIncludesPending(cash({ pendingOutflows: [] }))).toBe(false)
    expect(
      cashBalanceIncludesPending(cash({ pendingInflowTotal: 300 })),
    ).toBe(false)
  })
})

describe('computeCardNetting — strict (default)', () => {
  it('nets a payment both sides agree is in flight', () => {
    expect(net([cash(), card()]).get('card1')).toBe(300)
  })

  it('does nothing when the card does not show the pending payment', () => {
    expect(net([cash(), card({ credits: [] })]).get('card1')).toBe(0)
  })

  it('does nothing when the bank balance leaves pending debits out', () => {
    expect(net([cash({ available: 2400 }), card()]).get('card1')).toBe(0)
  })

  it('ignores pending debits that are not card payments', () => {
    const c = cash({
      pendingOutflows: [{ amount: 300, date: '2026-10-22', cardPayment: false }],
    })
    expect(net([c, card()]).get('card1')).toBe(0)
  })

  it('does nothing if the card already posted a matching credit', () => {
    const c = card({
      credits: [
        { amount: 300, date: '2026-10-22', pending: true },
        { amount: 300, date: '2026-10-22', pending: false },
      ],
    })
    expect(net([cash(), c]).get('card1')).toBe(0)
  })

  it('refuses to guess when two cards both show the same pending credit', () => {
    const result = net([cash(), card(), card({ accountId: 'card2' })])
    expect(result.get('card1')).toBe(0)
    expect(result.get('card2')).toBe(0)
  })

  it('ignores a card that owes less than the payment', () => {
    expect(net([cash(), card({ debt: 100 })]).get('card1')).toBe(0)
  })

  it('ignores stale signals', () => {
    const old = new Date(NOW.getTime() - MAX_SIGNAL_AGE_MS - 60_000).toISOString()
    expect(net([cash({ observedAt: old }), card()]).get('card1')).toBe(0)
    expect(net([cash(), card({ observedAt: old })]).get('card1')).toBe(0)
  })

  it('never nets more than the card owes', () => {
    const c = cash({
      pendingOutflows: [
        { amount: 300, date: '2026-10-22', cardPayment: true },
        { amount: 300, date: '2026-10-22', cardPayment: true },
      ],
    })
    const k = card({ debt: 400, credits: [{ amount: 300, date: '2026-10-22', pending: true }] })
    expect(net([c, k]).get('card1')).toBe(400)
  })
})

describe('computeCardNetting — modes', () => {
  it('off never nets', () => {
    expect(net([cash(), card()], 'off').get('card1')).toBe(0)
  })

  it('standard nets a cash-side-only payment when one card can be the target', () => {
    expect(net([cash(), card({ credits: [] })], 'standard').get('card1')).toBe(300)
  })

  it('standard prefers an exact-debt match among several cards', () => {
    const a = card({ accountId: 'a', debt: 300, credits: [] })
    const b = card({ accountId: 'b', debt: 900, credits: [] })
    const result = net([cash(), a, b], 'standard')
    expect(result.get('a')).toBe(300)
    expect(result.get('b')).toBe(0)
  })

  it('standard still refuses an ambiguous target', () => {
    const a = card({ accountId: 'a', debt: 800, credits: [] })
    const b = card({ accountId: 'b', debt: 900, credits: [] })
    const result = net([cash(), a, b], 'standard')
    expect(result.get('a')).toBe(0)
    expect(result.get('b')).toBe(0)
  })

  it('standard still honors the bank-balance gate', () => {
    expect(
      net([cash({ available: 2400 }), card({ credits: [] })], 'standard').get('card1'),
    ).toBe(0)
  })

  it('parses modes, defaulting to strict', () => {
    expect(parseNettingMode('OFF')).toBe('off')
    expect(parseNettingMode(' standard ')).toBe('standard')
    expect(parseNettingMode('strict')).toBe('strict')
    expect(parseNettingMode(undefined)).toBe('strict')
    expect(parseNettingMode('banana')).toBe('strict')
  })
})

describe('Plaid payload mapping', () => {
  const txns = [
    {
      account_id: 'p-chk',
      amount: 300,
      date: '2026-10-22',
      pending: true,
      personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: CARD_PAYMENT_CATEGORY },
    },
    { account_id: 'p-chk', amount: 12.5, date: '2026-10-21', pending: true },
    { account_id: 'p-chk', amount: -50, date: '2026-10-21', pending: true },
    { account_id: 'p-chk', amount: 99, date: '2026-10-20', pending: false },
    { account_id: 'p-card', amount: -300, date: '2026-10-22', pending: true },
    { account_id: 'p-card', amount: 40, date: '2026-10-21', pending: true },
  ]

  it('derives cash signals from pending activity only', () => {
    const s = cashSignalsFromPlaid({
      accountId: 'chk',
      plaidAccountId: 'p-chk',
      current: 2700,
      available: 2700,
      transactions: txns,
      observedAt: OBSERVED,
    })
    expect(s.pendingOutflows).toEqual([
      { amount: 300, date: '2026-10-22', cardPayment: true },
      { amount: 12.5, date: '2026-10-21', cardPayment: false },
    ])
    expect(s.pendingInflowTotal).toBe(50)
  })

  it('derives card credits (money paid in) from negative amounts', () => {
    const s = cardSignalsFromPlaid({
      accountId: 'card1',
      plaidAccountId: 'p-card',
      debt: 1200,
      transactions: txns,
      observedAt: OBSERVED,
    })
    expect(s.credits).toEqual([{ amount: 300, date: '2026-10-22', pending: true }])
  })
})
