import { describe, expect, it } from 'vitest'
import {
  accountAssignmentChildId,
  bankAccountOwnerTag,
  isCashAccount,
  isCreditCardAccount,
  isFamilyPoolAccount,
  isManualAccount,
  latestCashSyncAt,
  cardPendingPayment,
  sumCardDebt,
  sumCardPendingPayments,
  sumCashBalance,
} from '@/lib/accounts'
import type { Database } from '@/types/database'

type Account = Database['public']['Tables']['accounts']['Row']

function account(
  overrides: Partial<Account> & Pick<Account, 'current_balance'>,
): Account {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    family_id: '00000000-0000-4000-8000-000000000099',
    teller_account_id: 'acc_test',
    teller_enrollment_id: null,
    account_type: 'checking',
    owner_member_id: null,
    institution_name: null,
    account_name: null,
    last_synced_at: null,
    created_at: '2026-01-01T00:00:00Z',
    source: 'teller',
    ...overrides,
  }
}

describe('isCashAccount', () => {
  it('treats checking, savings, and manual as cash', () => {
    expect(isCashAccount({ account_type: 'checking' })).toBe(true)
    expect(isCashAccount({ account_type: 'SAVINGS' })).toBe(true)
    expect(isCashAccount({ account_type: 'manual' })).toBe(true)
  })

  it('excludes credit cards and unknown types', () => {
    expect(isCashAccount({ account_type: 'credit_card' })).toBe(false)
    expect(isCashAccount({ account_type: 'loan' })).toBe(false)
    expect(isCashAccount({ account_type: null })).toBe(false)
  })
})

describe('isCreditCardAccount', () => {
  it('recognizes credit_card in any case and nothing else', () => {
    expect(isCreditCardAccount({ account_type: 'credit_card' })).toBe(true)
    expect(isCreditCardAccount({ account_type: 'CREDIT_CARD' })).toBe(true)
    expect(isCreditCardAccount({ account_type: 'checking' })).toBe(false)
    expect(isCreditCardAccount({ account_type: 'loan' })).toBe(false)
    expect(isCreditCardAccount({ account_type: null })).toBe(false)
  })
})

describe('sumCardDebt', () => {
  it('sums only credit-card balances, linked or manual', () => {
    const total = sumCardDebt([
      account({ current_balance: 100, account_type: 'checking' }),
      account({ current_balance: 1200, account_type: 'credit_card' }),
      account({
        current_balance: 300,
        account_type: 'credit_card',
        source: 'manual',
      }),
      account({ current_balance: 999, account_type: 'loan' }),
    ])
    expect(total).toBe(1500)
  })

  it('lets a refund credit go negative (bank owes the household)', () => {
    const total = sumCardDebt([
      account({ current_balance: -45, account_type: 'credit_card' }),
    ])
    expect(total).toBe(-45)
  })
})

describe('pending card payments', () => {
  const card = (balance: number, pending: number) =>
    account({
      current_balance: balance,
      account_type: 'credit_card',
      pending_payment_credit: pending,
    })

  it('nets a payment already in flight from the debt the ledger subtracts', () => {
    expect(sumCardDebt([card(1200, 300)])).toBe(900)
    expect(sumCardPendingPayments([card(1200, 300)])).toBe(300)
  })

  it('never nets more than is owed, and leaves a credit balance alone', () => {
    expect(cardPendingPayment(card(400, 900))).toBe(400)
    expect(sumCardDebt([card(400, 900)])).toBe(0)
    expect(sumCardDebt([card(-45, 100)])).toBe(-45)
  })

  it('is a no-op with no pending credit (default)', () => {
    expect(sumCardDebt([card(1200, 0)])).toBe(1200)
    expect(sumCardPendingPayments([card(1200, 0)])).toBe(0)
  })
})

