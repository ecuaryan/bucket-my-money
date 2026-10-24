import { describe, expect, it } from 'vitest'
import type { BucketsBalanceBreakdown } from '@/lib/availableBalance'
import {
  buildFloatLines,
  formatBucketsHeaderSubtitle,
  formatFloatCashSubtext,
  formatFloatSummary,
  floatSummary,
  mayBeCardPaymentLag,
} from '@/lib/floatBreakdown'

const fmt = (n: number) => `$${n.toFixed(2)}`

function adultBreakdown(
  overrides: Partial<BucketsBalanceBreakdown> = {},
): BucketsBalanceBreakdown {
  const totalCash = overrides.totalCash ?? 1000
  const bankCash = overrides.bankCash ?? totalCash
  const manualCash = overrides.manualCash ?? 0
  return {
    float: 100,
    totalCash,
    bankCash,
    manualCash,
    cardDebt: 0,
    cardPendingPayments: 0,
    bucketAllocated: 500,
    childrenSetAside: 50,
    children: [
      { memberId: 'c1', name: 'Adri', amount: 30 },
      { memberId: 'c2', name: 'Jake', amount: 20 },
    ],
    bankLastSyncedAt: null,
    hasLinkedBank: false,
    ...overrides,
  }
}

describe('buildFloatLines', () => {
  it('builds adult lines with grouped children subtotal', () => {
    const lines = buildFloatLines(adultBreakdown(), {
      isChild: false,
      cashAccountsCount: 3,
      bankAccountsCount: 3,
      manualAccountsCount: 0,
      childTotal: 0,
    })
    expect(lines.map((l) => l.label)).toEqual([
      'Linked cash (3 accounts)',
      'Allocated to buckets',
      'Set aside for kids',
      'Adri',
      'Jake',
    ])
    expect(lines[2].amount).toBe(50)
    expect(lines[3].indent).toBe(true)
    expect(lines[4].indent).toBe(true)
  })

  it('omits children subtotal when there are no children', () => {
    const lines = buildFloatLines(
      adultBreakdown({ children: [], childrenSetAside: 0 }),
      { isChild: false, cashAccountsCount: 1, bankAccountsCount: 1, manualAccountsCount: 0, childTotal: 0 },
    )
    expect(lines.map((l) => l.label)).toEqual([
      'Linked cash (1 account)',
      'Allocated to buckets',
    ])
  })

  it('splits bank and manual cash when both are present', () => {
    const lines = buildFloatLines(
      adultBreakdown({ totalCash: 5000, bankCash: 3000, manualCash: 2000 }),
      {
        isChild: false,
        cashAccountsCount: 3,
        bankAccountsCount: 2,
        manualAccountsCount: 1,
        childTotal: 0,
      },
    )
    expect(lines.map((l) => l.label)).toEqual([
      'Linked cash (2 accounts)',
      'Manual cash',
      'Allocated to buckets',
      'Set aside for kids',
      'Adri',
      'Jake',
    ])
  })

  it('labels manual-only cash as plain "Cash"', () => {
    const lines = buildFloatLines(
      adultBreakdown({
        totalCash: 1100,
        bankCash: 0,
        manualCash: 1100,
        children: [],
        childrenSetAside: 0,
      }),
      {
        isChild: false,
        cashAccountsCount: 2,
        bankAccountsCount: 0,
        manualAccountsCount: 2,
        childTotal: 0,
      },
    )
    expect(lines.map((l) => l.label)).toEqual([
      'Cash (2 sources)',
      'Allocated to buckets',
    ])
  })

  it('subtracts credit cards between cash and allocations', () => {
    const lines = buildFloatLines(
      adultBreakdown({ cardDebt: 1200, children: [], childrenSetAside: 0 }),
      {
        isChild: false,
        cashAccountsCount: 1,
        bankAccountsCount: 1,
        manualAccountsCount: 0,
        childTotal: 0,
      },
    )
    expect(lines.map((l) => l.label)).toEqual([
      'Linked cash (1 account)',
      'Credit cards',
      'Allocated to buckets',
    ])
    const cardLine = lines[1]
    expect(cardLine.amount).toBe(1200)
    expect(cardLine.kind).toBe('subtract')
  })

  it('omits allocated line when bucketAllocated is zero', () => {
    const lines = buildFloatLines(
      adultBreakdown({ bucketAllocated: 0 }),
      { isChild: false, cashAccountsCount: 0, bankAccountsCount: 0, manualAccountsCount: 0, childTotal: 0 },
    )
    expect(lines.some((l) => l.label === 'Allocated to buckets')).toBe(false)
  })

  it('builds child lines', () => {
    const lines = buildFloatLines(
      adultBreakdown({ bucketAllocated: 25 }),
      { isChild: true, cashAccountsCount: 0, bankAccountsCount: 0, manualAccountsCount: 0, childTotal: 100 },
    )
    expect(lines.map((l) => l.label)).toEqual([
      'Total balance',
      'In your buckets',
    ])
  })

  it('lists zero-balance children on the adult breakdown', () => {
    const lines = buildFloatLines(
      adultBreakdown({
        childrenSetAside: 0,
        children: [
          { memberId: 'c1', name: 'Adri', amount: 0 },
          { memberId: 'c2', name: 'Jake', amount: 0 },
        ],
      }),
      {
        isChild: false,
        cashAccountsCount: 1,
        bankAccountsCount: 1,
        manualAccountsCount: 0,
        childTotal: 0,
      },
    )
    expect(lines.map((l) => l.label)).toEqual([
      'Linked cash (1 account)',
      'Allocated to buckets',
      'Set aside for kids',
      'Adri',
      'Jake',
    ])
    expect(lines[2].amount).toBe(0)
    expect(lines[3].amount).toBe(0)
    expect(lines[4].amount).toBe(0)
  })
})

