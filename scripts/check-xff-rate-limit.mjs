#!/usr/bin/env node
// Checks the pre-auth rate limit on the HOSTED project against spoofed
// client-IP headers. login_roster (the join-code lookup the login screen uses)
// is limited to 20 requests / 60 s per client IP (public.pre_auth_rate_limit).
// If a caller can choose the address the limiter sees, a fresh fake address per
// request gets a fresh budget and the limit is bypassed.
//
// Every request is a read-only lookup of a random, invalid join code. Nothing
// is created, changed, or revealed. The public Supabase URL and publishable key
// are read from the site's own JS bundle (the values every browser downloads);
// set SUPABASE_URL and SUPABASE_KEY to override (e.g. for a local stack).
//
// Usage: node scripts/check-xff-rate-limit.mjs [--control] [--spoof-all] [--edge] [site-url]
//
//   (default)   30 lookups, each with a different fake X-Forwarded-For.
//               All 30 answered  -> the fake header works: the limit is bypassable.
//               Refused from ~21 -> the fake header is ignored: the limit holds.
//   --control   The same 30 lookups with NO fake header (all count against your
//               real address). Refused from ~21 -> the limiter itself works. Your
//               address is then blocked from login lookups for about a minute.
//   --spoof-all Fake every client-IP header (x-forwarded-for, cf-connecting-ip,
//               sb-forwarded-for, x-real-ip, true-client-ip). The hosted gateway
//               rejects a faked cf-connecting-ip with HTTP 403, which this
//               script reports as "unexpected".
//   --debug-edge  Temporary: ask the validate-join-code edge function to echo the
//               client-IP headers it receives and the address it would rate-limit
//               on (plain request, then one with a fake X-Forwarded-For).
//   --edge      Test the validate-join-code EDGE FUNCTION path
//               (/functions/v1/validate-join-code) instead of the login_roster
//               database RPC. It sits behind a different front door.
//
// To prove the limit is keyed per ADDRESS (not one bucket shared by everyone),
// run --control from one network until it is limited, then immediately run it
// from a different network (e.g. phone hotspot): the first requests there must
// be answered, not refused.

const args = process.argv.slice(2)
const CONTROL = args.includes('--control')
const SPOOF_ALL = args.includes('--spoof-all')
const EDGE = args.includes('--edge')
const DEBUG_EDGE = args.includes('--debug-edge')
const SITE = (args.find((a) => !a.startsWith('--')) ?? 'https://bucketmymoney.com').replace(/\/$/, '')
const REQUESTS = 30
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

const rnd = (n) => Math.floor(Math.random() * n)
const randomIp = () => `${1 + rnd(222)}.${rnd(256)}.${rnd(256)}.${1 + rnd(254)}`

/** The fake client-IP headers to send (X-Forwarded-For only, or all of them). */
function fakeHeaders(ip) {
  return SPOOF_ALL
    ? {
        'x-forwarded-for': ip,
        'cf-connecting-ip': ip,
        'sb-forwarded-for': ip,
        'x-real-ip': ip,
        'true-client-ip': ip,
      }
    : { 'x-forwarded-for': ip }
}

async function discoverPublicConfig() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY }
  }
  const html = await (await fetch(`${SITE}/`)).text()
  const assets = [...html.matchAll(/\/assets\/[A-Za-z0-9_.-]+\.js/g)].map((m) => m[0])
  for (const asset of assets) {
    const js = await (await fetch(`${SITE}${asset}`)).text()
    const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0]
    const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    if (url && key) return { url, key }
  }
  throw new Error(`Could not find the Supabase URL/key in ${SITE}'s bundle`)
}

const { url, key } = await discoverPublicConfig()
console.log(`Target: ${url}`)

if (DEBUG_EDGE) {
  for (const [label, extra] of [
    ['PLAIN request (no fake header)', {}],
    ['FAKE request (x-forwarded-for: 203.0.113.7)', { 'x-forwarded-for': '203.0.113.7' }],
  ]) {
    const res = await fetch(`${url}/functions/v1/validate-join-code`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json', 'x-bmm-debug': '1', ...extra },
      body: '{}',
    })
    const text = await res.text()
    console.log(`\n--- ${label}: HTTP ${res.status}`)
    try {
      const data = JSON.parse(text)
      console.log(`  chosen address (rate-limit key): ${data.chosen}`)
      for (const [k, v] of Object.entries(data.headers ?? {})) console.log(`  ${k}: ${v}`)
    } catch {
      console.log(`  ${text.slice(0, 200)}`)
    }
  }
  process.exit(0)
}

console.log(
  CONTROL
    ? `CONTROL${EDGE ? ' (edge function)' : ''}: sending ${REQUESTS} invalid-code lookups with NO fake header (all count against your real address)...\n`
    : `Sending ${REQUESTS} invalid-code lookups${EDGE ? ' to the validate-join-code edge function' : ''}, each with ${SPOOF_ALL ? 'EVERY client-IP header faked' : 'a different fake X-Forwarded-For'}...\n`,
)

let accepted = 0
let limited = 0
let firstLimitedAt = null
const other = {}

for (let i = 1; i <= REQUESTS; i++) {
  const code = Array.from({ length: 8 }, () => ALPHABET[rnd(ALPHABET.length)]).join('')
  const headers = {
    apikey: key,
    'content-type': 'application/json',
    ...(CONTROL ? {} : fakeHeaders(randomIp())),
  }
  const res = EDGE
    ? await fetch(`${url}/functions/v1/validate-join-code`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code }),
      })
    : await fetch(`${url}/rest/v1/rpc/login_roster`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_code: code }),
      })
  const body = (await res.text()).trim()
  const normal = EDGE
    ? res.status === 404 && /invalid join code/i.test(body)
    : res.status === 200 && body === 'null'
  if (normal) {
    accepted++ // looked up, no such family: the normal answer
  } else if (res.status === 429 || /too many/i.test(body)) {
    limited++
    firstLimitedAt ??= i
  } else {
    const k = `HTTP ${res.status}: ${body.slice(0, 100)}`
    other[k] = (other[k] ?? 0) + 1
  }
}

console.log(`Answered normally (not limited): ${accepted}`)
console.log(`Rate limited:                    ${limited}${firstLimitedAt ? ` (first at request ${firstLimitedAt})` : ''}`)
for (const [k, n] of Object.entries(other)) console.log(`Unexpected: ${n} x ${k}`)

console.log('')
if (Object.keys(other).length > 0) {
  console.log('RESULT: inconclusive — unexpected responses above. Paste them back to Claude.')
} else if (CONTROL) {
  console.log(
    limited > 0
      ? `RESULT: the limiter works (refused from request ${firstLimitedAt}). Your address is blocked for about a minute.`
      : 'RESULT: NOT limited even without a fake header. The limiter is not firing at all.',
  )
} else if (limited === 0) {
  console.log('RESULT: the fake header(s) worked. The per-IP rate limit can be bypassed.')
} else {
  console.log('RESULT: the gateway ignores the fake header. The per-IP rate limit holds.')
  console.log('        (Your address is blocked from login lookups for about a minute.)')
}
