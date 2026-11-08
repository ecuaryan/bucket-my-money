// @ts-nocheck — Deno Edge Function runtime.
//
// Returns WebAuthn registration options for an already-signed-in member so
// they can enroll a passkey on THIS device. Authenticated (verify_jwt = true):
// a member can only enroll a credential for their own account.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { requireMember, serviceClient } from '../_shared/supabase.ts'
import { isValidPin, MAX_PIN_ATTEMPTS, verifyPin } from '../_shared/pin.ts'
import {
  generateRegistrationOptions,
  isoUint8Array,
  relyingParty,
  RP_NAME,
  storeChallenge,
} from '../_shared/webauthn.ts'

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const auth = await requireMember(req.headers.get('Authorization'))
  if (!auth.ok) return auth.response

  const rp = relyingParty(req)
  if (!rp) return jsonResponse({ error: 'Unsupported origin' }, 400)

  const admin = serviceClient()

  const { data: member } = await admin
    .from('family_members')
    .select('name, pin_hash, pin_locked')
    .eq('id', auth.memberId)
    .maybeSingle()

  // Step-up: a bearer token alone must not be enough to plant a passkey that
  // outlives it (a passkey signs in later, even after a PIN change). When the
  // member has a PIN, they must enter it now. It counts against the same
  // attempt budget and lockout as pin-login.
  if (member?.pin_hash) {
    let pin: unknown
    try {
      pin = (await req.json())?.pin
    } catch {
      pin = undefined
    }
    if (typeof pin !== 'string' || !isValidPin(pin)) {
      return jsonResponse({ error: 'Enter your PIN to turn this on', pinRequired: true }, 403)
    }
    if (member.pin_locked) {
      return jsonResponse({ error: 'PIN locked — ask your admin to unlock', locked: true }, 403)
    }
    const { data: reservation, error: reserveError } = await admin.rpc(
      'reserve_pin_attempt',
      { p_member_id: auth.memberId, p_max_attempts: MAX_PIN_ATTEMPTS },
    )
    if (reserveError) {
      console.error('webauthn-register-options reserve attempt', reserveError)
      return jsonResponse({ error: 'Could not verify your PIN' }, 500)
    }
    const attempt = Array.isArray(reservation) ? reservation[0] : reservation
    if (!attempt) {
      return jsonResponse({ error: 'PIN locked — ask your admin to unlock', locked: true }, 403)
    }
    if (!(await verifyPin(pin, member.pin_hash))) {
      return jsonResponse(
        attempt.locked
          ? { error: 'Too many attempts — PIN locked. Ask your admin.', locked: true }
          : { error: 'Wrong PIN' },
        // 403, not 401: the client treats a 401 on an authenticated call as an
        // expired session.
        403,
      )
    }
    await admin
      .from('family_members')
      .update({ pin_failed_attempts: 0, pin_locked: false })
      .eq('id', auth.memberId)
  }

  const displayName = member?.name ?? 'Member'

  // No excludeCredentials on purpose: this app uses one passkey per member
  // (enrolling replaces any prior — see webauthn-register-verify). That keeps
  // re-enrollment from dead-ending on InvalidStateError when a device's local
  // binding was lost but the platform authenticator still holds the credential.
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userID: isoUint8Array.fromUTF8String(auth.memberId),
    userName: displayName,
    userDisplayName: displayName,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
  })

  await storeChallenge(admin, {
    memberId: auth.memberId,
    familyId: auth.familyId,
    challenge: options.challenge,
    kind: 'register',
  })

  return jsonResponse(options)
})
