import { describe, expect, it } from 'vitest'
import {
  BANK_GROUP_CARDS_KEY,
  BANK_GROUP_CASH_KEY,
  groupBankAccounts,
  moveKey,
  sortByBankOrder,
} from '@/lib/bankOrder'

const items = ['chase', 'ally', 'fidelity'].map((key) => ({ key }))

describe('sortByBankOrder', () => {
  it('keeps first-seen order with no saved order', () => {
    expect(sortByBankOrder(items, []).map((i) => i.key)).toEqual([
      'chase',
      'ally',
      'fidelity',
    ])
  })

  it('applies the saved order and puts unknown institutions last', () => {
    expect(
      sortByBankOrder(items, ['fidelity', 'chase']).map((i) => i.key),
    ).toEqual(['fidelity', 'chase', 'ally'])
  })

  it('ignores saved keys that no longer exist', () => {
    expect(sortByBankOrder(items, ['gone', 'ally']).map((i) => i.key)).toEqual([
      'ally',
      'chase',
      'fidelity',
    ])
  })
})

describe('moveKey', () => {
  it('moves a key and leaves out-of-range moves alone', () => {
    const keys = ['a', 'b', 'c']
    expect(moveKey(keys, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveKey(keys, 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveKey(keys, 0, -1)).toBe(keys)
    expect(moveKey(keys, 1, 1)).toBe(keys)
  })
})

describe('groupBankAccounts', () => {
  const acct = (
    account_name: string,
    current_balance: number,
    institution_name: string,
    account_type: string | null = 'checking',
  ) => ({ account_name, current_balance, institution_name, account_type })

  it('puts cards first, each group largest balance first', () => {
    const groups = groupBankAccounts([
      acct('Checking', 0, 'X Money'),
      acct('Card', 681.28, 'Robinhood', 'credit_card'),
      acct('Joint', 44695.03, 'X Money'),
      acct('Savings', 2985.67, 'Ally Bank'),
      acct('Big card', 1200, 'Chase', 'credit_card'),
    ])
    expect(groups.map((g) => g.key)).toEqual([
      BANK_GROUP_CARDS_KEY,
      BANK_GROUP_CASH_KEY,
    ])
    expect(groups[0].accounts.map((a) => a.account_name)).toEqual([
      'Big card',
      'Card',
    ])
    expect(groups[1].accounts.map((a) => a.account_name)).toEqual([
      'Joint',
      'Savings',
      'Checking',
    ])
  })

  it('breaks balance ties by bank, then account name', () => {
    const [cash] = groupBankAccounts([
      acct('Savings', 0, 'Robinhood'),
      acct('Checking', 0, 'X Money'),
      acct('Checking', 0, 'Robinhood'),
    ])
    expect(
      cash.accounts.map((a) => `${a.institution_name} ${a.account_name}`),
    ).toEqual(['Robinhood Checking', 'Robinhood Savings', 'X Money Checking'])
  })

  it('leaves out an empty group', () => {
    expect(
      groupBankAccounts([acct('Checking', 10, 'Ally')]).map((g) => g.key),
    ).toEqual([BANK_GROUP_CASH_KEY])
    expect(groupBankAccounts([])).toEqual([])
  })
})
