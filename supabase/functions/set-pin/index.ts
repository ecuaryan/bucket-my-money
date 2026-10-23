// @ts-nocheck — Deno Edge Function runtime.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { requireAdmin, serviceClient } from '../_shared/supabase.ts'
import { hashPin, isValidPin } from '../_shared/pin.ts'

type Body = {
  memberId?: string
  pin?: string
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const auth = await requireAdmin(req.headers.get('Authorization'))
  if (!auth.ok) return auth.response

  let body: Body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { memberId, pin } = body
  if (!memberId || !pin) {
    return jsonResponse({ error: 'memberId and pin are required' }, 400)
  }
  if (!isValidPin(pin)) {
    return jsonResponse({ error: 'PIN must be exactly 4 digits' }, 400)
  }

  const admin = serviceClient()
  const { data: member, error: memberError } = await admin
    .from('family_members')
    .select('id, family_id, user_id, is_account_owner')
    .eq('id', memberId)
    .eq('family_id', auth.familyId)
    .maybeSingle()

  if (memberError || !member) {
    return jsonResponse({ error: 'Member not found' }, 404)
  }
  if (!member.user_id) {
    return jsonResponse({ error: 'Member has no login yet' }, 400)
  }

  // The owner's PIN signs in as their real email account, so only the owner
  // may change it (same rule as remove-member / clear-own-pin). Co-admins can
  // still unlock a locked owner via clear-pin-lockout.
  if (member.is_account_owner && member.id !== auth.memberId) {
    return jsonResponse(
      { error: 'Only the account owner can change their own PIN' },
      403,
    )
  }

  // Sign the member out everywhere before changing their PIN. We delete their
  // auth.sessions via RPC (revokes refresh tokens) because `auth.admin.signOut`
  // needs the member's own JWT and cannot sign a user out by id. Own-PIN
  // "sign out other devices" is handled on the saving device in the client
  // (`signOut({ scope: 'others' })`), so skip it for self.
  if (member.id !== auth.memberId) {
    const { error: revokeError } = await admin.rpc('revoke_member_sessions', {
      p_user_id: member.user_id,
      p_family_id: auth.familyId,
    })
    if (revokeError) {
      console.error('set-pin revoke_member_sessions', revokeError)
      return jsonResponse(
        { error: 'Could not sign them out on other devices. Try again.' },
        500,
      )
    }

    // Resetting another member's PIN re-secures their access, so also revoke
    // their biometric passkey — otherwise an old passkey would bypass the new
    // PIN. (Resetting your own PIN keeps your passkey: it is your own device.)
    const { error: passkeyError } = await admin
      .from('member_passkeys')
      .delete()
      .eq('member_id', member.id)
    if (passkeyError) {
      console.error('set-pin delete passkeys', passkeyError)
      return jsonResponse(
        { error: 'Could not reset their biometric unlock. Try again.' },
        500,
      )
    }
  }

  const pinHash = await hashPin(pin)

  const { error: updateError } = await admin
    .from('family_members')
    .update({
      pin_hash: pinHash,
      pin_failed_attempts: 0,
      pin_locked: false,
      pin_set_at: new Date().toISOString(),
    })
    .eq('id', member.id)

  if (updateError) {
    console.error('set-pin update', updateError)
    return jsonResponse({ error: 'Could not save PIN' }, 500)
  }

  return jsonResponse({ ok: true })
})
