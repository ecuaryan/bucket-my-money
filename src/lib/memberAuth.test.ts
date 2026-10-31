import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
  supabaseUrl: 'https://example.supabase.co',
}))

vi.mock('@/lib/supabaseKeys', () => ({
  resolveSupabasePublishableKey: () => 'test-publishable-key',
}))

import { supabase } from '@/lib/supabase'
import { validateJoinCode } from '@/lib/memberAuth'
import { isStaleJoinCodeError } from '@/lib/joinCodeError'

const networkResult = {
  data: null,
  error: { message: 'TypeError: Failed to fetch', name: 'Error' },
} as never

const rosterResult = (payload: unknown) =>
  ({ data: payload, error: null }) as never

describe('validateJoinCode', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries a dropped fetch and returns the roster once it recovers', async () => {
    vi.useFakeTimers()
    const payload = { familyId: 'fam-1', familyName: 'Willmore', members: [] }
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce(networkResult)
      .mockResolvedValueOnce(networkResult)
      .mockResolvedValueOnce(networkResult)
      .mockResolvedValueOnce(networkResult)
      .mockResolvedValueOnce(rosterResult(payload))

    const promise = validateJoinCode('ABC123')
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toEqual(payload)
    expect(supabase.rpc).toHaveBeenCalledTimes(5)
  })

  it('translates a persistent fetch failure into friendly connection copy', async () => {
    vi.useFakeTimers()
    vi.mocked(supabase.rpc).mockResolvedValue(networkResult)

    const promise = validateJoinCode('ABC123')
    const assertion = expect(promise).rejects.toThrow(
      /Could not reach the server\. Check your connection\./,
    )
    await vi.runAllTimersAsync()
    await assertion

    // Retries exhausted (six tries over ~10s), not a single-shot failure.
    expect(supabase.rpc).toHaveBeenCalledTimes(6)
  })

  it('does not treat a network failure as a stale join code', async () => {
    vi.useFakeTimers()
    vi.mocked(supabase.rpc).mockResolvedValue(networkResult)

    const promise = validateJoinCode('ABC123')
    const captured = promise.catch((e) => e)
    await vi.runAllTimersAsync()
    const err = await captured

    // A connection blip must not clear the device's household link.
    expect(isStaleJoinCodeError(err)).toBe(false)
  })

  it('fails fast on an invalid code without retrying', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue(rosterResult(null))

    const err = await validateJoinCode('ABC123').catch((e) => e)

    expect(isStaleJoinCodeError(err)).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('passes non-network RPC errors through verbatim without retrying', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'permission denied', name: 'Error' },
    } as never)

    await expect(validateJoinCode('ABC123')).rejects.toThrow(/permission denied/)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('returns the roster payload on a clean first call', async () => {
    const payload = { familyId: 'fam-1', familyName: 'Willmore', members: [] }
    vi.mocked(supabase.rpc).mockResolvedValue(rosterResult(payload))

    await expect(validateJoinCode('abc123')).resolves.toEqual(payload)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
})
