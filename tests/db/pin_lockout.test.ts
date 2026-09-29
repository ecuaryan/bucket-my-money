import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { createAdminFamily, serviceClient, userClient } from './fixtures'
import { requireDbEnv } from './env'

function anonClient() {
  const { url, anonKey } = requireDbEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('record_pin_failure', () => {
  it('increments attempts atomically and locks at the threshold', async () => {
    const family = await createAdminFamily('pin-failure-rpc')
    const svc = serviceClient()

    for (let i = 1; i <= 5; i++) {
      const { data, error } = await svc.rpc('record_pin_failure', {
        p_member_id: family.adminMemberId,
        p_max_attempts: 6,
      })
      expect(error).toBeNull()
      const row = Array.isArray(data) ? data[0] : data
      expect(row?.attempts).toBe(i)
      expect(row?.locked).toBe(false)
    }

    const { data, error } = await svc.rpc('record_pin_failure', {
      p_member_id: family.adminMemberId,
      p_max_attempts: 6,
    })
    expect(error).toBeNull()
    const row = Array.isArray(data) ? data[0] : data
    expect(row?.attempts).toBe(6)
    expect(row?.locked).toBe(true)

    const { data: member, error: memberError } = await svc
      .from('family_members')
      .select('pin_failed_attempts, pin_locked')
      .eq('id', family.adminMemberId)
      .single()
    expect(memberError).toBeNull()
    expect(member?.pin_failed_attempts).toBe(6)
    expect(member?.pin_locked).toBe(true)
  })

  it('honors a custom threshold', async () => {
    const family = await createAdminFamily('pin-failure-threshold')
    const svc = serviceClient()

    const first = await svc.rpc('record_pin_failure', {
      p_member_id: family.adminMemberId,
      p_max_attempts: 2,
    })
    expect(first.error).toBeNull()
    const firstRow = Array.isArray(first.data) ? first.data[0] : first.data
    expect(firstRow?.attempts).toBe(1)
    expect(firstRow?.locked).toBe(false)

    const second = await svc.rpc('record_pin_failure', {
      p_member_id: family.adminMemberId,
      p_max_attempts: 2,
    })
    expect(second.error).toBeNull()
    const secondRow = Array.isArray(second.data) ? second.data[0] : second.data
    expect(secondRow?.attempts).toBe(2)
    expect(secondRow?.locked).toBe(true)
  })

  it('cannot be executed by anon or authenticated clients', async () => {
    const family = await createAdminFamily('pin-failure-privs')
    const anon = anonClient()
    const member = await userClient(family.adminEmail, family.adminPassword)

    const anonCall = await anon.rpc('record_pin_failure', {
      p_member_id: family.adminMemberId,
      p_max_attempts: 6,
    })
    expect(anonCall.error).not.toBeNull()

    const memberCall = await member.rpc('record_pin_failure', {
      p_member_id: family.adminMemberId,
      p_max_attempts: 6,
    })
    expect(memberCall.error).not.toBeNull()
  })
})
