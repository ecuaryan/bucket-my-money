// @ts-nocheck — Deno Edge Function runtime.
//
// Verifies a WebAuthn assertion and mints a Supabase session for the member,
// reusing the exact token-issuance path as pin-login. Unauthenticated
// (verify_jwt = false).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { issueSessionForMember } from '../_shared/session.ts'
import {
  isoBase64URL,
  relyingParty,
  takeChallenge,
  verifyAuthenticationResponse,
} from '../_shared/webauthn.ts'
import {
  checkPreAuthRateLimit,
  rateLimitResponse,
} from '../_shared/rateLimit.ts'

type Body = {
  familyId?: string
  memberId?: string
  response?: { id?: string }
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // Distributed pre-auth rate limit (migration 93, budget in rate_limit_rules).
  if (!(await checkPreAuthRateLimit(req, 'webauthn-login-verify'))) {
    return rateLimitResponse()
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  const { familyId, memberId, response } = body
  if (!familyId || !memberId || !response?.id) {
    return jsonResponse({ error: 'familyId, memberId, and response are required' }, 400)
  }

  const rp = relyingParty(req)
  if (!rp) return jsonResponse({ error: 'Unsupported origin' }, 400)

  const admin = serviceClient()

  // One DB call returns the member row AND the auth email, so issuing the
  // session below no longer needs a separate getUserById round trip.
  const { data: member } = await admin.rpc('member_session_lookup', {
    p_family_id: familyId,
    p_member_id: memberId,
  })
  if (!member || !member.user_id) {
    return jsonResponse({ error: 'Invalid credentials' }, 401)
  }

  const { data: passkey } = await admin
    .from('member_passkeys')
    .select('id, credential_id, public_key, counter, transports')
    .eq('member_id', memberId)
    .eq('credential_id', response.id)
    .maybeSingle()
  if (!passkey) {
    return jsonResponse({ error: 'Unknown passkey' }, 401)
  }

  const expectedChallenge = await takeChallenge(admin, {
    memberId,
    kind: 'login',
  })
  if (!expectedChallenge) {
    return jsonResponse({ error: 'Challenge expired — try again' }, 400)
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.credential_id,
        publicKey: isoBase64URL.toBuffer(passkey.public_key),
        counter: Number(passkey.counter),
        transports: passkey.transports ?? undefined,
      },
    })
  } catch (err) {
    console.error('webauthn-login verify', err)
    return jsonResponse({ error: 'Could not verify passkey' }, 400)
  }

  if (!verification.verified) {
    return jsonResponse({ error: 'Passkey not verified' }, 401)
  }

  await admin
    .from('member_passkeys')
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', passkey.id)

  let session
  try {
    session = await issueSessionForMember(admin, member.user_id, member.auth_email)
  } catch (err) {
    console.error('webauthn-login session', err)
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
