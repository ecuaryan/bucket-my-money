import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { addMember, createAdminFamily } from './fixtures'
import { requireDbEnv } from './env'

/** Anonymous call to login_webauthn_options with a given browser Origin. */
async function optionsFor(origin: string, familyId: string, memberId: string) {
  const { url, anonKey } = requireDbEnv()
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Origin: origin } },
  })
  const { data, error } = await anon.rpc('login_webauthn_options', {
    p_family_id: familyId,
    p_member_id: memberId,
  })
  expect(error).toBeNull()
  return data as { error?: string; rpId?: string } & Record<string, unknown>
}

describe('login_webauthn_options relying-party origin allowlist', () => {
  it('trusts exact production origins and rejects other subdomains', async () => {
    const family = await createAdminFamily('rp-origin')
    const child = await addMember(family.familyId, 'child', 'Alex')

    for (const origin of [
      'https://evil.bucketmymoney.com',
      'https://bucketmymoney.com.evil.example',
      'http://app.bucketmymoney.com',
    ]) {
      const res = await optionsFor(origin, family.familyId, child.memberId)
      expect(res.error, origin).toBe('Unsupported origin')
    }

    for (const origin of [
      'https://app.bucketmymoney.com',
      'https://bucketmymoney.com',
      'https://www.bucketmymoney.com',
      'http://localhost:5173',
    ]) {
      const res = await optionsFor(origin, family.familyId, child.memberId)
      expect(res.error, origin).not.toBe('Unsupported origin')
    }
  })
})
