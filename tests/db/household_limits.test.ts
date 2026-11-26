import { describe, expect, it } from 'vitest'
import { addMember, createAdminFamily, insertBucket, serviceClient, userClient } from './fixtures'

// Migration 120: per-household row limits, checked after each insert
// statement on every path (client RLS, RPCs, service role).

function names(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`)
}

describe('household limits', () => {
  it('caps buckets at 500 per household, kids included, and leaves other households alone', async () => {
    const family = await createAdminFamily('limit-buckets')
    const other = await createAdminFamily('limit-buckets-other')
    const child = await addMember(family.familyId, 'child', 'Kid')
    const svc = serviceClient()

    const fill = names('Bucket', 499).map((name) => ({ family_id: family.familyId, name, allocated_amount: 0 }))
    expect((await svc.from('buckets').insert(fill)).error).toBeNull()

    // The child's RLS shows only their own buckets; the count still sees all.
    const kid = await userClient(child.email, child.password)
    const last = await kid
      .from('buckets')
      .insert({ family_id: family.familyId, owner_member_id: child.memberId, name: 'Kid 1', allocated_amount: 0 })
    expect(last.error).toBeNull() // 500

    const over = await kid
      .from('buckets')
      .insert({ family_id: family.familyId, owner_member_id: child.memberId, name: 'Kid 2', allocated_amount: 0 })
    expect(over.error?.code).toBe('54000')
    expect(over.error?.message).toBe('A household can have up to 500 buckets.')

    const admin = await userClient(family.adminEmail, family.adminPassword)
    const adminOver = await admin
      .from('buckets')
      .insert({ family_id: family.familyId, name: 'One more', allocated_amount: 0 })
    expect(adminOver.error?.code).toBe('54000')

    const { count } = await svc
      .from('buckets')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', family.familyId)
    expect(count).toBe(500)

    await expect(insertBucket(svc, other.familyId, 'Fine', null)).resolves.toBeTruthy()
  })

  it('rolls back a whole bulk insert that crosses the member limit', async () => {
    const family = await createAdminFamily('limit-members') // 1 member
    const svc = serviceClient()
    const rows = (count: number, prefix: string) =>
      names(prefix, count).map((name) => ({ family_id: family.familyId, name, role: 'member' as const }))

    const over = await svc.from('family_members').insert(rows(25, 'Too many'))
    expect(over.error?.code).toBe('54000')
    expect(over.error?.message).toBe('A household can have up to 25 members.')
    const after = await svc
      .from('family_members')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', family.familyId)
    expect(after.count).toBe(1)

    expect((await svc.from('family_members').insert(rows(24, 'Member'))).error).toBeNull() // 25
    expect((await svc.from('family_members').insert(rows(1, 'Extra'))).error?.code).toBe('54000')
  })

  it('caps bucket groups at 50 per member through the RPC', async () => {
    const family = await createAdminFamily('limit-groups')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    for (let i = 1; i <= 50; i += 1) {
      expect((await admin.rpc('create_bucket_group', { p_name: `Group ${i}` })).error).toBeNull()
    }
    const over = await admin.rpc('create_bucket_group', { p_name: 'Group 51' })
    expect(over.error?.code).toBe('54000')
    expect(over.error?.message).toBe('You can have up to 50 groups.')
  })

  it('caps accounts at 100 and Auto-bucket rules at 100 per household', async () => {
    const family = await createAdminFamily('limit-accounts-rules')
    const svc = serviceClient()
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const accounts = names('Cash', 100).map((account_name) => ({
      family_id: family.familyId,
      account_name,
      source: 'manual',
      account_type: 'manual',
      current_balance: 0,
    }))
    expect((await svc.from('accounts').insert(accounts)).error).toBeNull()
    const accountOver = await admin.rpc('add_manual_account', { p_amount: 1, p_label: 'One more' })
    expect(accountOver.error?.code).toBe('54000')
    expect(accountOver.error?.message).toBe('A household can have up to 100 accounts.')

    const rules = names('Rule', 100).map((name) => ({
      family_id: family.familyId,
      name,
      created_by_member_id: family.adminMemberId,
      auto_organize_type: 'manual',
    }))
    expect((await svc.from('auto_organizes').insert(rules)).error).toBeNull()
    const ruleOver = await admin.from('auto_organizes').insert({
      family_id: family.familyId,
      name: 'Rule 101',
      created_by_member_id: family.adminMemberId,
      auto_organize_type: 'manual',
    })
    expect(ruleOver.error?.code).toBe('54000')
    expect(ruleOver.error?.message).toBe('A household can have up to 100 Auto-bucket rules.')
  })

  it('caps an Auto-bucket rule at 300 lines', async () => {
    const family = await createAdminFamily('limit-rule-lines')
    const svc = serviceClient()
    const bucketId = await insertBucket(svc, family.familyId, 'Groceries', null)
    const { data: rule, error } = await svc
      .from('auto_organizes')
      .insert({
        family_id: family.familyId,
        name: 'Payday',
        created_by_member_id: family.adminMemberId,
        auto_organize_type: 'manual',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    const lines = (count: number, start: number) =>
      Array.from({ length: count }, (_, i) => ({
        auto_organize_id: rule!.id,
        bucket_id: bucketId,
        amount: 1,
        sort_order: start + i,
      }))
    expect((await svc.from('auto_organize_lines').insert(lines(300, 0))).error).toBeNull()
    const over = await svc.from('auto_organize_lines').insert(lines(1, 300))
    expect(over.error?.code).toBe('54000')
    expect(over.error?.message).toBe('An Auto-bucket rule can have up to 300 buckets.')
  })
})
