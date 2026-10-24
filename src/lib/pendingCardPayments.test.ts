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
    expect(s.credits).toEqual([
      { amount: 300, date: '2026-10-22', pending: true, cardPayment: false },
    ])
  })
})

describe('computeCardNetting — posted cash debit matched to the card\'s pending credit', () => {
  // The real pattern: the bank posted the debit under an unrelated label
  // ("Transfer out"), while the card shows a pending card-payment credit.
  const posted = (over: Partial<CashSignals> = {}) =>
    cash({
      pendingOutflows: [],
      available: 2700,
      postedOutflows: [{ amount: 300, date: '2026-10-21' }],
      ...over,
    })
  const pendingPaymentCard = (over: Partial<CardSignals> = {}) =>
    card({
      credits: [{ amount: 300, date: '2026-10-22', pending: true, cardPayment: true }],
      ...over,
    })

  it('nets it when both sides show the same amount', () => {
    expect(net([posted(), pendingPaymentCard()]).get('card1')).toBe(300)
  })

  it('works without any pending debit or balance gate (a posted debit is already in the balance)', () => {
    expect(net([posted({ available: null }), pendingPaymentCard()]).get('card1')).toBe(300)
  })

  it('does nothing when the amounts differ', () => {
    const c = pendingPaymentCard({
      credits: [{ amount: 299.5, date: '2026-10-22', pending: true, cardPayment: true }],
    })
    expect(net([posted(), c]).get('card1')).toBe(0)
  })

  it('does nothing when the card credit is not labelled a card payment (could be a refund)', () => {
    const c = pendingPaymentCard({
      credits: [{ amount: 300, date: '2026-10-22', pending: true, cardPayment: false }],
    })
    expect(net([posted(), c]).get('card1')).toBe(0)
  })

  it('does nothing when the card credit already posted', () => {
    const c = pendingPaymentCard({
      credits: [{ amount: 300, date: '2026-10-22', pending: false, cardPayment: true }],
    })
    expect(net([posted(), c]).get('card1')).toBe(0)
  })

  it('does nothing when the debit is too old to be this payment', () => {
    const old = posted({ postedOutflows: [{ amount: 300, date: '2026-10-10' }] })
    expect(net([old, pendingPaymentCard()]).get('card1')).toBe(0)
  })

  it('refuses to guess when two cards both show the same pending credit', () => {
    const second = pendingPaymentCard({ accountId: 'card2' })
    const result = net([posted(), pendingPaymentCard(), second])
    expect(result.get('card1')).toBe(0)
    expect(result.get('card2')).toBe(0)
  })

  it('uses each pending credit once (two equal debits, one pending payment)', () => {
    const twice = posted({
      postedOutflows: [
        { amount: 300, date: '2026-10-21' },
        { amount: 300, date: '2026-10-20' },
      ],
    })
    expect(net([twice, pendingPaymentCard()]).get('card1')).toBe(300)
  })

  it('ignores a card that owes less than the payment, and never nets more than owed', () => {
    expect(net([posted(), pendingPaymentCard({ debt: 100 })]).get('card1')).toBe(0)
  })

  it('does nothing when the card already posted a matching credit', () => {
    const c = pendingPaymentCard({
      credits: [
        { amount: 300, date: '2026-10-22', pending: true, cardPayment: true },
        { amount: 300, date: '2026-10-21', pending: false, cardPayment: true },
      ],
    })
    expect(net([posted(), c]).get('card1')).toBe(0)
  })

  it('does nothing with signals stored before posted debits were tracked, stale signals, or mode off', () => {
    const legacy = posted({ postedOutflows: undefined })
    expect(net([legacy, pendingPaymentCard()]).get('card1')).toBe(0)
    const stale = posted({ observedAt: new Date(NOW.getTime() - MAX_SIGNAL_AGE_MS - 1000).toISOString() })
    expect(net([stale, pendingPaymentCard()]).get('card1')).toBe(0)
    expect(net([posted(), pendingPaymentCard()], 'off').get('card1')).toBe(0)
  })

  it('does not double count a payment already netted through the pending-debit path', () => {
    // The same $300 shown as a pending card-payment debit (netted) and no posted debit.
    expect(net([cash(), pendingPaymentCard()]).get('card1')).toBe(300)
  })
})

describe('Plaid payload mapping — posted debits and card-payment credits', () => {
  const txns = [
    { account_id: 'p-chk', amount: 1940.75, date: '2026-10-23', pending: false,
      personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' } },
    { account_id: 'p-chk', amount: 12, date: '2026-10-23', pending: true },
    { account_id: 'p-chk', amount: -500, date: '2026-10-22', pending: false },
    { account_id: 'p-card', amount: -1940.75, date: '2026-10-23', pending: true,
      personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: CARD_PAYMENT_CATEGORY } },
  ]

  it('collects posted debits of any category, not pending ones or inflows', () => {
    const s = cashSignalsFromPlaid({
      accountId: 'chk', plaidAccountId: 'p-chk', current: 100, available: 100,
      transactions: txns, observedAt: OBSERVED,
    })
    expect(s.postedOutflows).toEqual([{ amount: 1940.75, date: '2026-10-23' }])
  })

  it('flags card credits that Plaid categorised as card payments', () => {
    const s = cardSignalsFromPlaid({
      accountId: 'card1', plaidAccountId: 'p-card', debt: 2033.93,
      transactions: txns, observedAt: OBSERVED,
    })
    expect(s.credits).toEqual([
      { amount: 1940.75, date: '2026-10-23', pending: true, cardPayment: true },
    ])
  })

  it('reproduces the real case end to end: mislabelled posted debit + pending card payment', () => {
    const now = new Date('2026-10-23T22:00:00Z')
    const observedAt = '2026-10-23T21:30:00Z'
    const chk = cashSignalsFromPlaid({
      accountId: 'chk', plaidAccountId: 'p-chk', current: 1450.63, available: 1450.63,
      transactions: txns, observedAt,
    })
    const crd = cardSignalsFromPlaid({
      accountId: 'card1', plaidAccountId: 'p-card', debt: 2033.93,
      transactions: txns, observedAt,
    })
    expect(computeCardNetting([chk, crd], now).get('card1')).toBe(1940.75)
  })
})
