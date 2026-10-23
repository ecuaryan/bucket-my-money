import { describe, expect, it } from 'vitest'
import { formatJoinCode, normalizeJoinCode } from '@/lib/joinCode'

describe('normalizeJoinCode', () => {
  it.each([
    ['ABCDEFGHJKMN', 'ABCDEFGHJKMN'],
    ['abcd-efgh-jkmn', 'ABCDEFGHJKMN'],
    ['  ABCD EFGH JKMN\n', 'ABCDEFGHJKMN'],
    ['ABCD–EFGH_JKMN', 'ABCDEFGHJKMN'],
    ['ab23cd45', 'AB23CD45'],
    ['', ''],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeJoinCode(raw)).toBe(expected)
  })

  it('is idempotent and tolerates missing input', () => {
    const once = normalizeJoinCode('ab-cd 23')
    expect(normalizeJoinCode(once)).toBe(once)
    expect(normalizeJoinCode(undefined as unknown as string)).toBe('')
  })
})

describe('formatJoinCode', () => {
  it('groups new 12-character codes in fours', () => {
    expect(formatJoinCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN')
  })

  it('groups legacy 8-character and odd-length codes the same way', () => {
    expect(formatJoinCode('ABCD2345')).toBe('ABCD-2345')
    expect(formatJoinCode('ABCD234')).toBe('ABCD-234')
    expect(formatJoinCode('ABC')).toBe('ABC')
  })

  it('formats whatever shape it is given and round-trips through normalize', () => {
    expect(formatJoinCode('abcd-efgh jkmn')).toBe('ABCD-EFGH-JKMN')
    expect(normalizeJoinCode(formatJoinCode('ABCDEFGHJKMN'))).toBe('ABCDEFGHJKMN')
    expect(formatJoinCode('')).toBe('')
  })
})
