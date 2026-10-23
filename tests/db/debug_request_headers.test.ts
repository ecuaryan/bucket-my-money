import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { requireDbEnv } from './env'

// Temporary diagnostic (migration 106): echoes the caller's own request
// headers, minus credentials. Removed together with the rate-limit fix.
describe('debug_request_headers', () => {
  it('returns the caller headers without credentials', async () => {
    const { url, anonKey } = requireDbEnv()
    const client = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-forwarded-for': '203.0.113.7' } },
    })

    const { data, error } = await client.rpc('debug_request_headers')
    expect(error).toBeNull()
    const headers = data as Record<string, string>
    expect(headers['x-forwarded-for']).toContain('203.0.113.7')
    expect(headers).not.toHaveProperty('authorization')
    expect(headers).not.toHaveProperty('apikey')
    expect(headers).not.toHaveProperty('cookie')
  })
})
