// Shared helpers for calling the SimpleFIN Bridge from Supabase Edge
// Functions. Protocol: https://www.simplefin.org/protocol.html
//
// SimpleFIN has no app-level credentials. The user buys a Bridge
// subscription, generates a one-time Setup Token (base64 of a claim
// URL), and the app POSTs that claim URL once to receive an Access URL
// with embedded HTTP Basic credentials. That Access URL is the bearer
// credential for the family's bank data — it lives only in
// `simplefin_connections` (service-role-only) and must never reach a
// client.
//
// The whole read API is one endpoint: GET {accessUrl}/accounts, with
// query params for balances-only, date windows, and account filters.
// One request returns every account on the connection.
//
// Sign convention: SimpleFIN reports liability balances NEGATIVE
// (a card with $500 owed has balance "-500.00"); the app stores card
// balances as positive-owed (docs/CREDIT_CARDS.md). normalizeBalance
// flips the sign for cards. Mirrored in src/lib/simplefinParse.ts for
// unit tests — keep the two in sync.

// @ts-nocheck — targets the Deno runtime, not the Vite TS build.

// SimpleFIN aggregates upstream (MX), so responses are served from its
// cache and normally fast — but a claim or a cold pull can be slow.
const SIMPLEFIN_REQUEST_TIMEOUT_MS = 30_000

/** SimpleFIN returned a non-2xx response. 402/403 → subscription/auth problem. */
export class SimpleFinApiError extends Error {
  status: number
  responseBody: string
  constructor(status: number, statusText: string, body: string, what: string) {
    super(`SimpleFIN ${what} failed: ${status} ${statusText} — ${body}`)
    this.name = 'SimpleFinApiError'
    this.status = status
    this.responseBody = body
  }
}

/** SimpleFIN did not respond within {@link SIMPLEFIN_REQUEST_TIMEOUT_MS}. */
export class SimpleFinTimeoutError extends Error {
  constructor(what: string) {
    super(`SimpleFIN ${what} timed out after ${SIMPLEFIN_REQUEST_TIMEOUT_MS}ms`)
    this.name = 'SimpleFinTimeoutError'
  }
}

/** The Setup Token wasn't a base64-encoded https claim URL. */
export class SimpleFinSetupTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SimpleFinSetupTokenError'
  }
}

// ---------------------------------------------------------------------
// Domain types — minimal shape used by the rest of the app.
// ---------------------------------------------------------------------

export type SimpleFinOrg = {
  domain?: string
  name?: string
  url?: string
  id?: string
  'sfin-url'?: string
}

export type SimpleFinTransaction = {
  id: string
  /** Unix seconds; 0 for some pending transactions (use transacted_at). */
  posted: number
  transacted_at?: number
  /** Dollars as a string; negative = money out. */
  amount: string
  description: string
  payee?: string
  memo?: string
  pending?: boolean
}

export type SimpleFinAccount = {
  org: SimpleFinOrg
  id: string
  name: string
  currency: string
  /** Dollars as a string; liabilities are negative. */
  balance: string
  'available-balance'?: string
  /** Unix seconds of the balance snapshot. */
  'balance-date': number
  transactions?: SimpleFinTransaction[]
}

export type SimpleFinAccountSet = {
  /** Human-readable problems (e.g. an institution needing re-auth). */
  errors: string[]
  accounts: SimpleFinAccount[]
}

// ---------------------------------------------------------------------
// Pure helpers (mirrored in src/lib/simplefinParse.ts — keep in sync).
// ---------------------------------------------------------------------

/**
 * True when `raw` is an https URL on simplefin.org or one of its subdomains
 * (e.g. beta-bridge.simplefin.org). Parsed with URL — not a regex — so
 * look-alikes like `simplefin.org.evil.com`, `simplefin.org@evil.com` and
 * `evil.com\@simplefin.org` resolve to their real host and fail. Embedded
 * credentials are allowed (an Access URL carries them); an explicit port is not.
 */
export function isSimpleFinUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '') return false
  const host = url.hostname.toLowerCase()
  return host === 'simplefin.org' || host.endsWith('.simplefin.org')
}

/** Decode a Setup Token (base64 claim URL). Throws SimpleFinSetupTokenError. */
export function decodeSetupToken(setupToken: string): string {
  const trimmed = (setupToken ?? '').trim()
  if (!trimmed) {
    throw new SimpleFinSetupTokenError('Setup Token is empty')
  }
  let claimUrl: string
  try {
    claimUrl = atob(trimmed).trim()
  } catch {
    throw new SimpleFinSetupTokenError('Setup Token is not valid base64')
  }
  if (!/^https:\/\/\S+$/.test(claimUrl)) {
    throw new SimpleFinSetupTokenError(
      'Setup Token did not decode to an https claim URL',
    )
  }
  // The server POSTs to this URL, so only SimpleFIN's own hosts are allowed.
  if (!isSimpleFinUrl(claimUrl) || hasCredentials(claimUrl)) {
    throw new SimpleFinSetupTokenError(
      'Setup Token did not decode to a SimpleFIN claim URL',
    )
  }
  return claimUrl
}

