import { describe, expect, it } from 'vitest'
import {
  addMember,
  createAdminFamily,
  insertBucket,
  serviceClient,
  userClient,
} from './fixtures'

describe('RLS: tenant isolation and roles', () => {
  it('admin cannot read another family’s buckets', async () => {
    const familyA = await createAdminFamily('a')
    const familyB = await createAdminFamily('b')
    const svc = serviceClient()

    const bucketB = await insertBucket(svc, familyB.familyId, 'B groceries', null)

    const clientA = await userClient(familyA.adminEmail, familyA.adminPassword)
    const { data, error } = await clientA
      .from('buckets')
      .select('id')
      .eq('id', bucketB)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('child cannot see family-pool buckets', async () => {
    const family = await createAdminFamily('child-view')
    const svc = serviceClient()
    const poolId = await insertBucket(svc, family.familyId, 'Family pool', null)

    const child = await addMember(family.familyId, 'child', 'Alex')
    const childClient = await userClient(child.email, child.password)

    const { data, error } = await childClient
      .from('buckets')
      .select('id')
      .eq('id', poolId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('child sees only their own bucket', async () => {
    const family = await createAdminFamily('child-own')
    const svc = serviceClient()
    await insertBucket(svc, family.familyId, 'Family pool', null)

    const child = await addMember(family.familyId, 'child', 'Alex')
    const ownId = await insertBucket(
      svc,
      family.familyId,
      'Alex spending',
      child.memberId,
    )

    const childClient = await userClient(child.email, child.password)
    const { data, error } = await childClient.from('buckets').select('id')

    expect(error).toBeNull()
    expect(data?.map((r) => r.id).sort()).toEqual([ownId].sort())
  })

  it('member cannot create buckets', async () => {
    const family = await createAdminFamily('member-no-create')
    const member = await addMember(family.familyId, 'member', 'Jamie')
    const memberClient = await userClient(member.email, member.password)

    const { error } = await memberClient.from('buckets').insert({
      family_id: family.familyId,
      name: 'Jamie stash',
      owner_member_id: member.memberId,
      allocated_amount: 0,
    })

    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('admin can create a family-pool bucket', async () => {
    const family = await createAdminFamily('admin-create')
    const adminClient = await userClient(family.adminEmail, family.adminPassword)

    const { data, error } = await adminClient
      .from('buckets')
      .insert({
        family_id: family.familyId,
        name: 'Groceries',
        owner_member_id: null,
        allocated_amount: 0,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  it('child can create their own bucket', async () => {
    const family = await createAdminFamily('child-create')
    const child = await addMember(family.familyId, 'child', 'Alex')
    const childClient = await userClient(child.email, child.password)

    const { data, error } = await childClient
      .from('buckets')
      .insert({
        family_id: family.familyId,
        name: 'Allowance',
        owner_member_id: child.memberId,
        allocated_amount: 0,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  it('cannot create a bucket with a non-zero allocated_amount', async () => {
    const family = await createAdminFamily('bucket-mint')
    const child = await addMember(family.familyId, 'child', 'Alex')
    const childClient = await userClient(child.email, child.password)
    const adminClient = await userClient(family.adminEmail, family.adminPassword)

    for (const [client, owner] of [
      [childClient, child.memberId],
      [adminClient, null],
    ] as const) {
      for (const amount of [-50, 50]) {
        const { error } = await client.from('buckets').insert({
          family_id: family.familyId,
          name: `Mint ${amount}`,
          owner_member_id: owner,
          allocated_amount: amount,
        })
        expect(error).not.toBeNull()
      }
    }
  })
})