describe('floatSummary', () => {
  it('formats adult linked cash with account count', () => {
    const summary = floatSummary(adultBreakdown(), {
      isChild: false,
      cashAccountsCount: 14,
      bankAccountsCount: 14,
      manualAccountsCount: 0,
      childTotal: 0,
    })
    expect(summary).not.toBeNull()
    expect(formatFloatSummary(summary!, fmt)).toBe(
      '$1000.00 across 14 money sources',
    )
  })

  it('formats child total balance', () => {
    const summary = floatSummary(adultBreakdown(), {
      isChild: true,
      cashAccountsCount: 0,
      bankAccountsCount: 0,
      manualAccountsCount: 0,
      childTotal: 75,
    })
    expect(formatFloatSummary(summary!, fmt)).toBe('Total balance: $75.00')
  })

  it('summarizes manual-only cash without "linked"', () => {
    const summary = floatSummary(
      adultBreakdown({ totalCash: 1100, bankCash: 0, manualCash: 1100 }),
      {
        isChild: false,
        cashAccountsCount: 2,
        bankAccountsCount: 0,
        manualAccountsCount: 2,
        childTotal: 0,
      },
    )
    expect(formatFloatSummary(summary!, fmt)).toBe(
      '$1100.00 across 2 money sources',
    )
  })

  it('summarizes a single money source with count', () => {
    const summary = floatSummary(
      adultBreakdown({ totalCash: 1000, bankCash: 0, manualCash: 1000 }),
      {
        isChild: false,
        cashAccountsCount: 1,
        bankAccountsCount: 0,
        manualAccountsCount: 1,
        childTotal: 0,
      },
    )
    expect(formatFloatSummary(summary!, fmt)).toBe(
      '$1000.00 across 1 money source',
    )
  })

  it('summarizes mixed linked and manual sources with total count', () => {
    const summary = floatSummary(
      adultBreakdown({ totalCash: 5000, bankCash: 3000, manualCash: 2000 }),
      {
        isChild: false,
        cashAccountsCount: 3,
        bankAccountsCount: 2,
        manualAccountsCount: 1,
        childTotal: 0,
      },
    )
    expect(formatFloatSummary(summary!, fmt)).toBe(
      '$5000.00 across 3 money sources',
    )
  })
})

