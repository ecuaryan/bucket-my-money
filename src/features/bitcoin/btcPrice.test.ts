import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBtcSpotPrice, resetBtcPriceCacheForTests } from './btcPrice'

function spotResponse(usd: number): Response {
  return new Response(JSON.stringify({ time: 1794019503, USD: usd, EUR: 1 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('getBtcSpotPrice', () => {
  beforeEach(() => {
    resetBtcPriceCacheForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('fetches and parses the mempool.space USD price', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(spotResponse(67123.45))

    const result = await getBtcSpotPrice()
    expect(result).toMatchObject({ status: 'ready', usd: 67123.45 })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      'mempool.space/api/v1/prices',
    )
  })

  it('serves the cache inside the TTL and refetches after it expires', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(spotResponse(50000))

    await getBtcSpotPrice()
    await getBtcSpotPrice()
    expect(fetchMock).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(3 * 60_000 + 1)
    fetchMock.mockResolvedValue(spotResponse(51000))
    const result = await getBtcSpotPrice()
    expect(result).toMatchObject({ status: 'ready', usd: 51000 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('force refetches even inside the TTL', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(spotResponse(50000))

    await getBtcSpotPrice()
    fetchMock.mockResolvedValue(spotResponse(52000))
    const result = await getBtcSpotPrice({ force: true })
    expect(result).toMatchObject({ status: 'ready', usd: 52000 })
  })

  it('dedupes concurrent requests into one fetch', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(spotResponse(50000))

    const [a, b] = await Promise.all([getBtcSpotPrice(), getBtcSpotPrice()])
    expect(a).toEqual(b)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns the stale price when a refresh fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(spotResponse(50000))

    await getBtcSpotPrice()
    vi.advanceTimersByTime(3 * 60_000 + 1)
    fetchMock.mockRejectedValue(new Error('network down'))

    const result = await getBtcSpotPrice()
    expect(result).toMatchObject({ status: 'ready', usd: 50000 })
  })

  it('is unavailable when there has never been a good fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await getBtcSpotPrice()).toEqual({ status: 'unavailable' })
  })

  it('is unavailable on malformed or non-OK responses', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"EUR":1}', { status: 200 }))
    expect(await getBtcSpotPrice()).toEqual({ status: 'unavailable' })

    resetBtcPriceCacheForTests()
    fetchMock.mockResolvedValue(new Response('oops', { status: 500 }))
    expect(await getBtcSpotPrice()).toEqual({ status: 'unavailable' })
  })
})
