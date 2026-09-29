import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { serviceClient } from './fixtures'
import { requireDbEnv } from './env'

function anonClient() {
  const { url, anonKey } = requireDbEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function uniqueKey(label: string) {
  return `ratelimit-test:${label}:${crypto.randomUUID()}`
}

// TEST-NET-2 addresses (RFC 5737): guaranteed unroutable, and unique per
// call so tests never share a per-IP budget with each other.
let ipCounter = Math.floor(Math.random() * 200) + 1
function uniqueIp(): string {
  ipCounter += 1
  return `198.51.100.${(ipCounter % 254) + 1}`
}

describe('check_rate_limit (migration 93)', () => {
  let svc: ReturnType<typeof serviceClient>
  beforeEach(() => {
    svc = serviceClient()
  })

  it('allows up to the limit, then denies within the window', async () => {
    const key = uniqueKey('budget')

    expect((await svc.rpc('check_rate_limit', { p_key: key, p_limit: 2, p_window_seconds: 3600 })).data).toBe(true)
    expect((await svc.rpc('check_rate_limit', { p_key: key, p_limit: 2, p_window_seconds: 3600 })).data).toBe(true)
    // Third call in the same window exceeds the budget of 2.
    expect((await svc.rpc('check_rate_limit', { p_key: key, p_limit: 2, p_window_seconds: 3600 })).data).toBe(false)
  })

  it('tracks keys independently', async () => {
    const keyA = uniqueKey('a')
    const keyB = uniqueKey('b')

    expect((await svc.rpc('check_rate_limit', { p_key: keyA, p_limit: 1, p_window_seconds: 3600 })).data).toBe(true)
    // keyA is now exhausted...
    expect((await svc.rpc('check_rate_limit', { p_key: keyA, p_limit: 1, p_window_seconds: 3600 })).data).toBe(false)
    // ...but keyB is unaffected.
    expect((await svc.rpc('check_rate_limit', { p_key: keyB, p_limit: 1, p_window_seconds: 3600 })).data).toBe(true)
  })

  it('prunes expired hits so the budget refills after the window', async () => {
    const key = uniqueKey('prune')

    // Seed an expired hit directly (2h old, outside a 60s window).
    const { error: seedError } = await svc.from('rate_limit_hits').insert({
      limit_key: key,
      created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    })
    expect(seedError).toBeNull()

    // The expired hit must not count against the fresh budget.
    const first = await svc.rpc('check_rate_limit', {
      p_key: key,
      p_limit: 1,
      p_window_seconds: 60,
    })
    expect(first.error).toBeNull()
    expect(first.data).toBe(true)

    // And the prune should have removed the stale row (plus the new hit
    // leaves exactly one row behind).
    const { data: rows, error: rowsError } = await svc
      .from('rate_limit_hits')
      .select('limit_key')
      .eq('limit_key', key)
    expect(rowsError).toBeNull()
    expect(rows).toHaveLength(1)
  })

  it('serializes concurrent checks on the same key (no count-then-insert race)', async () => {
    const key = uniqueKey('race')
    const limit = 5

    // Fire 10 checks at once. Without the advisory lock, several would
    // observe the same stale count and all insert; with it, exactly
    // `limit` may pass.
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        svc.rpc('check_rate_limit', {
          p_key: key,
          p_limit: limit,
          p_window_seconds: 3600,
        }),
      ),
    )
    for (const r of results) expect(r.error).toBeNull()
    const allowed = results.filter((r) => r.data === true).length
    expect(allowed).toBe(limit)
  })

  it('fails closed on invalid inputs', async () => {
    const emptyKey = await svc.rpc('check_rate_limit', {
      p_key: '   ',
      p_limit: 5,
      p_window_seconds: 60,
    })
    expect(emptyKey.error).not.toBeNull()

    const zeroLimit = await svc.rpc('check_rate_limit', {
      p_key: uniqueKey('zero-limit'),
      p_limit: 0,
      p_window_seconds: 60,
    })
    expect(zeroLimit.error).not.toBeNull()

    const badWindow = await svc.rpc('check_rate_limit', {
      p_key: uniqueKey('bad-window'),
      p_limit: 5,
      p_window_seconds: -10,
    })
    expect(badWindow.error).not.toBeNull()
  })

  it('rejects absurd upper bounds (fail closed, never near-unlimited)', async () => {
    const hugeLimit = await svc.rpc('check_rate_limit', {
      p_key: uniqueKey('huge-limit'),
      p_limit: 100001,
      p_window_seconds: 60,
    })
    expect(hugeLimit.error).not.toBeNull()
    expect(hugeLimit.error!.message).toContain('exceeds maximum')

    const hugeWindow = await svc.rpc('check_rate_limit', {
      p_key: uniqueKey('huge-window'),
      p_limit: 5,
      p_window_seconds: 86401,
    })
    expect(hugeWindow.error).not.toBeNull()
    expect(hugeWindow.error!.message).toContain('exceeds maximum')

    // Boundary values still work.
    const atBoundary = await svc.rpc('check_rate_limit', {
      p_key: uniqueKey('boundary'),
      p_limit: 100000,
      p_window_seconds: 86400,
    })
    expect(atBoundary.error).toBeNull()
    expect(atBoundary.data).toBe(true)
  })

  it('anon can neither call check_rate_limit nor read the hits table', async () => {
    const anon = anonClient()

    const { error: rpcError } = await anon.rpc('check_rate_limit', {
      p_key: uniqueKey('anon'),
      p_limit: 5,
      p_window_seconds: 60,
    })
    expect(rpcError).not.toBeNull()

    const { error: tableError } = await anon
      .from('rate_limit_hits')
      .select('limit_key')
      .limit(1)
    expect(tableError).not.toBeNull()
  })
})

