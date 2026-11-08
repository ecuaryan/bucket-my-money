// @ts-nocheck — Deno Edge Function runtime.
//
// Per-family budget for calls that reach a bank provider (SimpleFIN, Plaid).
// The refresh throttle reads a timestamp that is only written after a
// successful call, so parallel taps and failing calls could all reach the
// provider; the transactions-list functions had no limit at all. This counter
// lives in Postgres (check_rate_limit is atomic), so it holds across Edge
// Function instances. Fails OPEN on a database error: a counter hiccup must not
// take bank data offline.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export async function withinProviderBudget(
  admin: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('provider budget check failed (failing open)', error)
    return true
  }
  return data === true
}

/** Provider-calling refreshes allowed per family per window. */
export const REFRESH_BUDGET = { limit: 5, windowSeconds: 600 }
/** Transaction-list fetches allowed per family per window (client caches 10 min). */
export const LIST_BUDGET = { limit: 30, windowSeconds: 600 }
