import { describe, expect, it } from 'vitest'
import { mapPlaidTransactionDetails } from '../../supabase/functions/_shared/plaidTransactionDetails'
import {
  humanizeCategory,
  isExpandable,
  transactionDetailRows,
} from '@/lib/bankTransactionDetails'

const base = { amount: 12.5, date: '2026-10-21' }

describe('mapPlaidTransactionDetails', () => {
  it('keeps only what Plaid returned and drops blanks', () => {
    expect(mapPlaidTransactionDetails({ ...base, name: 'STARBUCKS' }, 'Starbucks')).toEqual({})
    expect(
      mapPlaidTransactionDetails(
        { ...base, merchant_name: '  ', location: { city: ' ', region: null } },
        'Transaction',
      ),
    ).toEqual({})
  })

  it('surfaces the raw statement text when it says more than the label', () => {
    const d = mapPlaidTransactionDetails(
      { ...base, name: 'Starbucks', original_description: 'STARBUCKS #1234 AUSTIN TX' },
      'Starbucks',
    )
    expect(d.description).toBe('STARBUCKS #1234 AUSTIN TX')
    // Same as the label → nothing new to show.
    expect(
      mapPlaidTransactionDetails({ ...base, name: 'Rent', original_description: 'rent' }, 'Rent'),
    ).toEqual({})
  })

  it('maps category, channel, counterparty, place, dates and payment meta', () => {
    const d = mapPlaidTransactionDetails(
      {
        ...base,
        authorized_date: '2026-10-20',
        payment_channel: 'in store',
        personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
        counterparties: [{ name: ' ', type: 'x' }, { name: 'Starbucks', type: 'merchant' }],
        location: { city: 'Austin', region: 'TX', country: 'US' },
        check_number: '1042',
        payment_meta: { reference_number: 'R-9', payee: 'Pat', reason: 'Lunch' },
        iso_currency_code: 'CAD',
      },
      'Starbucks',
    )
    expect(d).toEqual({
      authorizedDate: '2026-10-20',
      paymentChannel: 'in store',
      category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
      counterparty: { name: 'Starbucks', type: 'merchant' },
      location: 'Austin, TX',
      checkNumber: '1042',
      reference: 'R-9',
      payee: 'Pat',
      reason: 'Lunch',
      currency: 'CAD',
    })
  })

  it('omits USD and a same-day authorization, and shows a foreign country', () => {
    const d = mapPlaidTransactionDetails(
      {
        ...base,
        authorized_date: '2026-10-21',
        iso_currency_code: 'usd',
        location: { city: 'Toronto', region: 'ON', country: 'CA' },
      },
      'x',
    )
    expect(d.authorizedDate).toBeUndefined()
    expect(d.currency).toBeUndefined()
    expect(d.location).toBe('Toronto, ON, CA')
  })
})

describe('humanizeCategory', () => {
  it('strips the repeated primary prefix and reads naturally', () => {
    expect(humanizeCategory('LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')).toBe(
      'Loan payments › Credit card payment',
    )
    expect(humanizeCategory('FOOD_AND_DRINK', null)).toBe('Food and drink')
    expect(humanizeCategory(null, 'GENERAL_MERCHANDISE_BOOKSTORES')).toBe(
      'General merchandise bookstores',
    )
    expect(humanizeCategory(null, null)).toBeNull()
  })
})

describe('transactionDetailRows', () => {
  const fmt = (d: string) => `<${d}>`

  it('builds labelled rows and skips what is redundant', () => {
    const rows = transactionDetailRows(
      {
        label: 'Starbucks',
        status: 'posted',
        date: '2026-10-21',
        details: {
          description: 'STARBUCKS #1234',
          category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
          counterparty: { name: 'Starbucks', type: 'merchant' },
          paymentChannel: 'in store',
          authorizedDate: '2026-10-20',
        },
      },
      fmt,
    )
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Description', 'STARBUCKS #1234'],
      ['Category', 'Food and drink › Coffee'],
      ['With', 'Merchant'], // same name as the label → just the kind
      ['Paid', 'In store'],
      ['Authorized', '<2026-10-20>'],
      ['Posted', '<2026-10-21>'],
    ])
  })

  it('is empty — and not expandable — with no details', () => {
    const row = { label: 'x', status: 'pending' as const, date: '2026-10-21' }
    expect(transactionDetailRows(row, fmt)).toEqual([])
    expect(isExpandable(row)).toBe(false)
    expect(isExpandable({ ...row, details: {} })).toBe(false)
    expect(isExpandable({ ...row, details: { location: 'Austin, TX' } })).toBe(true)
  })
})
