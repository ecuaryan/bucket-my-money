import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BANK_ACTIVITY_LOAD_ERROR,
  REFRESH_BALANCES_ERROR,
  REFRESH_BALANCES_THROTTLED,
} from '@/lib/brand'

vi.mock('@/lib/sessionToken', () => ({
  getFreshAccessToken: vi.fn(async () => 'access-token'),
  refreshAccessToken: vi.fn(async () => 'access-token'),
}))

vi.mock('@/lib/supabaseKeys', () => ({
  resolveSupabasePublishableKey: () => 'publishable-key',
}))

import {
  BankLinkReconnectError,
  refreshBalancesErrorMessage,
  refreshThrottledMessage,
  type RefreshBalancesResult,
} from '@/lib/bankLink'
import { checkTellerReachable, fetchBankTransactions } from '@/lib/teller'

function refreshResult(
  overrides: Partial<RefreshBalancesResult> = {},
): RefreshBalancesResult {
  return {
    ok: true,
    refreshed: false,
    accountsUpdated: 0,
    bankLastSyncedAt: null,
    errors: [],
    ...overrides,
  }
}

describe('checkTellerReachable (fail-open)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('is true when the server reports Teller reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ reachable: true }, 200)),
    )
    await expect(checkTellerReachable()).resolves.toBe(true)
  })

  it('is false only when the server affirmatively says unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ reachable: false }, 200)),
    )
    await expect(checkTellerReachable()).resolves.toBe(false)
  })

  it('fails open on a non-OK health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'health check failed' }, 500)),
    )
    await expect(checkTellerReachable()).resolves.toBe(true)
  })

  it('fails open when the request itself throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(checkTellerReachable()).resolves.toBe(true)
  })
})

describe('refreshThrottledMessage', () => {
  const NOW = Date.parse('2026-10-24T12:00:00Z')
  const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()

  it('explains a no-op refresh when balances were synced moments ago', () => {
    expect(
      refreshThrottledMessage(refreshResult({ bankLastSyncedAt: minutesAgo(6) }), NOW),
    ).toBe(REFRESH_BALANCES_THROTTLED)
  })

  it('stays quiet after a real refresh', () => {
    expect(
      refreshThrottledMessage(
        refreshResult({ refreshed: true, accountsUpdated: 3, bankLastSyncedAt: minutesAgo(0) }),
        NOW,
      ),
    ).toBeNull()
  })

  it('stays quiet when a bank errored, or there is no sync time, or the sync is old', () => {
    expect(
      refreshThrottledMessage(
        refreshResult({ bankLastSyncedAt: minutesAgo(6), errors: ['x'] }),
        NOW,
      ),
    ).toBeNull()
    expect(refreshThrottledMessage(refreshResult({ bankLastSyncedAt: null }), NOW)).toBeNull()
    expect(
      refreshThrottledMessage(refreshResult({ bankLastSyncedAt: minutesAgo(120) }), NOW),
    ).toBeNull()
  })
})

describe('refreshBalancesErrorMessage', () => {
  it('is null when no bank errored (success or throttled/skipped)', () => {
    expect(refreshBalancesErrorMessage(refreshResult())).toBeNull()
    expect(
      refreshBalancesErrorMessage(
        refreshResult({ refreshed: true, accountsUpdated: 3 }),
      ),
    ).toBeNull()
  })

  it('returns friendly copy when any bank errored — even on a 200 response', () => {
    expect(
      refreshBalancesErrorMessage(
        refreshResult({ errors: ['acc_1: Teller /accounts/… timed out'] }),
      ),
    ).toBe(REFRESH_BALANCES_ERROR)
  })

  it('flags a partial failure (some updated, some errored)', () => {
    expect(
      refreshBalancesErrorMessage(
        refreshResult({
          refreshed: true,
          accountsUpdated: 2,
          errors: ['acc_3: Teller timed out'],
        }),
      ),
    ).toBe(REFRESH_BALANCES_ERROR)
  })
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchBankTransactions error copy', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns transactions on success', async () => {
    const payload = {
      ok: true,
      startDate: '2026-06-25',
      endDate: '2026-07-09',
      limit: 50,
      transactions: [{ id: 'txn_1' }],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(payload, 200)),
    )

    await expect(fetchBankTransactions('acc_1')).resolves.toEqual(payload)
  })

  it('hides the opaque edge-runtime status (e.g. 546) behind friendly copy', async () => {
    // Supabase's edge runtime returns 546 with a non-`error` body when the
    // worker hits a limit — the exact failure in the reported screenshot.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 'WORKER_LIMIT' }, 546)),
    )

    await expect(fetchBankTransactions('acc_1')).rejects.toThrow(
      BANK_ACTIVITY_LOAD_ERROR,
    )
  })

  it('throws BankLinkReconnectError when the enrollment is disconnected (409 bank_link_reconnect)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { error: 'Bank link needs reconnecting', code: 'bank_link_reconnect' },
          409,
        ),
      ),
    )

    await expect(fetchBankTransactions('acc_1')).rejects.toBeInstanceOf(
      BankLinkReconnectError,
    )
  })

  it('uses generic friendly copy for a Teller timeout (504 bank_timeout)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { error: 'Bank request timed out', code: 'bank_timeout' },
          504,
        ),
      ),
    )

    const err = await fetchBankTransactions('acc_1').catch((e) => e as Error)
    expect(err).not.toBeInstanceOf(BankLinkReconnectError)
    expect(err.message).toBe(BANK_ACTIVITY_LOAD_ERROR)
  })

  it('does not leak Teller error details (502) to the user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            error: 'Failed to load transactions from bank',
            details: 'Teller GET /accounts/… failed: 500',
          },
          502,
        ),
      ),
    )

    const err = await fetchBankTransactions('acc_1').catch((e) => e as Error)
    expect(err.message).toBe(BANK_ACTIVITY_LOAD_ERROR)
    expect(err.message).not.toContain('Teller')
  })
})
