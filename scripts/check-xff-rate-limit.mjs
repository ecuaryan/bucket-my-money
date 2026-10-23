#!/usr/bin/env node
// Checks the pre-auth rate limit on the HOSTED project against a spoofed
// X-Forwarded-For. login_roster (the join-code lookup the login screen uses)
// is limited to 20 requests / 60 s per client IP (public.pre_auth_rate_limit,
// migration 93). If the gateway lets a caller choose that IP, a fresh fake
// address per request gets a fresh budget and the limit is bypassed.
//
// Every request is a read-only lookup of a random, invalid join code. Nothing
// is created, changed, or revealed. The public Supabase URL and publishable key
// are read from the site's own JS bundle (the values every browser downloads);
// set SUPABASE_URL and SUPABASE_KEY to override (e.g. for a local stack).
//
// Usage: node scripts/check-xff-rate-limit.mjs [--control | --headers] [site-url]
//
//   (default)   30 lookups, each with a different fake X-Forwarded-For.
//               None refused  -> the fake header works: the limit is bypassable.
//               Refused ~21+  -> the gateway ignores it: the limit holds.
//   --control   Same 30 lookups with NO fake header (all count against your real
//               address). Refused from ~21 -> the limiter itself works. If your
//               address gets limited it is blocked from login lookups ~1 minute.
//   --headers   Two requests to the temporary debug_request_headers RPC (one
//               plain, one with a fake X-Forwarded-For of 203.0.113.7) and prints
//               the proxy/IP headers PostgREST sees. Shows which header the
//               gateway sets itself. Needs migration 106 deployed.

const args = process.argv.slice(2)
const CONTROL = args.includes('--control')
const HEADERS = args.includes('--headers')
const SITE = (args.find((a) => !a.startsWith('--')) ?? 'https://bucketmymoney.com').replace(/\/$/, '')
const REQUESTS = 30
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

const rnd = (n) => Math.floor(Math.random() * n)

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

if (HEADERS) {
  const interesting =
    /forward|real-ip|^cf-|^x-envoy|^via$|^true-client|^fly-|^x-vercel|^x-amzn|^sb-|^x-sb|^x-supabase|host|proto|^user-agent$/i
  for (const [label, extra] of [
    ['PLAIN request (no fake header)', {}],
    ['FAKE request (x-forwarded-for: 203.0.113.7)', { 'x-forwarded-for': '203.0.113.7' }],
  ]) {
    const res = await fetch(`${url}/rest/v1/rpc/debug_request_headers`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json', ...extra },
      body: '{}',
    })
    const text = await res.text()
    console.log(`\n--- ${label}: HTTP ${res.status}`)
    try {
      for (const [k, v] of Object.entries(JSON.parse(text))) {
        if (interesting.test(k)) console.log(`  ${k}: ${v}`)
      }
    } catch {
      console.log(`  ${text.slice(0, 200)}`)
    }
  }
  process.exit(0)
}

console.log(
  CONTROL
    ? `CONTROL: sending ${REQUESTS} invalid-code lookups with NO fake header (all count against your real address)...\n`
    : `Sending ${REQUESTS} invalid-code lookups, each with a different fake X-Forwarded-For...\n`,
)

let accepted = 0
let limited = 0
let firstLimitedAt = null
const other = {}

for (let i = 1; i <= REQUESTS; i++) {
  const code = Array.from({ length: 8 }, () => ALPHABET[rnd(ALPHABET.length)]).join('')
  const fakeIp = `${1 + rnd(222)}.${rnd(256)}.${rnd(256)}.${1 + rnd(254)}`
  const res = await fetch(`${url}/rest/v1/rpc/login_roster`, {
    method: 'POST',
    headers: {
      apikey: key,
      'content-type': 'application/json',
      ...(CONTROL ? {} : { 'x-forwarded-for': fakeIp }),
    },
    body: JSON.stringify({ p_code: code }),
  })
  const body = (await res.text()).trim()
  if (res.status === 200 && body === 'null') {
    accepted++ // looked up, no such family: the normal answer
  } else if (/too many/i.test(body)) {
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
  console.log('RESULT: the fake X-Forwarded-For worked. The per-IP rate limit can be bypassed.')
} else {
  console.log('RESULT: the gateway ignores the fake header. The per-IP rate limit holds.')
  console.log('        (Your address is blocked from login lookups for about a minute.)')
}