function hasCredentials(raw: string): boolean {
  const url = new URL(raw)
  return url.username !== '' || url.password !== ''
}

export type NormalizedKind = 'cash' | 'card'

/**
 * App-convention balance for a SimpleFIN account. Cash passes through;
 * cards flip sign so positive = owed (a card in credit goes negative,
 * which member_float treats as money back — correct).
 */
export function normalizeBalance(kind: NormalizedKind, raw: string): number {
  const value = Number(raw)
  // Number('') is 0 — reject blank input explicitly.
  if (typeof raw !== 'string' || raw.trim() === '' || !Number.isFinite(value)) {
    throw new Error(`SimpleFIN balance is not numeric: ${JSON.stringify(raw)}`)
  }
  return kind === 'card' ? -value : value
}

// ---------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------

/**
 * Split an Access URL's embedded Basic credentials from its base URL.
 * fetch() rejects URLs with credentials, so we send them as a header.
 */
export function splitAccessUrl(accessUrl: string): {
  baseUrl: string
  authHeader: string
} {
  const url = new URL(accessUrl)
  const auth = btoa(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`)
  url.username = ''
  url.password = ''
  return {
    baseUrl: url.toString().replace(/\/$/, ''),
    authHeader: `Basic ${auth}`,
  }
}

async function timedFetch(
  url: string,
  init: RequestInit,
  what: string,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SIMPLEFIN_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new SimpleFinTimeoutError(what)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Claim a Setup Token: POST the decoded claim URL once; the response
 * body is the Access URL. A token can only be claimed once — a second
 * claim fails, so the caller must persist the result immediately.
 */
export async function claimAccessUrl(setupToken: string): Promise<string> {
  const claimUrl = decodeSetupToken(setupToken)
  const res = await timedFetch(
    claimUrl,
    { method: 'POST', headers: { 'Content-Length': '0' } },
    'claim',
  )
  const body = (await res.text()).trim()
  if (!res.ok) {
    throw new SimpleFinApiError(res.status, res.statusText, body, 'claim')
  }
  if (!/^https:\/\/\S+$/.test(body)) {
    throw new SimpleFinApiError(
      res.status,
      res.statusText,
      body.slice(0, 200),
      'claim (unexpected body)',
    )
  }
  // Every later pull calls this URL with its credentials, so it must stay on
  // SimpleFIN's own hosts too.
  if (!isSimpleFinUrl(body)) {
    throw new SimpleFinApiError(
      res.status,
      res.statusText,
      'Access URL is not on simplefin.org',
      'claim (unexpected host)',
    )
  }
  return body
}

export type FetchAccountsParams = {
  /** Unix seconds; omit with balancesOnly for a pure balance pull. */
  startDate?: number
  endDate?: number
  /** Restrict to these SimpleFIN account ids. */
  accountIds?: string[]
  /** Skip transactions entirely (cheapest call; used by refresh sweeps). */
  balancesOnly?: boolean
  /** Include pending transactions. */
  pending?: boolean
}

export async function fetchAccounts(
  accessUrl: string,
  params: FetchAccountsParams = {},
): Promise<SimpleFinAccountSet> {
  const { baseUrl, authHeader } = splitAccessUrl(accessUrl)
  const url = new URL(`${baseUrl}/accounts`)
  if (params.startDate != null) {
    url.searchParams.set('start-date', String(params.startDate))
  }
  if (params.endDate != null) {
    url.searchParams.set('end-date', String(params.endDate))
  }
  if (params.balancesOnly) url.searchParams.set('balances-only', '1')
  if (params.pending) url.searchParams.set('pending', '1')
  for (const id of params.accountIds ?? []) {
    url.searchParams.append('account', id)
  }

  const res = await timedFetch(
    url.toString(),
    { headers: { Authorization: authHeader, Accept: 'application/json' } },
    '/accounts',
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '<empty>')
    throw new SimpleFinApiError(res.status, res.statusText, body, '/accounts')
  }
  const parsed = (await res.json()) as Partial<SimpleFinAccountSet>
  return {
    errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
  }
}

/**
 * True when SimpleFIN affirmatively rejected our credentials — the
 * connection must be re-established (new Setup Token), a retry won't
 * help. 402 = subscription lapsed; 403 = access revoked/expired.
 */
export function isReconnectError(err: unknown): boolean {
  return (
    err instanceof SimpleFinApiError && (err.status === 402 || err.status === 403)
  )
}
