import { describe, expect, it } from 'vitest'
import { addMember, createAdminFamily, userClient } from './fixtures'

describe('member_bank_order / save_bank_order', () => {
  it('saves and replaces the caller\'s order, top to bottom', async () => {
    const family = await createAdminFamily('bank-order')
    const admin = await userClient(family.adminEmail, family.adminPassword)

    expect((await admin.rpc('save_bank_order', { p_keys: ['ally', 'chase', 'fidelity'] })).error).toBeNull()
    expect((await admin.rpc('save_bank_order', { p_keys: ['fidelity', 'ally'] })).error).toBeNull()

    const { data, error } = await admin
      .from('member_bank_order')
      .select('institution_key, display_order')
      .order('display_order')
    expect(error).toBeNull()
    expect(data?.map((r) => r.institution_key)).toEqual(['fidelity', 'ally'])
  })

  it('keeps each member\'s order private', async () => {
    const family = await createAdminFamily('bank-order-private')
    const member = await addMember(family.familyId, 'member', 'Spouse')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const spouse = await userClient(member.email, member.password)

    await admin.rpc('save_bank_order', { p_keys: ['ally', 'chase'] })
    await spouse.rpc('save_bank_order', { p_keys: ['chase', 'ally'] })

    const read = async (c: typeof admin) =>
      ((await c.from('member_bank_order').select('institution_key').order('display_order')).data ?? []).map(
        (r) => r.institution_key,
      )
    expect(await read(admin)).toEqual(['ally', 'chase'])
    expect(await read(spouse)).toEqual(['chase', 'ally'])
  })

  it('does not allow direct writes or bad input', async () => {
    const family = await createAdminFamily('bank-order-guard')
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const direct = await admin
      .from('member_bank_order')
      .insert({ member_id: family.adminMemberId, institution_key: 'x', display_order: 1 })
    expect(direct.error).not.toBeNull()

    const tooMany = await admin.rpc('save_bank_order', {
      p_keys: Array.from({ length: 201 }, (_, i) => `bank-${i}`),
    })
    expect(tooMany.error).not.toBeNull()
  })
})