describe('bankAccountOwnerTag', () => {
  const roles = new Map([
    ['admin-id', 'admin'],
    ['kaycee-id', 'child'],
  ])
  const names = new Map([
    ['admin-id', 'Dad'],
    ['kaycee-id', 'Kaycee'],
  ])
  const opts = { sharedLabel: 'Shared', fallbackName: 'Family member' }

  it('tags a family-pool account as Shared', () => {
    expect(
      bankAccountOwnerTag({ owner_member_id: null }, roles, names, 'admin-id', opts),
    ).toEqual({ kind: 'shared', label: 'Shared' })
  })

  it('tags an adult-owned (legacy) account as Shared', () => {
    expect(
      bankAccountOwnerTag(
        { owner_member_id: 'admin-id' },
        roles,
        names,
        'kaycee-id',
        opts,
      ),
    ).toEqual({ kind: 'shared', label: 'Shared' })
  })

  it("labels another member's account with their name", () => {
    expect(
      bankAccountOwnerTag(
        { owner_member_id: 'kaycee-id' },
        roles,
        names,
        'admin-id',
        opts,
      ),
    ).toEqual({ kind: 'member', label: 'Kaycee' })
  })

  it('returns null for the viewer’s own account (no tag needed)', () => {
    expect(
      bankAccountOwnerTag(
        { owner_member_id: 'kaycee-id' },
        roles,
        names,
        'kaycee-id',
        opts,
      ),
    ).toBeNull()
  })

  it('falls back when the name map is not loaded yet', () => {
    expect(
      bankAccountOwnerTag(
        { owner_member_id: 'kaycee-id' },
        new Map(),
        new Map(),
        'admin-id',
        opts,
      ),
    ).toEqual({ kind: 'member', label: 'Family member' })
  })
})

describe('account assignment helpers', () => {
  const roles = new Map([
    ['admin-id', 'admin'],
    ['child-id', 'child'],
  ])

  it('treats null and adult owners as family pool', () => {
    expect(isFamilyPoolAccount({ owner_member_id: null }, roles)).toBe(true)
    expect(isFamilyPoolAccount({ owner_member_id: 'admin-id' }, roles)).toBe(
      true,
    )
    expect(isFamilyPoolAccount({ owner_member_id: 'child-id' }, roles)).toBe(
      false,
    )
  })

  it('returns child id only for child-owned accounts', () => {
    expect(
      accountAssignmentChildId({ owner_member_id: null }, roles),
    ).toBeNull()
    expect(
      accountAssignmentChildId({ owner_member_id: 'admin-id' }, roles),
    ).toBeNull()
    expect(
      accountAssignmentChildId({ owner_member_id: 'child-id' }, roles),
    ).toBe('child-id')
  })
})

describe('isManualAccount', () => {
  it('detects manual money sources', () => {
    expect(isManualAccount({ source: 'manual' })).toBe(true)
    expect(isManualAccount({ source: 'teller' })).toBe(false)
  })
})

describe('sumCashBalance', () => {
  it('sums only cash subtypes', () => {
    const total = sumCashBalance([
      account({ current_balance: 100, account_type: 'checking' }),
      account({ current_balance: 50, account_type: 'savings' }),
      account({ current_balance: 999, account_type: 'credit_card' }),
    ])
    expect(total).toBe(150)
  })

  it('includes manual account_type in the total', () => {
    const total = sumCashBalance([
      account({ current_balance: 200, account_type: 'manual', source: 'manual' }),
    ])
    expect(total).toBe(200)
  })
})

describe('latestCashSyncAt', () => {
  it('returns the newest sync time among cash accounts', () => {
    const latest = latestCashSyncAt([
      account({ current_balance: 10, last_synced_at: '2026-05-01T00:00:00Z' }),
      account({ current_balance: 10, last_synced_at: '2026-06-01T08:30:00Z' }),
      account({ current_balance: 10, last_synced_at: '2026-04-15T00:00:00Z' }),
    ])
    expect(latest).toBe('2026-06-01T08:30:00Z')
  })

  it('ignores non-cash accounts even if synced more recently', () => {
    const latest = latestCashSyncAt([
      account({ current_balance: 10, last_synced_at: '2026-05-01T00:00:00Z' }),
      account({
        current_balance: 10,
        account_type: 'credit_card',
        last_synced_at: '2026-06-01T00:00:00Z',
      }),
    ])
    expect(latest).toBe('2026-05-01T00:00:00Z')
  })

  it('returns null when no cash account has synced', () => {
    expect(latestCashSyncAt([])).toBeNull()
    expect(
      latestCashSyncAt([account({ current_balance: 10, last_synced_at: null })]),
    ).toBeNull()
  })
})
