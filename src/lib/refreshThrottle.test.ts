import { describe, expect, it } from 'vitest'
import {
  REFRESH_THROTTLE_MS,
  itemsDueForRefresh,
  shouldSkipRefresh,
} from '../../supabase/functions/_shared/refreshThrottle'

describe('shouldSkipRefresh', () => {
  const now = Date.parse('2026-06-01T12:00:00Z')

  it('allows refresh when never synced', () => {
    expect(shouldSkipRefresh(null, now)).toBe(false)
  })

  it('skips when synced within the throttle window', () => {
    const thirtySecondsAgo = now - 30_000
    expect(shouldSkipRefresh(thirtySecondsAgo, now)).toBe(true)
  })

  it('allows refresh when synced outside the throttle window', () => {
    const twoMinutesAgo = now - 120_000
    expect(shouldSkipRefresh(twoMinutesAgo, now)).toBe(false)
  })

  it('skips just inside the throttle window', () => {
    const inside = now - REFRESH_THROTTLE_MS + 1
    expect(shouldSkipRefresh(inside, now)).toBe(true)
  })

  it('allows at exactly the throttle window age', () => {
    const atWindow = now - REFRESH_THROTTLE_MS
    expect(shouldSkipRefresh(atWindow, now)).toBe(false)
  })
})

describe('itemsDueForRefresh', () => {
  const now = Date.parse('2026-06-01T12:00:00Z')
  const window = 30 * 60_000
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('keeps a failed bank retryable while a sibling bank is fresh', () => {
    const fresh = { id: 'ally', last_synced_at: ago(60_000) }
    const failedEarlier = { id: 'robinhood', last_synced_at: ago(3 * 60 * 60_000) }
    expect(itemsDueForRefresh([fresh, failedEarlier], now, window)).toEqual([failedEarlier])
  })

  it('treats a never-synced bank as due', () => {
    const never = { id: 'new', last_synced_at: null }
    expect(itemsDueForRefresh([never], now, window)).toEqual([never])
  })

  it('returns nothing when every bank synced within the window', () => {
    const items = [
      { id: 'a', last_synced_at: ago(1_000) },
      { id: 'b', last_synced_at: ago(window - 1) },
    ]
    expect(itemsDueForRefresh(items, now, window)).toEqual([])
  })
})
