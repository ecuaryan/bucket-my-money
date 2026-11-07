import { describe, expect, it } from 'vitest'
import { TEST_AUTH_EMAIL_DOMAIN } from '@/lib/pinAuthDomain'
import {
  addMember,
  createAdminFamily,
  serviceClient,
  userClient,
} from './fixtures'

const PASSWORD = 'oauth-test-password-1'

// Stands in for a Google/Apple sign-in: GoTrue records the linked providers in
// raw_app_meta_data (clients cannot write it), which the RPC trusts.
async function createOAuthUser(provider: 'google' | 'apple' | 'email') {
  const svc = serviceClient()
  const email = `oauth-${crypto.randomUUID().slice(0, 8)}${TEST_AUTH_EMAIL_DOMAIN}`
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { provider, providers: [provider] },
    user_metadata: { full_name: 'Sam Rivera' },
  })
  if (error) throw error
  return { userId: data.user.id, email }
}

describe('bootstrap_oauth_household', () => {
  it('creates a household with the caller as account-owner admin', async () => {
    const u = await createOAuthUser('google')
    const client = await userClient(u.email, PASSWORD)

    const { data: memberId, error } = await client.rpc('bootstrap_oauth_household')
    expect(error).toBeNull()

    const { data: member } = await serviceClient()
      .from('family_members')
      .select('id, family_id, user_id, name, role, is_account_owner')
      .eq('user_id', u.userId)
      .single()
    expect(member?.id).toBe(memberId)
    expect(member).toMatchObject({
      name: 'Sam Rivera',
      role: 'admin',
      is_account_owner: true,
    })

    const { data: family } = await serviceClient()
      .from('families')
      .select('name, join_code')
      .eq('id', member!.family_id)
      .single()
    expect(family?.name).toBe("Sam's Family")
    expect(family?.join_code).toBeTruthy()
  })

  it('is idempotent and concurrency-safe: one household per user', async () => {
    const u = await createOAuthUser('apple')
    const client = await userClient(u.email, PASSWORD)

    const results = await Promise.all([
      client.rpc('bootstrap_oauth_household'),
      client.rpc('bootstrap_oauth_household'),
      client.rpc('bootstrap_oauth_household'),
    ])
    for (const r of results) expect(r.error).toBeNull()
    expect(new Set(results.map((r) => r.data)).size).toBe(1)

    const { data: rows } = await serviceClient()
      .from('family_members')
      .select('id')
      .eq('user_id', u.userId)
    expect(rows).toHaveLength(1)
  })

  it('leaves an existing member untouched (no second household)', async () => {
    const family = await createAdminFamily('oauth-existing')
    const client = await userClient(family.adminEmail, family.adminPassword)
    const { data } = await client.rpc('bootstrap_oauth_household')
    expect(data).toBe(family.adminMemberId)
  })

  it('refuses email-only accounts (e.g. an admin removed from a household)', async () => {
    const u = await createOAuthUser('email')
    const client = await userClient(u.email, PASSWORD)
    const { error } = await client.rpc('bootstrap_oauth_household')
    expect(error).not.toBeNull()

    const { data: rows } = await serviceClient()
      .from('family_members')
      .select('id')
      .eq('user_id', u.userId)
    expect(rows).toHaveLength(0)
  })

  it('returns the existing membership for PIN-only members', async () => {
    const family = await createAdminFamily('oauth-pin')
    const kid = await addMember(family.familyId, 'child', 'Kid')
    const client = await userClient(kid.email, kid.password)
    const { data } = await client.rpc('bootstrap_oauth_household')
    expect(data).toBe(kid.memberId)
  })

  it('is not callable signed out', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const { requireDbEnv } = await import('./env')
    const { url, anonKey } = requireDbEnv()
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await anon.rpc('bootstrap_oauth_household')
    expect(error).not.toBeNull()
  })
})
