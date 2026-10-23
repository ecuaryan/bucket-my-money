import { describe, expect, it } from 'vitest'
import { isPlausibleIp, pickClientIp } from '../../supabase/functions/_shared/clientIp'

const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null

// Same cases as tests/db/pre_auth_client_ip.test.ts (the SQL mirror).
const REAL = '198.51.100.20'
const FAKE = '203.0.113.7'

describe('pickClientIp', () => {
  it('uses cf-connecting-ip first', () => {
    expect(
      pickClientIp(headers({ 'cf-connecting-ip': REAL, 'sb-forwarded-for': '198.51.100.99', 'x-forwarded-for': `${FAKE},198.51.100.98` })),
    ).toBe(REAL)
  })

  it('falls back to sb-forwarded-for', () => {
    expect(pickClientIp(headers({ 'sb-forwarded-for': REAL, 'x-forwarded-for': `${FAKE},198.51.100.98` }))).toBe(REAL)
  })

  it('then to the LAST x-forwarded-for entry, never the first', () => {
    expect(pickClientIp(headers({ 'x-forwarded-for': `${FAKE},${REAL}` }))).toBe(REAL)
    expect(pickClientIp(headers({ 'x-forwarded-for': `${FAKE}, 192.0.2.1 ,${REAL}` }))).toBe(REAL)
    expect(pickClientIp(headers({ 'x-forwarded-for': REAL }))).toBe(REAL)
  })

  it('uses x-real-ip only as a last resort', () => {
    expect(pickClientIp(headers({ 'x-real-ip': REAL }))).toBe(REAL)
    expect(pickClientIp(headers({ 'x-real-ip': '198.51.100.99', 'x-forwarded-for': REAL }))).toBe(REAL)
  })

  it('ignores headers a caller can set freely', () => {
    expect(pickClientIp(headers({ 'true-client-ip': FAKE }))).toBe('unknown')
    expect(pickClientIp(headers({ forwarded: `for=${FAKE}` }))).toBe('unknown')
    expect(pickClientIp(headers({ 'true-client-ip': FAKE, 'x-forwarded-for': `${FAKE},${REAL}` }))).toBe(REAL)
  })

  it('skips values that are not IP addresses', () => {
    expect(pickClientIp(headers({ 'cf-connecting-ip': 'garbage', 'sb-forwarded-for': REAL }))).toBe(REAL)
    expect(pickClientIp(headers({ 'x-forwarded-for': `${REAL},not-an-ip` }))).toBe('unknown')
    expect(pickClientIp(headers({ 'cf-connecting-ip': '999.1.1.1' }))).toBe('unknown')
    expect(pickClientIp(headers({ 'cf-connecting-ip': `${REAL}/24` }))).toBe('unknown')
  })

  it('returns unknown when nothing usable is present', () => {
    expect(pickClientIp(headers({}))).toBe('unknown')
    expect(pickClientIp(headers({ 'x-forwarded-for': '' }))).toBe('unknown')
  })

  it('accepts IPv6 addresses', () => {
    expect(pickClientIp(headers({ 'cf-connecting-ip': '2001:db8:1:2:aaaa:bbbb:cccc:dddd' }))).toBe('2001:db8:1:2:aaaa:bbbb:cccc:dddd')
    expect(pickClientIp(headers({ 'x-forwarded-for': `${FAKE},2001:db8::1` }))).toBe('2001:db8::1')
  })
})

describe('isPlausibleIp', () => {
  it.each(['1.2.3.4', '255.255.255.255', '::1', '2001:db8::1', '::ffff:1.2.3.4'])('accepts %s', (v) => {
    expect(isPlausibleIp(v)).toBe(true)
  })
  it.each(['', 'abc', '1.2.3', '1.2.3.4.5', '256.1.1.1', 'a:b', '1.2.3.4/24', ' 1.2.3.4 '])('rejects %j', (v) => {
    expect(isPlausibleIp(v)).toBe(false)
  })
})
