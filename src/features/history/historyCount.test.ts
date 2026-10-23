import { describe, expect, it } from 'vitest'
import { historyCountState } from './historyCount'

describe('historyCountState', () => {
  it('uses the exact total whenever it is known (remembered or fresh)', () => {
    expect(historyCountState(10, 342, true, false)).toEqual({ pending: false, count: 342, approximate: false })
  })

  it('is pending, not "10+", while the total loads and more rows exist', () => {
    expect(historyCountState(10, null, true, false)).toEqual({ pending: true })
  })

  it('shows the exact row count when the whole list fits on the first page', () => {
    expect(historyCountState(4, null, false, false)).toEqual({ pending: false, count: 4, approximate: false })
  })

  it('falls back to "at least N" if the count request finished without a total', () => {
    expect(historyCountState(10, null, true, true)).toEqual({ pending: false, count: 10, approximate: true })
  })
})
