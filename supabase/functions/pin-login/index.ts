// @ts-nocheck — Deno Edge Function runtime.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { issueSessionForMember } from '../_shared/session.ts'
import { isValidPin, MAX_PIN_ATTEMPTS, verifyPin } from '../_shared/pin.ts'
import {
  checkPreAuthRateLimit,
  rateLimitResponse,
} from '../_shared/rateLimit.ts'

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

  // Per-step durations, reported only on a successful sign-in as a
  // Server-Timing header (browser devtools → Network → Timing). Durations only.
  const t0 = performance.now()
  const timings: string[] = []
  const timed = <T,>(name: string, work: Promise<T> | PromiseLike<T>): Promise<T> => {
    const start = performance.now()
    return Promise.resolve(work).finally(() => {
      timings.push(`${name};dur=${(performance.now() - start).toFixed(1)}`)
    })
  }

  // Distributed pre-auth rate limit (migration 93, budget in
  // rate_limit_rules). Generous for a household; 429s only under abuse.
  // Per-member PIN lockout below remains the primary brute-force control.
  // Started now and awaited before anything is acted on, so its round trip
  // overlaps the body parse and the member lookup instead of preceding them.
  // Never rejects (a rejection nobody is awaiting yet would be unhandled): like
  // a DB error inside the check, an unexpected throw fails open and is logged.
  const withinBudget = checkPreAuthRateLimit(req, 'pin-login').catch((err) => {
    console.error('pin-login rate-limit check threw (failing open)', err)
    return true
  })

  let body: Body
  try {
    body = await req.json()
  } catch {
    if (!(await withinBudget)) return rateLimitResponse()
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { familyId, memberId, pin } = body
  if (!familyId || !memberId || !pin) {
    if (!(await withinBudget)) return rateLimitResponse()
    return jsonResponse({ error: 'familyId, memberId, and pin are required' }, 400)
  }
  if (!isValidPin(pin)) {
    if (!(await withinBudget)) return rateLimitResponse()
    return jsonResponse({ error: 'PIN must be exactly 4 digits' }, 400)
  }

  const admin = serviceClient()
  // One DB call returns the member row AND the auth email, so issuing the
  // session below no longer needs a separate getUserById round trip. It is a
  // read-only lookup, so it runs alongside the rate-limit check; its result is
  // discarded (and nothing else happens) if the caller is over budget.
  const [inBudget, { data: member, error: memberError }] = await Promise.all([
    timed('ratelimit', withinBudget),
    timed(
      'lookup',
      admin.rpc('member_session_lookup', {
        p_family_id: familyId,
        p_member_id: memberId,
      }),
    ),
  ])
  if (!inBudget) {
    return rateLimitResponse()
  }

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

  // Reserve the attempt BEFORE verifying. One atomic UPDATE counts it and
  // locks the member on the last allowed try, so a burst of parallel guesses
  // cannot all slip past the `pin_locked` check above and get verified.
  // No row back = locked or out of attempts. Fail closed on errors.
  //
  // The bcrypt check runs at the same time as the reservation to save a round
  // trip. Its result is only ever used once a reservation has been granted: a
  // locked or exhausted member gets the same "locked" answer whatever the PIN,
  // so the overlap reveals nothing and lets no extra guess through.
  const [{ data: reservation, error: reserveError }, ok] = await Promise.all([
    timed(
      'reserve',
      admin.rpc('reserve_pin_attempt', {
        p_member_id: member.id,
        p_max_attempts: MAX_PIN_ATTEMPTS,
      }),
    ),
    timed('bcrypt', verifyPin(pin, member.pin_hash)),
  ])
  if (reserveError) {
    console.error('pin-login reserve attempt', reserveError)
    return jsonResponse({ error: 'Login failed' }, 500)
  }
  const attempt = Array.isArray(reservation) ? reservation[0] : reservation
  if (!attempt) {
    return jsonResponse(
      { error: 'PIN locked — ask your admin to unlock', locked: true },
      403,
    )
  }

  if (!ok) {
    if (attempt.locked) {
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

  // Correct PIN: clear the counter while the session is minted (independent
  // writes, so no reason to run them back to back). Awaited before replying.
  const resetCounter = Promise.resolve(
    admin
      .from('family_members')
      .update({ pin_failed_attempts: 0, pin_locked: false })
      .eq('id', member.id),
  ).catch((err) => console.error('pin-login counter reset', err))
  const resetTimed = timed('reset', resetCounter)

  let session
  try {
    session = await timed(
      'session',
      issueSessionForMember(admin, member.user_id, member.auth_email),
    )
  } catch (err) {
    console.error('pin-login session', err)
    await resetTimed
    return jsonResponse({ error: 'Login failed' }, 500)
  }
  await resetTimed
  timings.push(`total;dur=${(performance.now() - t0).toFixed(1)}`)

  const response = jsonResponse({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    member: {
      id: member.id,
      role: member.role,
      familyId: member.family_id,
    },
  })
  response.headers.set('Server-Timing', timings.join(', '))
  return response
})
