import { describe, expect, it } from 'vitest'
import { MONEY_SAVE_UNCONFIRMED } from '@/lib/brand'
import { requireTransactionId } from '@/lib/rpcResult'

describe('requireTransactionId', () => {
  it('returns a transaction id', () => {
    const id = '5b1d4f0e-6f0a-4c63-9d3b-0a4f7f6a1c11'
    expect(requireTransactionId(id)).toBe(id)
  })

  it.each([
    ['null (empty body)', null],
    ['undefined', undefined],
    ['empty array (404 JSON body)', []],
    ['empty string', ''],
    ['whitespace', '  '],
    ['object', {}],
    ['number', 1],
  ])('throws on %s', (_label, value) => {
    expect(() => requireTransactionId(value)).toThrow(MONEY_SAVE_UNCONFIRMED)
  })
})
