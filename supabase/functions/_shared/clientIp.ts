// Trusted client address for pre-auth rate limiting. TS mirror of
// public.pre_auth_client_ip (migration 107) — keep the two in sync.
//
// The first x-forwarded-for entry is whatever the caller sent: the hosted
// gateway APPENDS the real address, so the LAST entry is the real one. Order:
//   1. cf-connecting-ip (Cloudflare; a faked one is rejected with 403)
//   2. sb-forwarded-for (Supabase overwrites it)
//   3. LAST x-forwarded-for entry (gateway-appended)
//   4. x-real-ip (last resort)
// Never trusted: true-client-ip (passes through unchanged), forwarded, and the
// first x-forwarded-for entry.

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
// Deliberately loose: the database re-validates and normalizes (IPv6 -> /64).
const IPV6 = /^(?=(?:[^:]*:){2,7}[^:]*$)[0-9a-fA-F:.]+$/

export function isPlausibleIp(value: string): boolean {
  return IPV4.test(value) || (value.length <= 45 && IPV6.test(value))
}

export function pickClientIp(getHeader: (name: string) => string | null): string {
  const xff = getHeader('x-forwarded-for')
  const candidates = [
    getHeader('cf-connecting-ip'),
    getHeader('sb-forwarded-for'),
    xff ? xff.split(',').pop() ?? null : null,
    getHeader('x-real-ip'),
  ]
  for (const raw of candidates) {
    const value = (raw ?? '').trim()
    if (value && isPlausibleIp(value)) return value.slice(0, 64)
  }
  return 'unknown'
}
