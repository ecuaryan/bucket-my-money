import { describe, expect, it } from 'vitest'
import {
  addMember,
  createAdminFamily,
  serviceClient,
  userClient,
} from './fixtures'

// Migration 103: authenticated may UPDATE only family_members.name and
// families.timezone. Before it, any admin could rewrite any column of any
// member row from the browser console (incl. user_id, which auth_member_id()
// trusts to decide who the caller is).

async function ownerRow(familyId: string) {
  const { data, error } = await serviceClient()
    .from('family_members')
    .select('id, user_id, role, pin_hash, pin_locked, is_account_owner')
    .eq('family_id', familyId)
    .eq('is_account_owner', true)
    .single()
  if (error) throw error
  return data
}

describe('family_members: column-level UPDATE', () => {
  it('a co-admin cannot repoint the owner row at their own login', async () => {
    const family = await createAdminFamily('grants-userid')
    const coAdmin = await addMember(family.familyId, 'admin', 'Co')
    const before = await ownerRow(family.familyId)
    const svc = serviceClient()
    const { data: coRow } = await svc
      .from('family_members')
      .select('user_id')
      .eq('id', coAdmin.memberId)
      .single()

    const client = await userClient(coAdmin.email, coAdmin.password)
    const { error } = await client
      .from('family_members')
      .update({ user_id: coRow!.user_id })
      .eq('id', before.id)

    expect(error).not.toBeNull()
    expect((await ownerRow(family.familyId)).user_id).toBe(before.user_id)

    // The real owner still resolves to the owner's member row.
    const owner = await userClient(family.adminEmail, family.adminPassword)
    const { data: me } = await owner.rpc('auth_member_id')
    expect(me).toBe(before.id)
  })

  it.each([
    ['pin_hash', { pin_hash: 'x' }],
    ['pin_locked', { pin_locked: true }],
    ['pin_failed_attempts', { pin_failed_attempts: 5 }],
    ['role', { role: 'child' }],
    ['is_account_owner', { is_account_owner: false }],
    ['family_id', { family_id: crypto.randomUUID() }],
  ])('an admin cannot update %s on a member row', async (_col, patch) => {
    const family = await createAdminFamily('grants-cols')
    const coAdmin = await addMember(family.familyId, 'admin', 'Co')
    const target = await addMember(family.familyId, 'member', 'Target')
    const svc = serviceClient()
    const { data: before } = await svc
      .from('family_members')
      .select('*')
      .eq('id', target.memberId)
      .single()

    const client = await userClient(coAdmin.email, coAdmin.password)
    const { error } = await client
      .from('family_members')
      .update(patch as never)
      .eq('id', target.memberId)

    expect(error).not.toBeNull()
    const { data: after } = await svc
      .from('family_members')
      .select('*')
      .eq('id', target.memberId)
      .single()
    expect(after).toEqual(before)
  })

  it('an admin can still rename a member', async () => {
    const family = await createAdminFamily('grants-rename')
    const target = await addMember(family.familyId, 'member', 'Before')
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const { error } = await admin
      .from('family_members')
      .update({ name: 'After' })
      .eq('id', target.memberId)

    expect(error).toBeNull()
    const { data } = await serviceClient()
      .from('family_members')
      .select('name')
      .eq('id', target.memberId)
      .single()
    expect(data?.name).toBe('After')
  })

  it('two members can never share one login', async () => {
    const family = await createAdminFamily('grants-unique')
    const owner = await ownerRow(family.familyId)
    const svc = serviceClient()

    const dup = await svc.from('family_members').insert({
      family_id: family.familyId,
      user_id: owner.user_id,
      name: 'Imposter',
      role: 'admin',
    })
    expect(dup.error?.message).toMatch(/duplicate key|unique/i)

    // Same through the admin's own client (the INSERT policy still allows admins).
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const viaClient = await admin.from('family_members').insert({
      family_id: family.familyId,
      user_id: owner.user_id,
      name: 'Imposter 2',
      role: 'admin',
    })
    expect(viaClient.error).not.toBeNull()
  })
})

describe('families: column-level UPDATE', () => {
  it('an admin can change timezone but not plan or join_code', async () => {
    const family = await createAdminFamily('grants-families')
    const svc = serviceClient()
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const { data: before } = await svc
      .from('families')
      .select('plan, join_code, timezone')
      .eq('id', family.familyId)
      .single()

    const tz = await admin
      .from('families')
      .update({ timezone: 'America/Denver' })
      .eq('id', family.familyId)
    expect(tz.error).toBeNull()

    const plan = await admin
      .from('families')
      .update({ plan: 'pro' })
      .eq('id', family.familyId)
    expect(plan.error).not.toBeNull()

    const code = await admin
      .from('families')
      .update({ join_code: 'HACKED' })
      .eq('id', family.familyId)
    expect(code.error).not.toBeNull()

    const { data: after } = await svc
      .from('families')
      .select('plan, join_code, timezone')
      .eq('id', family.familyId)
      .single()
    expect(after).toEqual({ ...before, timezone: 'America/Denver' })
  })

  it('rotating the join code still works through its RPC', async () => {
    const family = await createAdminFamily('grants-rotate')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const { data: before } = await serviceClient()
      .from('families')
      .select('join_code')
      .eq('id', family.familyId)
      .single()

    const { data, error } = await admin.rpc('rotate_family_join_code')
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data).not.toBe(before?.join_code)
  })
})
