import { describe, expect, it } from 'vitest'
import { institutionKey, moveKey, sortByBankOrder } from '@/lib/bankOrder'

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

describe('moveKey / institutionKey', () => {
  it('moves a key and leaves out-of-range moves alone', () => {
    const keys = ['a', 'b', 'c']
    expect(moveKey(keys, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveKey(keys, 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveKey(keys, 0, -1)).toBe(keys)
    expect(moveKey(keys, 1, 1)).toBe(keys)
  })

  it('keys by lower-cased name with a Bank fallback', () => {
    expect(institutionKey('Ally Bank')).toBe('ally bank')
    expect(institutionKey(null)).toBe('bank')
  })
})
