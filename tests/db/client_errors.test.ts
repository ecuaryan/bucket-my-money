import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { createAdminFamily, serviceClient, userClient } from './fixtures'
import { requireDbEnv } from './env'

// Migration 121: anonymous, scrubbed, bounded client error reports.

function anonClient() {
  const { url, anonKey } = requireDbEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function clearReports() {
  const { error } = await serviceClient().from('client_errors').delete().gte('id', 0)
  expect(error).toBeNull()
}

describe('client error reports', () => {
  beforeAll(clearReports)
  afterAll(clearReports)

  it('anyone can report; amounts, names, emails and ids are scrubbed; repeats count up', async () => {
    const frame = '    at f (https://app.test/assets/index-B3x9.js:12:345)'
    const report = (amount: string) => {
      const message = `Could not move $${amount} to "Groceries" for sam@example.com (7d0f8c2e-1111-4222-8333-944445555666)`
      return {
        p_kind: 'error',
        p_message: message,
        // Chrome repeats the message as the stack's first line.
        p_stack: `TypeError: ${message}\n${frame}\n    in Kid 42`,
        p_route: '/kids/7d0f8c2e-1111-4222-8333-944445555666',
        p_app_version: '1.21.14',
        p_browser: 'Safari 18 · iOS',
      }
    }
    expect((await anonClient().rpc('report_client_error', report('1,234.56'))).error).toBeNull()
    expect((await anonClient().rpc('report_client_error', report('9'))).error).toBeNull()

    const { data } = await serviceClient().from('client_errors').select('*')
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({
      kind: 'error',
      count: 2,
      message: 'Could not move $# to "…" for <email> (:id)',
      // Frames keep their line and column; the message copy and other digits go.
      stack: `TypeError: <message>\n${frame}\n    in Kid #`,
      route: '/kids/:id',
      app_version: '1.21.14',
      browser: 'Safari 18 · iOS',
    })
  })

  it('drops bad input instead of failing', async () => {
    expect((await anonClient().rpc('report_client_error', { p_kind: 'nope', p_message: 'x' })).error).toBeNull()
    expect((await anonClient().rpc('report_client_error', { p_kind: 'error', p_message: '   ' })).error).toBeNull()
    const { count } = await serviceClient()
      .from('client_errors')
      .select('id', { count: 'exact', head: true })
      .in('kind', ['nope'])
    expect(count).toBe(0)
  })

  it('no client can read the reports', async () => {
    const family = await createAdminFamily('client-errors-read')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    expect((await admin.from('client_errors').select('id')).error?.message).toMatch(/permission denied/i)
    expect((await anonClient().from('client_errors').select('id')).error?.message).toMatch(/permission denied/i)
  })

  it('stores at most 200 different errors a day', async () => {
    await clearReports()
    const anon = anonClient()
    const kinds = ['error', 'rejection', 'render']
    // Distinct messages (letters, since digits are scrubbed to one shape).
    const word = (i: number) => i.toString(26).replace(/\d/g, (d) => 'qrstuvwxyz'[Number(d)])
    await Promise.all(
      Array.from({ length: 205 }, (_, i) =>
        anon.rpc('report_client_error', { p_kind: kinds[i % 3], p_message: `Broke ${word(i)}` }),
      ),
    )
    const { count } = await serviceClient().from('client_errors').select('id', { count: 'exact', head: true })
    expect(count).toBeGreaterThanOrEqual(200)
    expect(count).toBeLessThanOrEqual(205) // concurrent inserts can pass the check together
    // Sequential reports past the cap are dropped.
    await anon.rpc('report_client_error', { p_kind: 'error', p_message: 'One too many' })
    const after = await serviceClient().from('client_errors').select('id', { count: 'exact', head: true })
    expect(after.count).toBe(count)
  })
})
