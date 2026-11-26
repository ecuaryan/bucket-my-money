import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { createAdminFamily, serviceClient, userClient } from './fixtures'
import { requireDbEnv } from './env'

// Migration 121: anonymous, scrubbed, rate-limited, bounded client error reports.

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
  const { data, error } = await serviceClient().from('client_errors').select('*').order('id')
  expect(error).toBeNull()
  return data ?? []
}

async function reset() {
  const svc = serviceClient()
  expect((await svc.from('client_errors').delete().gte('id', 0)).error).toBeNull()
  // Every local request shares one address, so each test starts a fresh budget.
  expect((await svc.from('rate_limit_hits').delete().like('limit_key', 'preauth:client_error:%')).error).toBeNull()
}

describe('client error reports', () => {
  beforeEach(reset)
  afterAll(reset)

  it('anyone can report; numbers, names, emails, ids and codes are scrubbed; repeats count up', async () => {
    const frame = '    at f (https://app.test/assets/index-B3x9Kq1z.js:12:345)'
    const message = (amount: string) =>
      `Could not move $${amount} to "Groceries" for sam@example.com (7d0f8c2e-1111-4222-8333-944445555666)`
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
        message: 'Could not move $# to "…" for <email> (:id)',
        // Frames keep line:col; the message copy and every other number go.
        stack: `TypeError: <message>\n${frame}\nError: Paid Kid at #:#:#`,
        route: '/kids',
        app_version: '1.21.14',
        browser: 'Safari 18 · iOS',
      },
    ])
  })

  it('removes quoted phrases, =(…) values, long tokens and URL user names; keeps code identifiers', async () => {
    await report({
      p_message:
        "Cannot read properties of undefined (reading 'id') for Kid's 'College fund #2' Key (name)=(Emma fund) " +
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc https://user:secret@bridge.example/x ' +
        "Minified React error #418 'Sam Rivera",
    })
    expect((await rows())[0].message).toBe(
      "Cannot read properties of undefined (reading 'id') for Kid's \"…\" Key (name)=(…) <token> " +
        'https://bridge.example/x Minified React error #418 "…"',
    )
  })

  it('keeps only fixed routes, and one error keeps its identity across deploys', async () => {
    const stack = (hash: string, col: number) => `Error: Broke\n    at Plan (https://app.test/assets/index-${hash}.js:1:${col})`
    await report({ p_message: 'Broke', p_stack: stack('B3x9Kq1z', 10), p_route: '/kids/7d0f8c2e-1111-4222-8333-944445555666' })
    await report({ p_message: 'Broke', p_stack: stack('Zz81Lmq0', 99), p_route: '/settings' })
    const stored = await rows()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ count: 2, route: 'other' }) // the first report's route
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

  it('stores at most 200 different errors a day', async () => {
    const svc = serviceClient()
    const today = new Date().toISOString().slice(0, 10)
    const fill = Array.from({ length: 200 }, (_, i) => ({
      day: today,
      fingerprint: `seed-${i}`,
      kind: 'error',
      message: 'Seeded',
    }))
    expect((await svc.from('client_errors').insert(fill)).error).toBeNull()
    await report({ p_message: 'One too many' })
    expect(await rows()).toHaveLength(200)
  })

  it('no client can read the reports', async () => {
    const family = await createAdminFamily('client-errors-read')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    expect((await admin.from('client_errors').select('id')).error?.message).toMatch(/permission denied/i)
    expect((await anonClient().from('client_errors').select('id')).error?.message).toMatch(/permission denied/i)
  })
})
