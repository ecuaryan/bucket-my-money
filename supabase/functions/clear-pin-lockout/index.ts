// @ts-nocheck — Deno Edge Function runtime.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { requireAdmin, serviceClient } from '../_shared/supabase.ts'

type Body = { memberId?: string }

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

  if (!body.memberId) {
    return jsonResponse({ error: 'memberId is required' }, 400)
  }

  const admin = serviceClient()

  // Each unlock hands out a fresh batch of PIN guesses. Co-admins can already
  // reset anyone else's PIN, but the account owner's PIN is theirs alone, so a
  // co-admin (or a stolen co-admin session) could alternate guessing and
  // unlocking to brute-force it. A real lockout needs one unlock, so cap
  // unlocks of the owner by someone else.
  const { data: target } = await admin
    .from('family_members')
    .select('id, is_account_owner')
    .eq('id', body.memberId)
    .eq('family_id', auth.familyId)
    .maybeSingle()
  if (target?.is_account_owner && target.id !== auth.memberId) {
    const { data: withinBudget, error: budgetError } = await admin.rpc(
      'check_rate_limit',
      {
        p_key: `clear-pin-lockout:${auth.familyId}:${target.id}`,
        p_limit: 3,
        p_window_seconds: 24 * 60 * 60,
      },
    )
    if (budgetError) {
      console.error('clear-pin-lockout rate limit', budgetError)
      return jsonResponse({ error: 'Could not clear lockout' }, 500)
    }
    if (withinBudget !== true) {
      return jsonResponse(
        { error: 'Too many unlocks for the owner today. Try again tomorrow.' },
        429,
      )
    }
  }

  const { error } = await admin
    .from('family_members')
    .update({ pin_failed_attempts: 0, pin_locked: false })
    .eq('id', body.memberId)
    .eq('family_id', auth.familyId)

  if (error) {
    console.error('clear-pin-lockout', error)
    return jsonResponse({ error: 'Could not clear lockout' }, 500)
  }

  return jsonResponse({ ok: true })
})
