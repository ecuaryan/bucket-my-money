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
// Usage: node scripts/check-xff-rate-limit.mjs [--control | --two-network] [--spoof-all] [--edge] [site-url]
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
//   --edge      Test the validate-join-code EDGE FUNCTION path
//               (/functions/v1/validate-join-code) instead of the login_roster
//               database RPC. It sits behind a different front door.
//
//   --two-network  Guided proof that the limit is keyed per ADDRESS, not one bucket
//               shared by everyone. Part 1 uses up this network's budget, the
//               script then tells you to switch networks (e.g. Wi-Fi -> phone
//               hotspot with the phone's own Wi-Fi OFF), detects that your public
//               address changed, and runs part 2 itself, inside the one-minute
//               window. Use with --edge for the edge-function path.
//               PASS = part 2 gets its own full budget even though part 1's was
//               just used up.

const args = process.argv.slice(2)
const CONTROL = args.includes('--control')
const SPOOF_ALL = args.includes('--spoof-all')
const EDGE = args.includes('--edge')
const TWO_NETWORK = args.includes('--two-network')
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Send REQUESTS lookups; `control` = no fake header (all count against your real address). */
async function runBatch({ control }) {
  let accepted = 0
  let limited = 0
  let firstLimitedAt = null
  const other = {}

  for (let i = 1; i <= REQUESTS; i++) {
    const code = Array.from({ length: 8 }, () => ALPHABET[rnd(ALPHABET.length)]).join('')
    const headers = {
      apikey: key,
      'content-type': 'application/json',
      ...(control ? {} : fakeHeaders(randomIp())),
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
  return { accepted, limited, firstLimitedAt, other }
}

function printBatch({ accepted, limited, firstLimitedAt, other }) {
  console.log(`Answered normally (not limited): ${accepted}`)
  console.log(`Rate limited:                    ${limited}${firstLimitedAt ? ` (first at request ${firstLimitedAt})` : ''}`)
  for (const [k, n] of Object.entries(other)) console.log(`Unexpected: ${n} x ${k}`)
}

/** This machine's public address as Cloudflare sees it (null while offline). */
async function publicIp() {
  try {
    const res = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { signal: AbortSignal.timeout(4000) })
    return (await res.text()).match(/^ip=(.+)$/m)?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

if (TWO_NETWORK) {
  const WINDOW_MS = 40_000 // part 2 must start while part 1's budget is still used up
  const where = EDGE ? 'edge function (validate-join-code)' : 'database RPC (login_roster)'
  console.log(`TWO-NETWORK CHECK: ${where}`)

  const ipA = await publicIp()
  console.log(`\nPART 1 - network A, address ${ipA ?? 'unknown'}: using up its budget...\n`)
  const a = await runBatch({ control: true })
  const aDoneAt = Date.now()
  printBatch(a)
  if (a.limited === 0 || Object.keys(a.other).length > 0) {
    console.log('\nRESULT: part 1 did not hit the limit normally, so the test cannot continue. Paste the lines above to Claude.')
    process.exit(1)
  }

  console.log(`\n>>> SWITCH NETWORKS NOW (e.g. Wi-Fi -> phone hotspot; keep the phone's own Wi-Fi OFF).`)
  console.log(`>>> I will start part 2 automatically as soon as your public address changes. You have ${WINDOW_MS / 1000}s.\n`)

  let ipB = null
  while (Date.now() - aDoneAt < WINDOW_MS) {
    await sleep(2000)
    const cur = await publicIp()
    const left = Math.max(0, Math.round((WINDOW_MS - (Date.now() - aDoneAt)) / 1000))
    if (cur && cur !== ipA) {
      ipB = cur
      break
    }
    console.log(`   waiting... still ${cur ?? 'offline/switching'} (${left}s left)`)
  }
  if (!ipB) {
    console.log('\nRESULT: your address did not change in time, and network A\'s budget has expired. Run it again and switch faster.')
    process.exit(1)
  }

  await sleep(1500) // let the new connection settle
  const sinceA = Math.round((Date.now() - aDoneAt) / 1000)
  console.log(`\nPART 2 - network B, address ${ipB} (${sinceA}s after part 1): is its budget still full?\n`)
  const b = await runBatch({ control: true })
  printBatch(b)

  console.log('')
  if (Object.keys(b.other).length > 0) {
    console.log('RESULT: inconclusive - unexpected responses above. Paste them to Claude.')
  } else if (b.accepted >= 18 && b.firstLimitedAt >= 19) {
    console.log(`RESULT: PASS - network B got its own full budget while network A was used up. The limit is per address (A ${ipA} / B ${ipB}).`)
  } else if (b.accepted === 0) {
    console.log(`RESULT: FAIL - network B was refused from its first request even though its address (${ipB}) differs from A (${ipA}). Budgets appear to be shared. Tell Claude.`)
  } else {
    console.log(`RESULT: unclear - network B answered ${b.accepted} before refusing (expected ~20). Paste this to Claude.`)
  }
  process.exit(0)
}

console.log(
  CONTROL
    ? `CONTROL${EDGE ? ' (edge function)' : ''}: sending ${REQUESTS} invalid-code lookups with NO fake header (all count against your real address)...\n`
    : `Sending ${REQUESTS} invalid-code lookups${EDGE ? ' to the validate-join-code edge function' : ''}, each with ${SPOOF_ALL ? 'EVERY client-IP header faked' : 'a different fake X-Forwarded-For'}...\n`,
)

const batch = await runBatch({ control: CONTROL })
printBatch(batch)
const { limited, firstLimitedAt, other } = batch

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
