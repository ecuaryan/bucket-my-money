import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllKidsPageCaches,
  readKidsPageCache,
  writeKidsPageCache,
  type KidsPageCache,
} from '@/lib/kidsPageCache'

const data = (): Omit<KidsPageCache, 'savedAt'> => ({
  children: [{ id: 'k1', name: 'Sam', role: 'child' }],
  accounts: [],
  balanceBreakdown: { float: 12.5 } as unknown as KidsPageCache['balanceBreakdown'],
  linkedChildIds: ['k1'],
  householdAdminName: 'Alex',
})

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.useRealTimers())

describe('kids page cache', () => {
  it('round-trips what the tab showed, including linked kids as a list', () => {
    writeKidsPageCache('fam', 'me', data())
    const cached = readKidsPageCache('fam', 'me')
    expect(cached?.children.map((c) => c.name)).toEqual(['Sam'])
    expect(cached?.linkedChildIds).toEqual(['k1'])
    expect(new Set(cached?.linkedChildIds).has('k1')).toBe(true)
    expect(cached?.balanceBreakdown.float).toBe(12.5)
    expect(cached?.householdAdminName).toBe('Alex')
  })

  it('is private to one member and one household', () => {
    writeKidsPageCache('fam', 'me', data())
    expect(readKidsPageCache('fam', 'someone-else')).toBeNull()
    expect(readKidsPageCache('other-fam', 'me')).toBeNull()
  })

  it('expires after five minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
    writeKidsPageCache('fam', 'me', data())
    vi.setSystemTime(new Date('2026-10-23T12:04:59Z'))
    expect(readKidsPageCache('fam', 'me')).not.toBeNull()
    vi.setSystemTime(new Date('2026-10-23T12:05:01Z'))
    expect(readKidsPageCache('fam', 'me')).toBeNull()
  })

  it('ignores corrupt or incomplete entries', () => {
    sessionStorage.setItem('bucketmymoney:kids:fam:me', '{not json')
    expect(readKidsPageCache('fam', 'me')).toBeNull()
    sessionStorage.setItem('bucketmymoney:kids:fam:me', JSON.stringify({ children: [], savedAt: Date.now() }))
    expect(readKidsPageCache('fam', 'me')).toBeNull()
  })

  it('is cleared on sign-out without touching other caches', () => {
    writeKidsPageCache('fam', 'me', data())
    sessionStorage.setItem('bucketmymoney:buckets:fam:me', '{"keep":"me"}')
    clearAllKidsPageCaches()
    expect(readKidsPageCache('fam', 'me')).toBeNull()
    expect(sessionStorage.getItem('bucketmymoney:buckets:fam:me')).toBe('{"keep":"me"}')
  })
})
