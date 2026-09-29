// @ts-nocheck — Deno Edge Function runtime.
//
// Returns WebAuthn authentication options for a member chosen from the family
// roster. Unauthenticated (verify_jwt = false) — same as pin-login, the member
// is identified by (familyId, memberId) before any session exists.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { serviceClient } from '../_shared/supabase.ts'
import {
  generateAuthenticationOptions,
  relyingParty,
  storeChallenge,
} from '../_shared/webauthn.ts'
import {
  checkPreAuthRateLimit,
  rateLimitResponse,
} from '../_shared/rateLimit.ts'

type Body = { familyId?: string; memberId?: string }

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // Distributed pre-auth rate limit (migration 93, budget in rate_limit_rules).
  if (!(await checkPreAuthRateLimit(req, 'webauthn-login-options'))) {
    return rateLimitResponse()
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  const { familyId, memberId } = body
  if (!familyId || !memberId) {
    return jsonResponse({ error: 'familyId and memberId are required' }, 400)
  }

  const rp = relyingParty(req)
  if (!rp) return jsonResponse({ error: 'Unsupported origin' }, 400)

  const admin = serviceClient()

  const { data: member } = await admin
    .from('family_members')
    .select('id')
    .eq('id', memberId)
    .eq('family_id', familyId)
    .maybeSingle()
  if (!member) {
    return jsonResponse({ error: 'Invalid credentials' }, 401)
  }

  const { data: creds } = await admin
    .from('member_passkeys')
    .select('credential_id, transports')
    .eq('member_id', memberId)
  if (!creds || creds.length === 0) {
    return jsonResponse({ error: 'No passkey on this account', noPasskey: true }, 404)
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: creds.map((c) => ({
      id: c.credential_id,
      transports: c.transports ?? undefined,
    })),
    userVerification: 'required',
  })

  await storeChallenge(admin, {
    memberId,
    familyId,
    challenge: options.challenge,
    kind: 'login',
  })

  return jsonResponse(options)
})
