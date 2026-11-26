import { describe, expect, it } from 'vitest'
import {
  addMember,
  createAdminFamily,
  getBucketAllocation,
  getFloatBalance,
  giveMoney,
  insertBucket,
  memberBalance,
  serviceClient,
  userClient,
} from './fixtures'

// Balances are numeric(14,2) but the money RPCs take a plain `numeric`. Before
// migration 114 a sub-cent amount was rounded separately on each side of a
// move, so 0.005 from a 10.00 bucket left 10.00 and 0.01: a cent created from
// nothing. Every money RPC now rejects amounts that aren't whole cents.
const WHOLE_CENTS = /whole number of cents/

async function familyWithCash(slug: string, cash: number) {
  const family = await createAdminFamily(slug)
  const svc = serviceClient()
  await svc.from('accounts').insert({
    family_id: family.familyId,
    owner_member_id: null,
    teller_account_id: `test-${crypto.randomUUID()}`,
    account_type: 'checking',
    current_balance: cash,
  })
  const admin = await userClient(family.adminEmail, family.adminPassword)
  return { family, svc, admin }
}

describe('money RPCs accept whole cents only', () => {
  it('move_money between buckets rejects half a cent and changes nothing', async () => {
    const family = await createAdminFamily('cents-move-b2b')
    const svc = serviceClient()
    const from = await insertBucket(svc, family.familyId, 'From', null, 10)
    const to = await insertBucket(svc, family.familyId, 'To', null)
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const { error } = await admin.rpc('move_money', {
      p_from_bucket_id: from,
      p_to_bucket_id: to,
      p_amount: 0.005,
    })

    expect(error?.message).toMatch(WHOLE_CENTS)
    expect(await getBucketAllocation(svc, from)).toBe(10)
    expect(await getBucketAllocation(svc, to)).toBe(0)
    const { count } = await svc
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', family.familyId)
    expect(count).toBe(0)
  })

  it('move_money rejects amounts that would round to zero with a clear error', async () => {
    const { family, svc, admin } = await familyWithCash('cents-move-tiny', 100)
    const to = await insertBucket(svc, family.familyId, 'To', null)

    const { error } = await admin.rpc('move_money', {
      p_from_bucket_id: null as unknown as string,
      p_to_bucket_id: to,
      p_amount: 0.004,
    })

    expect(error?.message).toMatch(WHOLE_CENTS)
    expect(await getBucketAllocation(svc, to)).toBe(0)
  })

  it('move_money still accepts whole cents', async () => {
    const family = await createAdminFamily('cents-move-ok')
    const svc = serviceClient()
    const from = await insertBucket(svc, family.familyId, 'From', null, 10)
    const to = await insertBucket(svc, family.familyId, 'To', null)
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const { error } = await admin.rpc('move_money', {
      p_from_bucket_id: from,
      p_to_bucket_id: to,
      p_amount: 0.01,
    })

    expect(error).toBeNull()
    expect(await getBucketAllocation(svc, from)).toBe(9.99)
    expect(await getBucketAllocation(svc, to)).toBe(0.01)
  })

  it('give_money rejects half a cent', async () => {
    const { family, admin, svc } = await familyWithCash('cents-give', 100)
    const child = await addMember(family.familyId, 'child', 'Kid')

    const { error } = await admin.rpc('give_money', {
      p_to_member_id: child.memberId,
      p_amount: 1.005,
    })

    expect(error?.message).toMatch(WHOLE_CENTS)
    expect(await getFloatBalance(admin)).toBe(100)
    expect(await memberBalance(svc, child.memberId)).toBe(0)
  })

  it('return_from_child rejects half a cent', async () => {
    const { family, admin, svc } = await familyWithCash('cents-return', 100)
    const child = await addMember(family.familyId, 'child', 'Kid')
    await giveMoney(admin, { toMemberId: child.memberId, amount: 10 })

    const { error } = await admin.rpc('return_from_child', {
      p_from_child_id: child.memberId,
      p_amount: 0.995,
    })

    expect(error?.message).toMatch(WHOLE_CENTS)
    expect(await getFloatBalance(admin)).toBe(90)
    expect(await memberBalance(svc, child.memberId)).toBe(10)
  })

  it('manual accounts reject fractional cents on add and update', async () => {
    const family = await createAdminFamily('cents-manual')
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const add = await admin.rpc('add_manual_account', {
      p_amount: 25.001,
      p_label: 'Cash jar',
    })
    expect(add.error?.message).toMatch(WHOLE_CENTS)

    const ok = await admin.rpc('add_manual_account', {
      p_amount: 25.5,
      p_label: 'Cash jar',
    })
    expect(ok.error).toBeNull()

    const update = await admin.rpc('update_manual_account', {
      p_account_id: ok.data as string,
      p_amount: 30.125,
      p_label: 'Cash jar',
    })
    expect(update.error?.message).toMatch(WHOLE_CENTS)
    expect(await getFloatBalance(admin)).toBe(25.5)
  })
})
