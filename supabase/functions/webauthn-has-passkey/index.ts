// @ts-nocheck — Deno Edge Function runtime.
//
// Lightweight check used by the login screens to decide which fast options to
// offer for (familyId, memberId): does the member have a passkey, and do they
// have a PIN? No challenge, no session — pre-auth, like the webauthn-login-*
// functions. (Both are non-secret existence flags; the secrets stay server-side.)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { serviceClient } from '../_shared/supabase.ts'
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

  // Distributed pre-auth rate limit (migration 93, budget in
  // rate_limit_rules). The login screen calls this per roster member, so
  // the budget covers a full family in one load with headroom.
  if (!(await checkPreAuthRateLimit(req, 'webauthn-has-passkey'))) {
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

  const admin = serviceClient()
  const [passkeyResult, memberResult] = await Promise.all([
    admin
      .from('member_passkeys')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('family_id', familyId),
    admin
      .from('family_members')
      .select('pin_set_at')
      .eq('id', memberId)
      .eq('family_id', familyId)
      .maybeSingle(),
  ])

  if (passkeyResult.error || memberResult.error) {
    console.error('webauthn-has-passkey', passkeyResult.error, memberResult.error)
    return jsonResponse({ error: 'Check failed' }, 500)
  }

  return jsonResponse({
    exists: (passkeyResult.count ?? 0) > 0,
    hasPin: Boolean(memberResult.data?.pin_set_at),
  })
})
