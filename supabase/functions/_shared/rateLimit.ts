// @ts-nocheck — Deno Edge Function runtime.
//
// Distributed pre-auth rate limiting for the unauthenticated login
// endpoints (pin-login, validate-join-code, webauthn-*). Edge Functions
// run on many instances, so an in-memory counter would be per-instance
// and trivially bypassed — the counter lives in Postgres via the
// check_pre_auth_rate_limit RPC (migration 93), whose budgets live in
// the rate_limit_rules table. Edge code never hardcodes limits; change
// them in the DB.
//
// Keyed by endpoint + trusted client IP (IPv6 by /64) so one abusive IP can't burn the whole
// login surface, while a household behind one NAT (Ryan's 7) stays far
// below the limits under normal use. On a rate-limit DB error we fail
// OPEN (log it): the per-member PIN lockout remains the primary brute
// force control, and a rate-limit table hiccup must never become a full
// login outage.

import { pickClientIp } from './clientIp.ts'
import { serviceClient } from './supabase.ts'

/** Trusted client IP (see clientIp.ts). Never the caller-chosen first XFF hop. */
export function getClientIp(req: Request): string {
  return pickClientIp((name) => req.headers.get(name))
}

/**
 * Returns true when the request is within the endpoint's budget
 * (rate_limit_rules, migration 93). Call right after the method check,
 * before parsing the body. Fails open on DB errors.
 */
export async function checkPreAuthRateLimit(
  req: Request,
  endpoint: string,
): Promise<boolean> {
  const admin = serviceClient()
  const { data, error } = await admin.rpc('check_pre_auth_rate_limit', {
    p_endpoint: endpoint,
    p_ip: getClientIp(req),
  })
  if (error) {
    console.error('rate-limit check failed (failing open)', error)
    return true
  }
  return data === true
}

/** 429 response for an exceeded pre-auth rate limit. */
export function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests — try again shortly' }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': '60',
      },
    },
  )
}
