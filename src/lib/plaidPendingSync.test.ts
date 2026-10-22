// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncPendingCardPayments } from '../../supabase/functions/_shared/plaidPendingSync'

/**
 * Orchestration test for the Plaid pending-payment sync with an in-memory
 * Supabase stand-in and a mocked Plaid. (The Edge runtime itself is Deno; this
 * exercises the same module under Node with a Deno.env shim.)
 */

type Row = Record<string, any>

function fakeAdmin(tables: Record<string, Row[]>) {
  const from = (name: string) => {
    const rows = (tables[name] ??= [])
    const filters: Array<(r: Row) => boolean> = []
    let patch: Row | null = null
    let upsertRows: Row[] | null = null
    let orderCol: string | null = null
    let desc = false
    let max = Infinity
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      order: (c: string, o?: { ascending?: boolean }) => (
        (orderCol = c), (desc = o?.ascending === false), q
      ),
      limit: (n: number) => ((max = n), q),
      update: (p: Row) => ((patch = p), q),
      upsert: (r: Row[]) => ((upsertRows = r), q),
      then: (resolve: (v: unknown) => void) => {
        if (upsertRows) {
          for (const r of upsertRows) {
            const i = rows.findIndex((x) => x.account_id === r.account_id)
            if (i >= 0) rows[i] = r
            else rows.push(r)
          }
          return resolve({ data: null, error: null })
        }
        let hits = rows.filter((r) => filters.every((f) => f(r)))
        if (patch) {
          hits.forEach((r) => Object.assign(r, patch))
          return resolve({ data: null, error: null })
        }
        if (orderCol) {
          hits = [...hits].sort((a, b) =>
            desc ? String(b[orderCol!]).localeCompare(String(a[orderCol!])) : 0,
          )
        }
        resolve({ data: hits.slice(0, max), error: null })
      },
    }
    return q
  }
  return { from }
}

const FAMILY = 'fam-1'
const env: Record<string, string> = {
  PLAID_CLIENT_ID: 'id',
  PLAID_SECRET: 'secret',
  PLAID_ENV: 'sandbox',
}

const item = {
  accessToken: 'tok',
  plaidAccounts: [
    { account_id: 'p-chk', balances: { current: 2700, available: 2700 } },
    { account_id: 'p-card', balances: { current: 1200, available: null } },
  ],
  linked: [
    { id: 'chk', plaid_account_id: 'p-chk', account_type: 'checking' },
    { id: 'card', plaid_account_id: 'p-card', account_type: 'credit_card' },
  ],
}

const paymentInFlight = [
  {
    account_id: 'p-chk',
    amount: 300,
    date: '2026-10-22',
    pending: true,
    personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' },
  },
  { account_id: 'p-card', amount: -300, date: '2026-10-22', pending: true },
]

function mockPlaid(transactions: unknown[] | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (transactions instanceof Error) throw transactions
      return new Response(JSON.stringify({ transactions }), { status: 200 })
    }),
  )
}

let tables: Record<string, Row[]>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
  ;(globalThis as any).Deno = { env: { get: (k: string) => env[k] } }
  delete env.PLAID_PENDING_NETTING
  tables = {
    accounts: [{ id: 'card', family_id: FAMILY, source: 'plaid', account_type: 'credit_card', pending_payment_credit: 0 }],
    plaid_account_signals: [],
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const run = () => syncPendingCardPayments(fakeAdmin(tables), { familyId: FAMILY, items: [item] })
const credit = () => tables.accounts[0].pending_payment_credit

describe('syncPendingCardPayments', () => {
  it('nets a payment both sides show in flight', async () => {
    mockPlaid(paymentInFlight)
    await run()
    expect(tables.plaid_account_signals).toHaveLength(2)
    expect(credit()).toBe(300)
  })

  it('clears the credit once the payment has posted', async () => {
    mockPlaid(paymentInFlight)
    await run()
    expect(credit()).toBe(300)

    vi.setSystemTime(new Date('2026-10-22T12:10:00Z'))
    mockPlaid([]) // nothing pending any more
    await run()
    expect(credit()).toBe(0)
  })

  it('does not re-pull within the reuse window', async () => {
    mockPlaid(paymentInFlight)
    await run()
    await run()
    expect((fetch as any).mock.calls).toHaveLength(1)
  })

  it('a failing Plaid call never throws, and the credit ages out instead of sticking', async () => {
    mockPlaid(paymentInFlight)
    await run()
    expect(credit()).toBe(300)

    vi.setSystemTime(new Date('2026-10-22T12:10:00Z'))
    mockPlaid(new Error('boom'))
    await expect(run()).resolves.toBeUndefined()
    expect(credit()).toBe(300) // signals still fresh enough

    vi.setSystemTime(new Date('2026-10-23T01:00:00Z')) // >12h later
    await run()
    expect(credit()).toBe(0)
  })

  it('off mode never nets and resets any existing credit', async () => {
    tables.accounts[0].pending_payment_credit = 300
    env.PLAID_PENDING_NETTING = 'off'
    mockPlaid(paymentInFlight)
    await run()
    expect(credit()).toBe(0)
    expect((fetch as any).mock.calls).toHaveLength(0)
  })

  it('strict (default) ignores a cash-only payment; standard nets it', async () => {
    const cashOnly = paymentInFlight.slice(0, 1)
    mockPlaid(cashOnly)
    await run()
    expect(credit()).toBe(0)

    env.PLAID_PENDING_NETTING = 'standard'
    vi.setSystemTime(new Date('2026-10-22T12:10:00Z'))
    await run()
    expect(credit()).toBe(300)
  })
})
