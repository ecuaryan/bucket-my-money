import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { addMember, createAdminFamily, insertBucket, serviceClient, userClient } from './fixtures'
import { requireDbEnv } from './env'

// Migration 108. The signed-out role may run ONLY the login-screen RPCs and
// touch NO table. A future migration that widens this fails here on purpose:
// add the function to ALLOWED_ANON_FUNCTIONS only after reviewing that it checks
// its own caller and cannot be driven by caller-supplied tenant ids.
const ALLOWED_ANON_FUNCTIONS = ['login_roster', 'login_webauthn_options', 'member_login_methods']

function anonClient() {
  const { url, anonKey } = requireDbEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('anon surface (allow-list)', () => {
  it('exposes exactly the login-screen RPCs and no tables', async () => {
    const { data, error } = await serviceClient().rpc('anon_exposed_surface')
    expect(error).toBeNull()
    const surface = data as { functions: string[]; tables: string[] }
    expect([...surface.functions].sort()).toEqual([...ALLOWED_ANON_FUNCTIONS].sort())
    expect(surface.tables).toEqual([])
  })

  it('is not itself callable by clients', async () => {
    const family = await createAdminFamily('anon-surface-introspection')
    const member = await userClient(family.adminEmail, family.adminPassword)
    expect((await anonClient().rpc('anon_exposed_surface')).error).not.toBeNull()
    expect((await member.rpc('anon_exposed_surface')).error).not.toBeNull()
  })

  it('refuses table reads outright, not just empty results', async () => {
    const { error } = await anonClient().from('buckets').select('id').limit(1)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/permission denied/i)
  })

  it('the login RPCs still answer', async () => {
    const { data, error } = await anonClient().rpc('login_roster', { p_code: 'ZZZZZZZZ' })
    expect(error).toBeNull()
    expect(data).toBeNull() // no such household
  })
})

describe('internal money helpers cannot be called by clients', () => {
  it('anon and a signed-in kid cannot mint money into a bucket', async () => {
    const family = await createAdminFamily('helpers-locked')
    const kid = await addMember(family.familyId, 'child', 'Kid')
    const svc = serviceClient()
    const bucketId = await insertBucket(svc, family.familyId, 'Mine', kid.memberId, 10)
    const args = {
      p_family_id: family.familyId,
      p_owner_member_id: kid.memberId,
      p_to_bucket_id: bucketId,
      p_amount: 250000,
      p_note: 'forged',
      p_float_member_id: kid.memberId,
      p_from_member_id: kid.memberId,
      p_auto_organize_run_id: null as unknown as string,
    }

    const asAnon = await anonClient().rpc('_auto_organize_apply_line', args)
    expect(asAnon.error).not.toBeNull()
    const kidClient = await userClient(kid.email, kid.password)
    const asKid = await kidClient.rpc('_auto_organize_apply_line', args)
    expect(asKid.error).not.toBeNull()

    const sweep = await kidClient.rpc('_auto_organize_sweep_line', {
      p_family_id: family.familyId,
      p_owner_member_id: kid.memberId,
      p_from_bucket_id: bucketId,
      p_to_bucket_id: null as unknown as string,
      p_amount: 1,
      p_note: 'forged',
      p_float_member_id: kid.memberId,
      p_from_member_id: kid.memberId,
      p_auto_organize_run_id: null as unknown as string,
    })
    expect(sweep.error).not.toBeNull()

    const { data } = await svc.from('buckets').select('allocated_amount').eq('id', bucketId).single()
    expect(Number(data?.allocated_amount)).toBe(10)
    const { count } = await svc
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', family.familyId)
    expect(count).toBe(0)
  })

  it("a child's give balance is not readable by anon", async () => {
    const family = await createAdminFamily('give-net-locked')
    const kid = await addMember(family.familyId, 'child', 'Kid')
    const { error } = await anonClient().rpc('member_child_give_net', { p_child_member_id: kid.memberId })
    expect(error).not.toBeNull()
  })
})
