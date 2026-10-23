import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { createAdminFamily, familyJoinCode, serviceClient, userClient } from './fixtures'
import { requireDbEnv } from './env'

// Migrations 104/105: new join codes are exactly 8 chars from a 31-symbol alphabet
// (no 0 O 1 I L), drawn uniformly. Older codes (6-8 chars, or 12 if rotated
// between migrations 104 and 105) must keep working.

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const NEW_CODE = /^[2-9A-HJ-KM-NP-Z]{8}$/

function anonClient() {
  const { url, anonKey } = requireDbEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('generate_join_code', () => {
  it('always yields 8 symbols from the 31-symbol alphabet', async () => {
    const svc = serviceClient()
    const codes: string[] = []
    for (let i = 0; i < 400; i++) {
      const { data, error } = await svc.rpc('generate_join_code')
      expect(error).toBeNull()
      codes.push(data as string)
    }
    for (const c of codes) expect(c).toMatch(NEW_CODE)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('draws every symbol about equally often (no modulo bias)', async () => {
    const svc = serviceClient()
    const counts = new Map<string, number>([...ALPHABET].map((c) => [c, 0]))
    for (let i = 0; i < 3000; i++) {
      const { data } = await svc.rpc('generate_join_code')
      for (const ch of data as string) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    }
    const values = [...counts.values()]
    expect(counts.size).toBe(31)
    // 24,000 symbols / 31 ≈ 774 each (σ ≈ 27); a 1.5x spread is > 5σ.
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.5)
  })

  it('is not callable by clients', async () => {
    const family = await createAdminFamily('joincode-privs')
    const member = await userClient(family.adminEmail, family.adminPassword)
    expect((await member.rpc('generate_join_code')).error).not.toBeNull()
    expect((await anonClient().rpc('generate_join_code')).error).not.toBeNull()
  })
})

describe('join codes in use', () => {
  it('a new household gets an 8-char code that signs in the roster', async () => {
    const family = await createAdminFamily('joincode-new')
    const code = await familyJoinCode(family.familyId)
    expect(code).toMatch(NEW_CODE)

    const { data, error } = await anonClient().rpc('login_roster', { p_code: code })
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })

  it('rotating yields a fresh 8-char code and retires the old one', async () => {
    const family = await createAdminFamily('joincode-rotate')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const before = await familyJoinCode(family.familyId)

    const { data: rotated, error } = await admin.rpc('rotate_family_join_code')
    expect(error).toBeNull()
    expect(rotated).toMatch(NEW_CODE)
    expect(rotated).not.toBe(before)

    const anon = anonClient()
    expect((await anon.rpc('login_roster', { p_code: before })).data).toBeNull()
    expect((await anon.rpc('login_roster', { p_code: rotated as string })).data).not.toBeNull()
  })

  it('an existing 8-char code keeps working', async () => {
    const family = await createAdminFamily('joincode-legacy')
    const legacy = `K${crypto.randomUUID().replace(/[^0-9]/g, '').slice(0, 7).padEnd(7, '2')}`
    const { error } = await serviceClient()
      .from('families')
      .update({ join_code: legacy })
      .eq('id', family.familyId)
    expect(error).toBeNull()

    const { data } = await anonClient().rpc('login_roster', { p_code: legacy.toLowerCase() })
    expect(data).not.toBeNull()
  })

  it('a 12-char code issued between migrations 104 and 105 keeps working', async () => {
    const family = await createAdminFamily('joincode-twelve')
    const twelve = 'ABCD2345EFGH'
    const { error } = await serviceClient()
      .from('families')
      .update({ join_code: twelve })
      .eq('id', family.familyId)
    expect(error).toBeNull()

    const { data } = await anonClient().rpc('login_roster', { p_code: twelve })
    expect(data).not.toBeNull()
  })
})
