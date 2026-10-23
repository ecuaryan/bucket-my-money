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

describe('reserve_pin_attempt', () => {
  type Row = { attempts: number; locked: boolean }
  const rowOf = (data: unknown): Row | undefined =>
    (Array.isArray(data) ? data[0] : data) as Row | undefined

  it('counts each attempt and locks on the last allowed one', async () => {
    const family = await createAdminFamily('pin-reserve-seq')
    const svc = serviceClient()

    for (let i = 1; i <= 5; i++) {
      const { data, error } = await svc.rpc('reserve_pin_attempt', {
        p_member_id: family.adminMemberId,
        p_max_attempts: 6,
      })
      expect(error).toBeNull()
      expect(rowOf(data)).toEqual({ attempts: i, locked: false })
    }

    const last = await svc.rpc('reserve_pin_attempt', {
      p_member_id: family.adminMemberId,
      p_max_attempts: 6,
    })
    expect(rowOf(last.data)).toEqual({ attempts: 6, locked: true })

    // Locked: nothing more can be reserved, so nothing more gets verified.
    const after = await svc.rpc('reserve_pin_attempt', {
      p_member_id: family.adminMemberId,
      p_max_attempts: 6,
    })
    expect(after.error).toBeNull()
    expect(rowOf(after.data)).toBeUndefined()
  })

  it('lets a burst of parallel guesses reserve at most the allowed attempts', async () => {
    const family = await createAdminFamily('pin-reserve-burst')
    const svc = serviceClient()

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        svc.rpc('reserve_pin_attempt', {
          p_member_id: family.adminMemberId,
          p_max_attempts: 6,
        }),
      ),
    )

    expect(results.every((r) => r.error === null)).toBe(true)
    const reserved = results.filter((r) => rowOf(r.data) !== undefined)
    expect(reserved).toHaveLength(6)
    expect(reserved.filter((r) => rowOf(r.data)?.locked)).toHaveLength(1)

    const { data: member } = await svc
      .from('family_members')
      .select('pin_failed_attempts, pin_locked')
      .eq('id', family.adminMemberId)
      .single()
    expect(member).toEqual({ pin_failed_attempts: 6, pin_locked: true })
  })

  it('reserves nothing for a locked member or an unknown id', async () => {
    const family = await createAdminFamily('pin-reserve-locked')
    const svc = serviceClient()
    await svc
      .from('family_members')
      .update({ pin_locked: true })
      .eq('id', family.adminMemberId)

    const locked = await svc.rpc('reserve_pin_attempt', {
      p_member_id: family.adminMemberId,
      p_max_attempts: 6,
    })
    expect(rowOf(locked.data)).toBeUndefined()

    const unknown = await svc.rpc('reserve_pin_attempt', {
      p_member_id: crypto.randomUUID(),
      p_max_attempts: 6,
    })
    expect(unknown.error).toBeNull()
    expect(rowOf(unknown.data)).toBeUndefined()
  })

  it('cannot be executed by anon or authenticated clients', async () => {
    const family = await createAdminFamily('pin-reserve-privs')
    const anon = anonClient()
    const member = await userClient(family.adminEmail, family.adminPassword)

    const anonCall = await anon.rpc('reserve_pin_attempt', {
      p_member_id: family.adminMemberId,
      p_max_attempts: 6,
    })
    expect(anonCall.error).not.toBeNull()

    const memberCall = await member.rpc('reserve_pin_attempt', {
      p_member_id: family.adminMemberId,
      p_max_attempts: 6,
    })
    expect(memberCall.error).not.toBeNull()
  })
})
