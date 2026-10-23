import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllHistoryPageCaches,
  readHistoryPageCache,
  writeHistoryPageCache,
} from '@/lib/historyPageCache'
import { applyHistoryHeadRefresh, type HistoryTxRow } from '@/features/history/historyQueries'

const row = (id: string, createdAt: string): HistoryTxRow =>
  ({ id, created_at: createdAt, type: 'give', amount: 5 }) as unknown as HistoryTxRow

const OLDER = row('00000000-0000-4000-8000-000000000001', '2026-10-20T10:00:00Z')
const NEWER = row('00000000-0000-4000-8000-000000000002', '2026-10-21T10:00:00Z')
const NEWEST = row('00000000-0000-4000-8000-000000000003', '2026-10-22T10:00:00Z')

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.useRealTimers())

describe('history page cache', () => {
  it('round-trips the first page, total and hasMore', () => {
    writeHistoryPageCache('fam', 'me', 'all', { rows: [NEWER, OLDER], total: 12, hasMore: true })
    const cached = readHistoryPageCache('fam', 'me', 'all')
    expect(cached?.rows.map((r) => r.id)).toEqual([NEWER.id, OLDER.id])
    expect(cached?.total).toBe(12)
    expect(cached?.hasMore).toBe(true)
  })

  it('is private to one member and one filter', () => {
    writeHistoryPageCache('fam', 'me', 'all', { rows: [NEWER], total: 1, hasMore: false })
    expect(readHistoryPageCache('fam', 'someone-else', 'all')).toBeNull() // a kid sees different rows
    expect(readHistoryPageCache('other-fam', 'me', 'all')).toBeNull()
    expect(readHistoryPageCache('fam', 'me', 'give=1')).toBeNull()
  })

  it('expires after five minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
    writeHistoryPageCache('fam', 'me', 'all', { rows: [NEWER], total: 1, hasMore: false })
    vi.setSystemTime(new Date('2026-10-23T12:04:59Z'))
    expect(readHistoryPageCache('fam', 'me', 'all')).not.toBeNull()
    vi.setSystemTime(new Date('2026-10-23T12:05:01Z'))
    expect(readHistoryPageCache('fam', 'me', 'all')).toBeNull()
  })

  it('ignores empty or corrupt entries', () => {
    writeHistoryPageCache('fam', 'me', 'all', { rows: [], total: 0, hasMore: false })
    expect(readHistoryPageCache('fam', 'me', 'all')).toBeNull()
    sessionStorage.setItem('bucketmymoney:history:fam:me:all', '{not json')
    expect(readHistoryPageCache('fam', 'me', 'all')).toBeNull()
  })

  it('clearing on sign-out removes history entries only', () => {
    writeHistoryPageCache('fam', 'me', 'all', { rows: [NEWER], total: 1, hasMore: false })
    writeHistoryPageCache('fam', 'me', 'give=1', { rows: [NEWER], total: 1, hasMore: false })
    sessionStorage.setItem('bucketmymoney:buckets:fam:me', '{"keep":"me"}')
    clearAllHistoryPageCaches()
    expect(readHistoryPageCache('fam', 'me', 'all')).toBeNull()
    expect(readHistoryPageCache('fam', 'me', 'give=1')).toBeNull()
    expect(sessionStorage.getItem('bucketmymoney:buckets:fam:me')).toBe('{"keep":"me"}')
  })
})

describe('a transfer made while you were away', () => {
  it('shows up (animated in) when you return, over the cached rows', () => {
    // You leave History: the first page is remembered.
    writeHistoryPageCache('fam', 'me', 'all', { rows: [NEWER, OLDER], total: 2, hasMore: false })

    // Your wife makes a transfer. You come back: cache shows instantly...
    const cached = readHistoryPageCache('fam', 'me', 'all')!
    expect(cached.rows.map((r) => r.id)).toEqual([NEWER.id, OLDER.id])

    // ...then the fresh page arrives and merges over it.
    const fresh = [NEWEST, NEWER, OLDER]
    const applied = applyHistoryHeadRefresh(cached.rows, fresh)
    expect(applied.rows.map((r) => r.id)).toEqual([NEWEST.id, NEWER.id, OLDER.id])
    expect(applied.newlyArrivedIds).toEqual([NEWEST.id])
    expect(applied.rows.filter((r) => r.justArrived).map((r) => r.id)).toEqual([NEWEST.id])
  })

  it('leaves the list alone when nothing new happened', () => {
    const applied = applyHistoryHeadRefresh([NEWER, OLDER], [NEWER, OLDER])
    expect(applied.newlyArrivedIds).toEqual([])
    expect(applied.rows.some((r) => r.justArrived)).toBe(false)
  })
})
