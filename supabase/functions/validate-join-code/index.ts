// @ts-nocheck — Deno Edge Function runtime.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { serviceClient } from '../_shared/supabase.ts'
import {
  checkPreAuthRateLimit,
  getClientIp,
  rateLimitResponse,
} from '../_shared/rateLimit.ts'

type Body = { code?: string }

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // TEMPORARY diagnostic (removed by the follow-up fix): `x-bmm-debug: 1` echoes
  // back the caller's OWN client-IP-related request headers and the address the
  // rate limit would key on, so we can see what the hosted Edge Function path
  // actually receives (it sits behind a different front door than PostgREST).
  if (req.headers.get('x-bmm-debug') === '1') {
    return jsonResponse({
      chosen: getClientIp(req),
      headers: Object.fromEntries(
        [...req.headers].filter(([k]) =>
          /forward|real-ip|^cf-|^via$|^true-client|^x-envoy|^sb-|^x-sb|^x-supabase|host|proto/i.test(k),
        ),
      ),
    })
  }

  // Distributed pre-auth rate limit (migration 93, budget in
  // rate_limit_rules). Join codes carry ~48 bits of entropy; this is
  // abuse throttling.
  if (!(await checkPreAuthRateLimit(req, 'validate-join-code'))) {
    return rateLimitResponse()
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const code = body.code?.trim().toUpperCase()
  if (!code || code.length < 6) {
    return jsonResponse({ error: 'Join code is required' }, 400)
  }

  const admin = serviceClient()
  const { data: family, error: familyError } = await admin
    .from('families')
    .select('id, name')
    .eq('join_code', code)
    .maybeSingle()

  if (familyError) {
    console.error('validate-join-code family lookup', familyError)
    return jsonResponse({ error: 'Lookup failed' }, 500)
  }
  if (!family) {
    return jsonResponse({ error: 'Invalid join code' }, 404)
  }

  const { data: members, error: membersError } = await admin
    .from('family_members')
    .select('id, name, role, avatar_url, pin_set_at, pin_locked, is_account_owner')
    .eq('family_id', family.id)
    .in('role', ['admin', 'member', 'child'])
    .order('created_at', { ascending: true })

  if (membersError) {
    console.error('validate-join-code members', membersError)
    return jsonResponse({ error: 'Lookup failed' }, 500)
  }

  return jsonResponse({
    familyId: family.id,
    familyName: family.name,
    members: (members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      avatarUrl: m.avatar_url,
      hasPin: Boolean(m.pin_set_at),
      pinLocked: m.pin_locked,
      isAccountOwner: Boolean(m.is_account_owner),
    })),
  })
})
