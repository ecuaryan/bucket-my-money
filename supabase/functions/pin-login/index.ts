// @ts-nocheck — Deno Edge Function runtime.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { issueSessionForMember } from '../_shared/session.ts'
import { isValidPin, MAX_PIN_ATTEMPTS, verifyPin } from '../_shared/pin.ts'

type Body = {
  familyId?: string
  memberId?: string
  pin?: string
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { familyId, memberId, pin } = body
  if (!familyId || !memberId || !pin) {
    return jsonResponse({ error: 'familyId, memberId, and pin are required' }, 400)
  }
  if (!isValidPin(pin)) {
    return jsonResponse({ error: 'PIN must be exactly 4 digits' }, 400)
  }

  const admin = serviceClient()
  // One DB call returns the member row AND the auth email, so issuing the
  // session below no longer needs a separate getUserById round trip.
  const { data: member, error: memberError } = await admin.rpc(
    'member_session_lookup',
    { p_family_id: familyId, p_member_id: memberId },
  )

  if (memberError) {
    console.error('pin-login member lookup', memberError)
    return jsonResponse({ error: 'Login failed' }, 500)
  }
  if (!member) {
    return jsonResponse({ error: 'Invalid credentials' }, 401)
  }
  if (!member.user_id) {
    return jsonResponse({ error: 'Account not ready — ask your admin to set a PIN' }, 403)
  }
  if (!member.pin_hash) {
    return jsonResponse({ error: 'PIN not set — ask your admin' }, 403)
  }
  if (member.pin_locked) {
    return jsonResponse(
      { error: 'PIN locked — ask your admin to unlock', locked: true },
      403,
    )
  }

  const ok = await verifyPin(pin, member.pin_hash)
  if (!ok) {
    // Atomic increment + lock check in a single UPDATE (the row lock
    // serializes concurrent attempts). The old read-modify-write let
    // parallel requests all read the same stale counter, so N simultaneous
    // wrong guesses advanced the lockout by ~1 instead of N.
    const { data: failure, error: failureError } = await admin.rpc(
      'record_pin_failure',
      { p_member_id: member.id, p_max_attempts: MAX_PIN_ATTEMPTS },
    )
    if (failureError) {
      console.error('pin-login record failure', failureError)
      return jsonResponse({ error: 'Wrong PIN' }, 401)
    }
    const row = Array.isArray(failure) ? failure[0] : failure
    if (row?.locked) {
      return jsonResponse(
        {
          error: 'Too many attempts — PIN locked. Ask your admin.',
          locked: true,
        },
        403,
      )
    }
    return jsonResponse({ error: 'Wrong PIN' }, 401)
  }

  await admin
    .from('family_members')
    .update({ pin_failed_attempts: 0, pin_locked: false })
    .eq('id', member.id)

  let session
  try {
    session = await issueSessionForMember(admin, member.user_id, member.auth_email)
  } catch (err) {
    console.error('pin-login session', err)
    return jsonResponse({ error: 'Login failed' }, 500)
  }

  return jsonResponse({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    member: {
      id: member.id,
      role: member.role,
      familyId: member.family_id,
    },
  })
})
