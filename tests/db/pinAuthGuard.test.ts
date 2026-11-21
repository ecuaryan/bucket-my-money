import { describe, expect, it } from 'vitest'
import {
  addMember,
  createAdminFamily,
  serviceClient,
  userClient,
} from './fixtures'
import { requireDbEnv } from './env'
import { createClient } from '@supabase/supabase-js'

/**
 * Migration 113: a PIN-only auth user's password and email change only through
 * the server (single-use ticket). A session holder must not be able to set a
 * password and sign in later without the PIN.
 */
describe('PIN-only auth users are locked to server-side credential changes', () => {
  async function pinMemberSession() {
    const family = await createAdminFamily('pin-guard')
    const kid = await addMember(family.familyId, 'child', 'Kid')
    const client = await userClient(kid.email, kid.password)
    const { data } = await client.auth.getUser()
    return { family, kid, client, userId: data.user!.id }
  }

  it('rejects updateUser({ password }) from the member session, so no PIN-less sign-in', async () => {
    const { kid, client } = await pinMemberSession()

    const { error } = await client.auth.updateUser({ password: 'chosen-by-holder-1' })
    expect(error).not.toBeNull()

    const { url, anonKey } = requireDbEnv()
    const other = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const signIn = await other.auth.signInWithPassword({
      email: kid.email,
      password: 'chosen-by-holder-1',
    })
    expect(signIn.data.session).toBeNull()
  })

  it('rejects updateUser({ email }) from the member session', async () => {
    const { client } = await pinMemberSession()
    const { error } = await client.auth.updateUser({ email: 'holder@example.com' })
    expect(error).not.toBeNull()
  })

  it('requires a single-use server ticket for an admin-API password change', async () => {
    const { userId } = await pinMemberSession()
    const svc = serviceClient()

    const noTicket = await svc.auth.admin.updateUserById(userId, {
      password: 'server-set-password-1',
    })
    expect(noTicket.error).not.toBeNull()

    const ticket = await svc.rpc('allow_pin_password_set', { p_user_id: userId })
    expect(ticket.error).toBeNull()
    const withTicket = await svc.auth.admin.updateUserById(userId, {
      password: 'server-set-password-1',
    })
    expect(withTicket.error).toBeNull()

    const reused = await svc.auth.admin.updateUserById(userId, {
      password: 'server-set-password-2',
    })
    expect(reused.error).not.toBeNull()
  })

  it('does not let a signed-in user take a ticket', async () => {
    const { client, userId } = await pinMemberSession()
    const { error } = await client.rpc('allow_pin_password_set', { p_user_id: userId })
    expect(error).not.toBeNull()
  })

  it('leaves email-account users free to change their own password', async () => {
    const family = await createAdminFamily('pin-guard-admin')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const { error } = await admin.auth.updateUser({ password: 'new-admin-password-1' })
    expect(error).toBeNull()
  })

  it('still lets normal sign-ins and profile updates through', async () => {
    const { kid } = await pinMemberSession()
    // A second sign-in rewrites last_sign_in_at etc. on auth.users.
    await expect(userClient(kid.email, kid.password)).resolves.toBeTruthy()
  })
})
