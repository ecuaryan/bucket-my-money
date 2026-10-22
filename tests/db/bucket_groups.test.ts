import { describe, expect, it } from 'vitest'
import {
  addMember,
  createAdminFamily,
  insertBucket,
  serviceClient,
  userClient,
} from './fixtures'

async function groupRows(client: Awaited<ReturnType<typeof userClient>>) {
  const { data, error } = await client
    .from('member_bucket_groups')
    .select('id, name, is_ungrouped, display_order')
    .order('display_order')
  expect(error).toBeNull()
  return data ?? []
}

async function bucketGroups(client: Awaited<ReturnType<typeof userClient>>) {
  const { data, error } = await client
    .from('member_bucket_order')
    .select('bucket_id, group_id, display_order')
    .order('display_order')
  expect(error).toBeNull()
  return data ?? []
}

describe('bucket groups', () => {
  it('creates groups above Ungrouped and saves a full layout', async () => {
    const family = await createAdminFamily('groups-layout')
    const svc = serviceClient()
    const a = await insertBucket(svc, family.familyId, 'A', null)
    const b = await insertBucket(svc, family.familyId, 'B', null)
    const c = await insertBucket(svc, family.familyId, 'C', null)
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const g1 = await admin.rpc('create_bucket_group', { p_name: 'Cruise' })
    expect(g1.error).toBeNull()
    const g2 = await admin.rpc('create_bucket_group', { p_name: '  ' })
    expect(g2.error).toBeNull()

    const rows = await groupRows(admin)
    // Ungrouped (holds every existing bucket), then new groups appended below.
    expect(rows.map((r) => [r.name, r.is_ungrouped])).toEqual([
      [null, true],
      ['Cruise', false],
      [null, false],
    ])

    const ungrouped = rows[0].id
    const { error } = await admin.rpc('save_bucket_layout', {
      p_layout: [
        { group_id: g2.data, bucket_ids: [c] },
        { group_id: g1.data, bucket_ids: [] },
        { group_id: null, bucket_ids: [b, a] },
      ],
    })
    expect(error).toBeNull()

    const after = await groupRows(admin)
    expect(after.map((r) => r.id)).toEqual([g2.data, g1.data, ungrouped])
    const placed = await bucketGroups(admin)
    expect(placed.map((r) => [r.bucket_id, r.group_id])).toEqual([
      [c, g2.data],
      [b, null],
      [a, null],
    ])
  })

  it('deleting a group only ungroups its buckets', async () => {
    const family = await createAdminFamily('groups-delete')
    const svc = serviceClient()
    const a = await insertBucket(svc, family.familyId, 'A', null)
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const g = await admin.rpc('create_bucket_group', { p_name: 'Temp' })
    await admin.rpc('save_bucket_layout', {
      p_layout: [
        { group_id: g.data, bucket_ids: [a] },
        { group_id: null, bucket_ids: [] },
      ],
    })

    const del = await admin.rpc('delete_bucket_group', { p_group_id: g.data })
    expect(del.error).toBeNull()

    const { data: bucket } = await admin.from('buckets').select('id').eq('id', a)
    expect(bucket).toHaveLength(1)
    expect((await bucketGroups(admin))[0].group_id).toBeNull()
    // Last real group gone → Ungrouped position row cleaned up too.
    expect(await groupRows(admin)).toEqual([])
  })

  it('renames and clears a group name', async () => {
    const family = await createAdminFamily('groups-rename')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const g = await admin.rpc('create_bucket_group', { p_name: 'Kids' })

    expect(
      (await admin.rpc('rename_bucket_group', {
        p_group_id: g.data,
        p_name: 'Kiddos',
      })).error,
    ).toBeNull()
    expect((await groupRows(admin)).find((r) => r.id === g.data)?.name).toBe('Kiddos')

    await admin.rpc('rename_bucket_group', { p_group_id: g.data, p_name: ' ' })
    expect((await groupRows(admin)).find((r) => r.id === g.data)?.name).toBeNull()
  })

  it('rejects layouts that miss a bucket or group', async () => {
    const family = await createAdminFamily('groups-invalid')
    const svc = serviceClient()
    const a = await insertBucket(svc, family.familyId, 'A', null)
    await insertBucket(svc, family.familyId, 'B', null)
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const g = await admin.rpc('create_bucket_group', { p_name: 'G' })

    const missingBucket = await admin.rpc('save_bucket_layout', {
      p_layout: [
        { group_id: g.data, bucket_ids: [a] },
        { group_id: null, bucket_ids: [] },
      ],
    })
    expect(missingBucket.error).not.toBeNull()

    const missingGroup = await admin.rpc('save_bucket_layout', {
      p_layout: [{ group_id: null, bucket_ids: [a] }],
    })
    expect(missingGroup.error).not.toBeNull()
  })

  it('isolates groups per member', async () => {
    const family = await createAdminFamily('groups-isolation')
    const member = await addMember(family.familyId, 'member', 'Spouse')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const spouse = await userClient(member.email, member.password)

    const g = await admin.rpc('create_bucket_group', { p_name: 'Mine' })
    expect(await groupRows(spouse)).toEqual([])

    const steal = await spouse.rpc('rename_bucket_group', {
      p_group_id: g.data,
      p_name: 'Hacked',
    })
    expect(steal.error).not.toBeNull()
    const del = await spouse.rpc('delete_bucket_group', { p_group_id: g.data })
    expect(del.error).not.toBeNull()
    expect((await groupRows(admin)).some((r) => r.name === 'Mine')).toBe(true)

    const direct = await spouse
      .from('member_bucket_groups')
      .insert({ member_id: member.memberId, name: 'x' })
    expect(direct.error).not.toBeNull()
  })

  it('lets a shared member group the household buckets independently', async () => {
    const family = await createAdminFamily('groups-member')
    const svc = serviceClient()
    const a = await insertBucket(svc, family.familyId, 'A', null)
    const b = await insertBucket(svc, family.familyId, 'B', null)
    const member = await addMember(family.familyId, 'member', 'Spouse')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const spouse = await userClient(member.email, member.password)

    const g = await spouse.rpc('create_bucket_group', { p_name: 'Spouse only' })
    expect(g.error).toBeNull()
    const save = await spouse.rpc('save_bucket_layout', {
      p_layout: [
        { group_id: null, bucket_ids: [a] },
        { group_id: g.data, bucket_ids: [b] },
      ],
    })
    expect(save.error).toBeNull()

    expect((await bucketGroups(spouse)).map((r) => [r.bucket_id, r.group_id])).toEqual([
      [a, null],
      [b, g.data],
    ])
    // The admin's view is untouched: no groups, nothing assigned.
    expect(await groupRows(admin)).toEqual([])
    expect((await bucketGroups(admin)).every((r) => r.group_id === null)).toBe(true)
  })

  it('lets a child group their own buckets but never anyone else\'s', async () => {
    const family = await createAdminFamily('groups-child')
    const svc = serviceClient()
    const child = await addMember(family.familyId, 'child', 'Kid')
    const pool = await insertBucket(svc, family.familyId, 'Pool', null)
    const x = await insertBucket(svc, family.familyId, 'X', child.memberId)
    const y = await insertBucket(svc, family.familyId, 'Y', child.memberId)
    const kid = await userClient(child.email, child.password)

    const g = await kid.rpc('create_bucket_group', { p_name: 'Savings' })
    expect(g.error).toBeNull()

    const ok = await kid.rpc('save_bucket_layout', {
      p_layout: [
        { group_id: g.data, bucket_ids: [y] },
        { group_id: null, bucket_ids: [x] },
      ],
    })
    expect(ok.error).toBeNull()

    // A family-pool bucket is not visible to the child, so it can't be slipped in.
    const sneaky = await kid.rpc('save_bucket_layout', {
      p_layout: [
        { group_id: g.data, bucket_ids: [y, pool] },
        { group_id: null, bucket_ids: [x] },
      ],
    })
    expect(sneaky.error).not.toBeNull()
    expect((await bucketGroups(kid)).map((r) => r.bucket_id).sort()).toEqual([x, y].sort())
  })

  it('rejects a layout that is missing a bucket added after it was loaded', async () => {
    const family = await createAdminFamily('groups-stale')
    const svc = serviceClient()
    const a = await insertBucket(svc, family.familyId, 'A', null)
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const g = await admin.rpc('create_bucket_group', { p_name: 'G' })

    // Someone adds a bucket after this client loaded its layout.
    const added = await insertBucket(svc, family.familyId, 'Added', null)
    const stale = await admin.rpc('save_bucket_layout', {
      p_layout: [
        { group_id: null, bucket_ids: [a] },
        { group_id: g.data, bucket_ids: [] },
      ],
    })
    expect(stale.error).not.toBeNull()

    // A fresh load picks the new bucket up in Ungrouped, and saving works again.
    const fresh = await admin.rpc('save_bucket_layout', {
      p_layout: [
        { group_id: null, bucket_ids: [a, added] },
        { group_id: g.data, bucket_ids: [] },
      ],
    })
    expect(fresh.error).toBeNull()
  })
})