describe('formatFloatCashSubtext', () => {
  it('formats mixed linked and manual cash for adults', () => {
    const text = formatFloatCashSubtext(
      adultBreakdown({ totalCash: 5000, bankCash: 3000, manualCash: 2000 }),
      {
        isChild: false,
        cashAccountsCount: 3,
        bankAccountsCount: 2,
        manualAccountsCount: 1,
        childTotal: 0,
      },
      fmt,
    )
    expect(text).toBe('$3000.00 linked · $2000.00 manual')
  })

  it('appends the card clause when the household owes on cards', () => {
    const text = formatFloatCashSubtext(
      adultBreakdown({ totalCash: 5000, bankCash: 3000, manualCash: 2000, cardDebt: 1200 }),
      {
        isChild: false,
        cashAccountsCount: 3,
        bankAccountsCount: 2,
        manualAccountsCount: 1,
        childTotal: 0,
      },
      fmt,
    )
    expect(text).toBe('$3000.00 linked · $2000.00 manual · $1200.00 owed on cards')
  })

  it('says so when a card payment is already in progress', () => {
    const text = formatFloatCashSubtext(
      adultBreakdown({
        totalCash: 5000,
        bankCash: 5000,
        manualCash: 0,
        cardDebt: 900,
        cardPendingPayments: 300,
      }),
      {
        isChild: false,
        cashAccountsCount: 2,
        bankAccountsCount: 2,
        manualAccountsCount: 0,
        childTotal: 0,
      },
      fmt,
    )
    expect(text).toBe(
      '$5000.00 across 2 money sources · $900.00 owed on cards after pending $300.00 payment',
    )
  })

  it('appends the card clause to a single-source summary', () => {
    const text = formatFloatCashSubtext(
      adultBreakdown({ totalCash: 5000, bankCash: 5000, manualCash: 0, cardDebt: 850 }),
      {
        isChild: false,
        cashAccountsCount: 2,
        bankAccountsCount: 2,
        manualAccountsCount: 0,
        childTotal: 0,
      },
      fmt,
    )
    expect(text).toBe('$5000.00 across 2 money sources · $850.00 owed on cards')
  })

  it('formats child linked account subtext', () => {
    const text = formatFloatCashSubtext(
      adultBreakdown({ bankCash: 130.7, totalCash: 130.7 }),
      {
        isChild: true,
        cashAccountsCount: 1,
        bankAccountsCount: 1,
        manualAccountsCount: 0,
        childTotal: 130.7,
      },
      fmt,
    )
    expect(text).toBe('$130.70 across linked account')
  })
})

describe('formatBucketsHeaderSubtitle', () => {
  it('shows count only when nothing is allocated', () => {
    expect(formatBucketsHeaderSubtitle(3, 0, fmt)).toBe('3 buckets')
  })

  it('appends allocated total when positive', () => {
    expect(formatBucketsHeaderSubtitle(31, 50825.3, fmt)).toBe(
      '31 buckets · $50825.30 allocated',
    )
  })
})

describe('mayBeCardPaymentLag', () => {
  const cards = { cardDebt: 2000, cardPendingPayments: 0 }

  it('is true when red, a card is counted, and the shortfall fits within the card debt', () => {
    expect(mayBeCardPaymentLag(-307.06, cards)).toBe(true)
    expect(mayBeCardPaymentLag(-2000, cards)).toBe(true)
  })

  it('is false when Unbucketed is not negative', () => {
    expect(mayBeCardPaymentLag(0, cards)).toBe(false)
    expect(mayBeCardPaymentLag(150, cards)).toBe(false)
  })

  it('is false without a card', () => {
    expect(mayBeCardPaymentLag(-307.06, { cardDebt: 0, cardPendingPayments: 0 })).toBe(false)
  })

  it('is false when the shortfall is bigger than the card debt (over-bucketed, not a payment)', () => {
    expect(mayBeCardPaymentLag(-2000.01, cards)).toBe(false)
  })

  it('is false when a payment is already being counted as paid', () => {
    expect(mayBeCardPaymentLag(-307.06, { cardDebt: 2000, cardPendingPayments: 500 })).toBe(false)
  })
})
