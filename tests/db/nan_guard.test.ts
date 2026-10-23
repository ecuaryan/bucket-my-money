import { describe, expect, it } from 'vitest'
import {
  addMember,
  createAdminFamily,
  getBucketAllocation,
  getFloatBalance,
  insertBucket,
  serviceClient,
  userClient,
} from './fixtures'

// Postgres `numeric` accepts 'NaN' and sorts it above every number, so a plain
// `amount > 0` check lets it through. Migration 101 adds CHECK constraints on
// every money column. PostgREST casts the string to numeric, which is how a
// hostile client would send it.
const NAN = 'NaN' as unknown as number

describe('NaN amounts are rejected everywhere money is written', () => {
  it('move_money from Unbucketed into a bucket leaves the bucket untouched', async () => {
    const family = await createAdminFamily('nan-move')
    const svc = serviceClient()
    const bucketId = await insertBucket(svc, family.familyId, 'Groceries', null)
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const { error } = await admin.rpc('move_money', {
      p_from_bucket_id: null as unknown as string,
      p_to_bucket_id: bucketId,
      p_amount: NAN,
    })

    expect(error).not.toBeNull()
    expect(await getBucketAllocation(svc, bucketId)).toBe(0)
    const { count } = await svc
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', family.familyId)
    expect(count).toBe(0)
  })

  it('move_money between buckets rejects NaN', async () => {
    const family = await createAdminFamily('nan-move-b2b')
    const svc = serviceClient()
    const from = await insertBucket(svc, family.familyId, 'A', null, 100)
    const to = await insertBucket(svc, family.familyId, 'B', null)
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const { error } = await admin.rpc('move_money', {
      p_from_bucket_id: from,
      p_to_bucket_id: to,
      p_amount: NAN,
    })

    expect(error).not.toBeNull()
    expect(await getBucketAllocation(svc, from)).toBe(100)
    expect(await getBucketAllocation(svc, to)).toBe(0)
  })

  it('give_money rejects NaN', async () => {
    const family = await createAdminFamily('nan-give')
    const child = await addMember(family.familyId, 'child', 'Kid')
    const svc = serviceClient()
    await svc.from('accounts').insert({
      family_id: family.familyId,
      owner_member_id: null,
      teller_account_id: `test-${crypto.randomUUID()}`,
      account_type: 'checking',
      current_balance: 100,
    })
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const { error } = await admin.rpc('give_money', {
      p_to_member_id: child.memberId,
      p_amount: NAN,
    })

    expect(error).not.toBeNull()
    expect(await getFloatBalance(admin)).toBe(100)
  })

  it('manual accounts reject NaN on add and update', async () => {
    const family = await createAdminFamily('nan-manual')
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const add = await admin.rpc('add_manual_account', {
      p_amount: NAN,
      p_label: 'Cash jar',
    })
    expect(add.error).not.toBeNull()

    const ok = await admin.rpc('add_manual_account', {
      p_amount: 25,
      p_label: 'Cash jar',
    })
    expect(ok.error).toBeNull()

    const update = await admin.rpc('update_manual_account', {
      p_account_id: ok.data as string,
      p_amount: NAN,
      p_label: 'Cash jar',
    })
    expect(update.error).not.toBeNull()
    expect(await getFloatBalance(admin)).toBe(25)
  })

  it('the storage columns themselves refuse NaN', async () => {
    const family = await createAdminFamily('nan-columns')
    const svc = serviceClient()
    const bucketId = await insertBucket(svc, family.familyId, 'Direct', null)

    const bucket = await svc
      .from('buckets')
      .update({ allocated_amount: NAN })
      .eq('id', bucketId)
    expect(bucket.error?.message).toMatch(/not_nan|check constraint/)

    const account = await svc.from('accounts').insert({
      family_id: family.familyId,
      owner_member_id: null,
      teller_account_id: `test-${crypto.randomUUID()}`,
      account_type: 'checking',
      current_balance: NAN,
    })
    expect(account.error?.message).toMatch(/not_nan|check constraint/)
  })
})
