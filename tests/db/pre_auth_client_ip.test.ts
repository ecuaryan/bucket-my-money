import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serviceClient } from './fixtures'
import { requireDbEnv } from './env'

// Migration 107: the pre-auth rate limit keys on an address the caller cannot
// choose. Production probe results (see the migration header): cf-connecting-ip
// is rejected with 403 if faked, sb-forwarded-for is overwritten, the gateway
// APPENDS the real address to x-forwarded-for, true-client-ip passes through.

const REAL = '198.51.100.20'
const FAKE = '203.0.113.7'

async function clientIp(headers: Record<string, string>): Promise<string> {
  const { data, error } = await serviceClient().rpc('pre_auth_client_ip', {
    p_headers: headers,
  })
  expect(error).toBeNull()
  return data as string
}

describe('pre_auth_client_ip (same cases as src/lib/clientIp.test.ts)', () => {
  it('uses cf-connecting-ip first', async () => {
    expect(
      await clientIp({
        'cf-connecting-ip': REAL,
        'sb-forwarded-for': '198.51.100.99',
        'x-forwarded-for': `${FAKE},198.51.100.98`,
      }),
    ).toBe(REAL)
  })

  it('falls back to sb-forwarded-for', async () => {
    expect(
      await clientIp({ 'sb-forwarded-for': REAL, 'x-forwarded-for': `${FAKE},198.51.100.98` }),
    ).toBe(REAL)
  })

  it('then to the LAST x-forwarded-for entry, never the first', async () => {
    expect(await clientIp({ 'x-forwarded-for': `${FAKE},${REAL}` })).toBe(REAL)
    expect(await clientIp({ 'x-forwarded-for': `${FAKE}, 192.0.2.1 ,${REAL}` })).toBe(REAL)
    expect(await clientIp({ 'x-forwarded-for': REAL })).toBe(REAL)
  })

  it('uses x-real-ip only as a last resort', async () => {
    expect(await clientIp({ 'x-real-ip': REAL })).toBe(REAL)
    expect(await clientIp({ 'x-real-ip': '198.51.100.99', 'x-forwarded-for': REAL })).toBe(REAL)
  })

  it('ignores headers a caller can set freely', async () => {
    expect(await clientIp({ 'true-client-ip': FAKE })).toBe('unknown')
    expect(await clientIp({ forwarded: `for=${FAKE}` })).toBe('unknown')
    expect(await clientIp({ 'true-client-ip': FAKE, 'x-forwarded-for': `${FAKE},${REAL}` })).toBe(REAL)
  })

  it('skips values that are not IP addresses', async () => {
    expect(await clientIp({ 'cf-connecting-ip': 'garbage', 'sb-forwarded-for': REAL })).toBe(REAL)
    expect(await clientIp({ 'x-forwarded-for': `${REAL},not-an-ip` })).toBe('unknown')
    expect(await clientIp({ 'cf-connecting-ip': '999.1.1.1' })).toBe('unknown')
    expect(await clientIp({ 'cf-connecting-ip': `${REAL}/24` })).toBe('unknown')
  })

  it('returns unknown when nothing usable is present', async () => {
    expect(await clientIp({})).toBe('unknown')
    expect(await clientIp({ 'x-forwarded-for': '' })).toBe('unknown')
  })
})

describe('check_pre_auth_rate_limit keys', () => {
  // login_roster budget: 20 requests / 60 s.
  const check = async (ip: string) =>
    (await serviceClient().rpc('check_pre_auth_rate_limit', { p_endpoint: 'login_roster', p_ip: ip })).data

  async function burn(ips: string[]): Promise<boolean[]> {
    const out: boolean[] = []
    for (const ip of ips) out.push((await check(ip)) as boolean)
    return out
  }

  it('shares one budget across a whole IPv6 /64', async () => {
    const prefix = `2001:db8:${(Math.floor(Math.random() * 0xfff) + 1).toString(16)}:7`
    const ips = Array.from({ length: 22 }, (_, i) => `${prefix}:${i + 1}:aaaa:bbbb:cccc`)
    const results = await burn(ips)
    expect(results.slice(0, 20).every(Boolean)).toBe(true)
    expect(results.slice(20)).toEqual([false, false])
  })

  it('keeps different /64s independent', async () => {
    const a = `2001:db8:${(Math.floor(Math.random() * 0xfff) + 0x1000).toString(16)}:1::1`
    const b = `2001:db8:${(Math.floor(Math.random() * 0xfff) + 0x2000).toString(16)}:1::1`
    for (let i = 0; i < 20; i++) await check(a)
    expect(await check(a)).toBe(false)
    expect(await check(b)).toBe(true)
  })

  it('treats an IPv4-mapped IPv6 address as that IPv4 address', async () => {
    const v4 = `192.0.2.${Math.floor(Math.random() * 200) + 20}`
    const ips = Array.from({ length: 22 }, (_, i) => (i % 2 ? v4 : `::ffff:${v4}`))
    const results = await burn(ips)
    expect(results.slice(0, 20).every(Boolean)).toBe(true)
    expect(results.slice(20)).toEqual([false, false])
  })
})

// The exact attack seen in production, run against the local stack: every
// request carries a different fake first x-forwarded-for entry. The local
// gateway appends the real address (like the hosted one), so the budget must
// be shared and the limit must bite.
describe('login_roster rate limit cannot be dodged with a fake X-Forwarded-For', () => {
  const clear = async () => {
    await serviceClient().from('rate_limit_hits').delete().like('limit_key', 'preauth:login_roster:%')
  }
  beforeAll(clear)
  afterAll(clear)

  it('refuses from about the 21st request even though each fakes its own address', async () => {
    const { url, anonKey } = requireDbEnv()
    let accepted = 0
    let limited = 0
    for (let i = 1; i <= 30; i++) {
      const fakeIp = `203.0.113.${i}`
      const res = await fetch(`${url}/rest/v1/rpc/login_roster`, {
        method: 'POST',
        headers: { apikey: anonKey, 'content-type': 'application/json', 'x-forwarded-for': fakeIp },
        body: JSON.stringify({ p_code: `NOPE${String(i).padStart(4, '2')}` }),
      })
      const body = (await res.text()).trim()
      if (/too many/i.test(body)) limited++
      else if (res.status === 200 && body === 'null') accepted++
    }
    expect(accepted).toBe(20)
    expect(limited).toBe(10)
  })
})
