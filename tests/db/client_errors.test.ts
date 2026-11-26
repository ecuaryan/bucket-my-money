import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { createAdminFamily, serviceClient, userClient } from './fixtures'
import { requireDbEnv } from './env'

// Migration 121: anonymous, scrubbed (failing safe), rate-limited, bounded
// client error reports.

function anonClient() {
  const { url, anonKey } = requireDbEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

type Report = Database['public']['Functions']['report_client_error']['Args']

async function report(args: Partial<Report> & Pick<Report, 'p_message'>) {
  const { error } = await anonClient().rpc('report_client_error', { p_kind: 'error', ...args })
  expect(error).toBeNull()
}

async function rows() {
  const { data, error } = await serviceClient().from('client_errors').select('*').order('message')
  expect(error).toBeNull()
  return data ?? []
}

/** What one report's message is stored as. */
async function stored(message: string): Promise<string> {
  await reset()
  await report({ p_message: message })
  const all = await rows()
  expect(all).toHaveLength(1)
  return all[0].message
}

async function reset() {
  const svc = serviceClient()
  expect((await svc.from('client_errors').delete().neq('fingerprint', '')).error).toBeNull()
  // Every local request shares one address, so each test starts a fresh budget.
  expect((await svc.from('rate_limit_hits').delete().like('limit_key', 'preauth:client_error%')).error).toBeNull()
}

describe('client error reports', () => {
  beforeEach(reset)
  afterAll(reset)

  it('anyone can report; it is scrubbed; repeats count up', async () => {
    const frame = '    at f (https://app.test/assets/index-B3x9Kq1z.js:12:345)'
    const message = (amount: string) => `Could not move $${amount} to "Groceries" for sam@example.com`
    for (const amount of ['1,234.56', '9']) {
      await report({
        p_message: message(amount),
        // Chrome repeats the message as the stack's first line.
        p_stack: `TypeError: ${message(amount)}\n${frame}\nError: Paid Kid at 10:15:30`,
        p_route: '/kids',
        p_app_version: '1.21.14',
        p_browser: 'Safari 18 · iOS',
      })
    }
    expect(await rows()).toMatchObject([
      {
        kind: 'error',
        count: 2,
        message: 'Could not move $# to "…"',
        // A frame keeps its file name and line:col; other lines lose numbers.
        stack: `TypeError: <message>\n${frame}\nError: Paid Kid at #:#:#`,
        route: '/kids',
        app_version: '1.21.14',
        browser: 'Safari 18 · iOS',
      },
    ])
  })

  it('fails safe on quotes: from any stray quote, the rest of the line goes', async () => {
    // A code identifier and in-word apostrophes stay; the quoted name doesn't.
    expect(await stored("Cannot read properties of undefined (reading 'id') for Kid's 'Sam Rivera' ok")).toBe(
      "Cannot read properties of undefined (reading 'id') for Kid's \"…\"",
    )
    // A plural possessive's quote would shift naive pairing; nothing leaks.
    expect(await stored("The Riveras' savings 'Sam Rivera' x")).toBe('The Riveras"…"')
    expect(await stored('x" "Sam Rivera"')).toBe('x"…"')
    expect(await stored('Move to ‘Sam’s fund’ failed')).toBe('Move to "…"')
    expect(await stored(`Unexpected token 'a', "{"name":"Sam Rivera"}" is not valid JSON`)).toBe(
      "Unexpected token 'a', \"…\"",
    )
  })

  it('removes =(…) values, emails, tokens, codes and URL user names; keeps React codes', async () => {
    expect(await stored('Key (name)=(Emma (big) fund) after')).toBe('Key (name)=(…)')
    expect(await stored('mail sam@localhost or sam＠example.com')).toBe('mail <email> or <email>')
    expect(
      await stored(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc at https://user:p@ss@bridge.example/x code ABCDEFGH',
      ),
    ).toBe('<token> at https://bridge.example/x code <code>')
    expect(await stored('Minified React error #418; 7d0f8c2e-1111-4222-8333-944445555666 ٣٤٥')).toBe(
      'Minified React error #418; :id #',
    )
  })

  it('frame lines keep numbers only in the file name and final line:col', async () => {
    await report({
      p_message: 'Broke',
      p_stack:
        'Error: Broke\n    at https://app.test/kids?amount=1234:1:2\n    at Sam paid 4321 to x (https://app.test/assets/index-B3x9.js:7:8)',
    })
    expect((await rows())[0].stack).toBe(
      'Error: Broke\n    at https://app.test/kids?amount=#:1:2\n    at Sam paid # to x (https://app.test/assets/index-B3x9.js:7:8)',
    )
  })

  it('keeps only the app’s routes and real versions; one error keeps its identity across deploys', async () => {
    const stack = (chunk: string, col: number) => `Error: Broke\n    at Xe (https://app.test/assets/${chunk}.js:1:${col})`
    await report({ p_message: 'Broke', p_stack: stack('GivePage-9S5-kLxN', 10), p_route: '/sam-rivera', p_app_version: 'SamRivera1234' })
    await report({ p_message: 'Broke', p_stack: stack('GivePage-Zz81Lmq0', 99), p_route: '/give', p_app_version: '1.21.15' })
    const all = await rows()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ count: 2, route: 'other', app_version: null }) // the first report's
  })

  it('a short message never mangles the stack', async () => {
    const stack = 'Error: x\n    at fix (https://app.test/assets/index-B3x9.js:1:2)'
    await report({ p_kind: 'render', p_message: 'x', p_stack: stack })
    expect((await rows())[0].stack).toBe(stack)
  })

  it('drops bad input instead of failing', async () => {
    await report({ p_kind: 'nope', p_message: 'x' })
    await report({ p_kind: null as unknown as string, p_message: 'x' })
    await report({ p_message: '   ' })
    expect(await rows()).toHaveLength(0)
  })

  it('takes 30 reports an hour from one address, then drops the rest', async () => {
    for (let i = 0; i < 32; i += 1) await report({ p_message: 'Same error' })
    expect((await rows())[0].count).toBe(30)
  })

  it('takes 40 reports a day from one address', async () => {
    const svc = serviceClient()
    await report({ p_message: 'First' })
    // Spend 38 more of today's 40, as earlier hours would have.
    const { data: key } = await svc
      .from('rate_limit_hits')
      .select('limit_key')
      .like('limit_key', 'preauth:client_error_day:%')
      .limit(1)
      .single()
    const earlier = new Date(Date.now() - 2 * 3600_000).toISOString()
    const spent = Array.from({ length: 38 }, () => ({ limit_key: key!.limit_key, created_at: earlier }))
    expect((await svc.from('rate_limit_hits').insert(spent)).error).toBeNull()
    await report({ p_message: 'Fortieth' })
    await report({ p_message: 'Forty-first' })
    expect((await rows()).map((r) => r.message)).toEqual(['First', 'Fortieth'])
  })

  it('stores at most 200 different errors a day', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const fill = Array.from({ length: 200 }, (_, i) => ({ day: today, fingerprint: `seed-${i}`, kind: 'error', message: 'Seeded' }))
    expect((await serviceClient().from('client_errors').insert(fill)).error).toBeNull()
    await report({ p_message: 'One too many' })
    expect(await rows()).toHaveLength(200)
  })

  it('no client can read the reports', async () => {
    const family = await createAdminFamily('client-errors-read')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    expect((await admin.from('client_errors').select('day')).error?.message).toMatch(/permission denied/i)
    expect((await anonClient().from('client_errors').select('day')).error?.message).toMatch(/permission denied/i)
  })
})
