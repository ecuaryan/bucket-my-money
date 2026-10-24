import { describe, expect, it } from 'vitest'
import { createAdminFamily, serviceClient, userClient } from './fixtures'

// Migration 109. Signed-in users keep exactly the table privileges row-level
// security can scope: no TRUNCATE (it ignores RLS), DELETE only where a DELETE
// policy exists, and a read-only transactions view. A future migration or table
// that brings any of these back fails here on purpose.

describe('client table privileges', () => {
  it('has no TRUNCATE, no policy-less DELETE, and no writable views', async () => {
    const { data, error } = await serviceClient().rpc('client_extra_privileges')
    expect(error).toBeNull()
    expect(data).toEqual({ truncate: [], delete_without_policy: [], view_writes: [] })
  })

  it('is not itself callable by clients', async () => {
    const family = await createAdminFamily('client-grants-introspection')
    const member = await userClient(family.adminEmail, family.adminPassword)
    expect((await member.rpc('client_extra_privileges')).error).not.toBeNull()
  })

  it('a signed-in admin still deletes where a policy allows it (their own bucket)', async () => {
    const family = await createAdminFamily('client-grants-delete-ok')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const { data: bucket, error: insertError } = await admin
      .from('buckets')
      .insert({
        family_id: family.familyId,
        owner_member_id: null,
        name: 'Temp',
        allocated_amount: 0,
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()
    const { error } = await admin.from('buckets').delete().eq('id', bucket!.id)
    expect(error).toBeNull()
    const { data: after } = await admin.from('buckets').select('id').eq('id', bucket!.id)
    expect(after).toEqual([])
  })

  it('the money ledger cannot be deleted from, even by an admin', async () => {
    const family = await createAdminFamily('client-grants-ledger')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const { error } = await admin.from('transactions').delete().eq('family_id', family.familyId)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/permission denied/i)
  })

  it('the history view still reads', async () => {
    const family = await createAdminFamily('client-grants-view')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const { error } = await admin.from('transactions_client').select('id').limit(1)
    expect(error).toBeNull()
  })
})