describe('check_pre_auth_rate_limit (migration 93)', () => {
  let svc: ReturnType<typeof serviceClient>
  beforeEach(() => {
    svc = serviceClient()
  })

  it('enforces the rule budget per endpoint+IP', async () => {
    const ip = uniqueIp()
    // pin-login budget is 20/min in rate_limit_rules.
    for (let i = 0; i < 20; i++) {
      const r = await svc.rpc('check_pre_auth_rate_limit', {
        p_endpoint: 'pin-login',
        p_ip: ip,
      })
      expect(r.error).toBeNull()
      expect(r.data).toBe(true)
    }
    const over = await svc.rpc('check_pre_auth_rate_limit', {
      p_endpoint: 'pin-login',
      p_ip: ip,
    })
    expect(over.error).toBeNull()
    expect(over.data).toBe(false)
  })

  it('tracks IPs independently on the same endpoint', async () => {
    const ipA = uniqueIp()
    const ipB = uniqueIp()

    for (let i = 0; i < 20; i++) {
      await svc.rpc('check_pre_auth_rate_limit', { p_endpoint: 'pin-login', p_ip: ipA })
    }
    // ipA exhausted...
    const overA = await svc.rpc('check_pre_auth_rate_limit', {
      p_endpoint: 'pin-login',
      p_ip: ipA,
    })
    expect(overA.data).toBe(false)
    // ...ipB unaffected.
    const freshB = await svc.rpc('check_pre_auth_rate_limit', {
      p_endpoint: 'pin-login',
      p_ip: ipB,
    })
    expect(freshB.error).toBeNull()
    expect(freshB.data).toBe(true)
  })

  it('raises loudly on an unknown endpoint (never silently unlimited)', async () => {
    const { error } = await svc.rpc('check_pre_auth_rate_limit', {
      p_endpoint: 'no-such-endpoint',
      p_ip: uniqueIp(),
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('Unknown pre-auth rate limit endpoint')
  })

  it('buckets a blank IP as unknown without erroring', async () => {
    const r = await svc.rpc('check_pre_auth_rate_limit', {
      p_endpoint: 'webauthn-has-passkey',
      p_ip: '   ',
    })
    expect(r.error).toBeNull()
    expect(typeof r.data).toBe('boolean')
  })

  it('anon and authenticated cannot call it directly', async () => {
    const anon = anonClient()
    const { error } = await anon.rpc('check_pre_auth_rate_limit', {
      p_endpoint: 'pin-login',
      p_ip: '1.2.3.4',
    })
    expect(error).not.toBeNull()
  })
})

describe('pre_auth_rate_limit (migration 93)', () => {
  let svc: ReturnType<typeof serviceClient>
  beforeEach(() => {
    svc = serviceClient()
  })

  it('is not directly callable by anon', async () => {
    const anon = anonClient()
    const { error } = await anon.rpc('pre_auth_rate_limit', {
      p_endpoint: 'login_roster',
    })
    expect(error).not.toBeNull()
  })

  it('service_role can invoke it (definer path the login RPCs use)', async () => {
    // Via PostgREST the request.headers GUC is set, so this performs a
    // real per-IP check against a fresh budget and passes.
    const { error, data } = await svc.rpc('pre_auth_rate_limit', {
      p_endpoint: 'member_login_methods',
    })
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('raises loudly on an unknown endpoint instead of failing open', async () => {
    const { error } = await svc.rpc('pre_auth_rate_limit', {
      p_endpoint: 'typo-endpoint',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('Unknown pre-auth rate limit endpoint')
  })
})

describe('rate_limit_rules (migration 93)', () => {
  let svc: ReturnType<typeof serviceClient>
  beforeEach(() => {
    svc = serviceClient()
  })

  it('seeds the expected endpoint budgets', async () => {
    const { data, error } = await svc
      .from('rate_limit_rules')
      .select('endpoint, max_hits, window_seconds')
    expect(error).toBeNull()
    const byEndpoint = new Map((data ?? []).map((r) => [r.endpoint, r]))
    expect(byEndpoint.get('pin-login')).toMatchObject({ max_hits: 20, window_seconds: 60 })
    expect(byEndpoint.get('validate-join-code')).toMatchObject({ max_hits: 20, window_seconds: 60 })
    expect(byEndpoint.get('login_roster')).toMatchObject({ max_hits: 20, window_seconds: 60 })
    expect(byEndpoint.get('webauthn-has-passkey')).toMatchObject({ max_hits: 60, window_seconds: 60 })
  })

  it('anon cannot read the rules table', async () => {
    const anon = anonClient()
    const { error } = await anon.from('rate_limit_rules').select('endpoint').limit(1)
    expect(error).not.toBeNull()
  })
})

describe('cleanup_rate_limit_hits (migration 93)', () => {
  let svc: ReturnType<typeof serviceClient>
  beforeEach(() => {
    svc = serviceClient()
  })

  it('deletes rows older than 24h and keeps fresh ones', async () => {
    const staleKey = uniqueKey('stale')
    const freshKey = uniqueKey('fresh')

    const { error: seedError } = await svc.from('rate_limit_hits').insert([
      {
        limit_key: staleKey,
        created_at: new Date(Date.now() - 25 * 3600_000).toISOString(),
      },
      // PostgREST bulk-inserts use the union of keys across rows and fill
      // missing ones with NULL, so the fresh row needs its own timestamp
      // instead of relying on the column default.
      { limit_key: freshKey, created_at: new Date().toISOString() },
    ])
    expect(seedError).toBeNull()

    const { data: deleted, error } = await svc.rpc('cleanup_rate_limit_hits')
    expect(error).toBeNull()
    expect(deleted).toBeGreaterThanOrEqual(1)

    const { data: rows } = await svc
      .from('rate_limit_hits')
      .select('limit_key')
      .in('limit_key', [staleKey, freshKey])
    expect(rows!.map((r) => r.limit_key)).toEqual([freshKey])
  })

  it('deletes at most one 5000-row batch per invocation', async () => {
    // The cleanup is strictly one 5000-row batch per call; seed 12000
    // stale rows so the ceiling is exercised. Insert in 1000-row
    // chunks to stay well under PostgREST payload limits. The batch
    // prefix includes a random id so concurrent tests can't collide.
    const batchId = crypto.randomUUID()
    const prefix = `ratelimit-test:cleanup-batch:${batchId}`
    const staleAt = new Date(Date.now() - 25 * 3600_000).toISOString()
    const total = 12000
    for (let i = 0; i < total; i += 1000) {
      const chunk = Array.from({ length: 1000 }, (_, j) => ({
        limit_key: `${prefix}:${i + j}`,
        created_at: staleAt,
      }))
      const { error } = await svc.from('rate_limit_hits').insert(chunk)
      expect(error).toBeNull()
    }

    const { data: deleted, error } = await svc.rpc('cleanup_rate_limit_hits')
    expect(error).toBeNull()
    // The batch ceiling: one invocation never deletes more than 5000.
    expect(deleted).toBeGreaterThan(0)
    expect(deleted).toBeLessThanOrEqual(5000)

    // ...and stale rows remain for the next invocation to drain.
    const { count, error: countError } = await svc
      .from('rate_limit_hits')
      .select('limit_key', { count: 'exact', head: true })
      .like('limit_key', `${prefix}:%`)
    expect(countError).toBeNull()
    expect(count).toBeGreaterThan(0)
    expect(count).toBe(total - deleted!)
  })

  it('repeated invocations eventually clear the backlog without touching fresh rows', async () => {
    const batchId = crypto.randomUUID()
    const stalePrefix = `ratelimit-test:cleanup-drain:${batchId}`
    const freshKey = `ratelimit-test:cleanup-fresh:${batchId}`
    const staleAt = new Date(Date.now() - 25 * 3600_000).toISOString()

    // 6000 stale rows take more than one batch to drain (5000 + 1000).
    for (let i = 0; i < 6000; i += 1000) {
      const chunk = Array.from({ length: 1000 }, (_, j) => ({
        limit_key: `${stalePrefix}:${i + j}`,
        created_at: staleAt,
      }))
      const { error } = await svc.from('rate_limit_hits').insert(chunk)
      expect(error).toBeNull()
    }
    const { error: freshError } = await svc.from('rate_limit_hits').insert({
      limit_key: freshKey,
      created_at: new Date().toISOString(),
    })
    expect(freshError).toBeNull()

    // Drain the backlog the way the daily pg_cron job does: one call
    // per day until an invocation deletes nothing.
    let invocations = 0
    let deleted = 1
    while (deleted > 0 && invocations < 10) {
      const r = await svc.rpc('cleanup_rate_limit_hits')
      expect(r.error).toBeNull()
      deleted = r.data ?? 0
      invocations += 1
    }
    expect(invocations).toBeGreaterThan(1)
    expect(invocations).toBeLessThan(10)

    const { count: staleLeft, error: staleError } = await svc
      .from('rate_limit_hits')
      .select('limit_key', { count: 'exact', head: true })
      .like('limit_key', `${stalePrefix}:%`)
    expect(staleError).toBeNull()
    expect(staleLeft).toBe(0)

    // The fresh row survives the whole drain.
    const { data: rows, error: rowsError } = await svc
      .from('rate_limit_hits')
      .select('limit_key')
      .eq('limit_key', freshKey)
    expect(rowsError).toBeNull()
    expect(rows).toHaveLength(1)
  })

  it('anon cannot invoke it', async () => {
    const anon = anonClient()
    const { error } = await anon.rpc('cleanup_rate_limit_hits')
    expect(error).not.toBeNull()
  })
})
