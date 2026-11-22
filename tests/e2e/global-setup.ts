import { execSync } from 'node:child_process'
import { requireDbEnv } from '../db/env'
import { serviceClient } from '../db/fixtures'

/**
 * Wait until edge functions are served at /functions/v1 (served by the local
 * edge-runtime once `supabase start` is up). The first request boots the
 * function and fetches its npm deps, so we pay that cold-start cost here in
 * setup rather than inside a test. Any HTTP response means it is ready.
 */
async function warmUpFunctions(): Promise<void> {
  const { url, anonKey } = requireDbEnv()
  const probe = `${url}/functions/v1/webauthn-login-options`
  const deadline = Date.now() + 180_000
  let lastErr: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(probe, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: anonKey },
        body: '{}',
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status > 0) {
        console.log(`[e2e] Edge functions ready (probe ${res.status}).`)
        return
      }
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(
    `[e2e] Edge functions never became ready (need edge-runtime running). Last error: ${String(lastErr)}`,
  )
}

/**
 * The pre-auth rate limits (rate_limit_rules, migration 93) are per client IP,
 * sized for one household: e.g. 20 join-code roster loads a minute. The whole
 * suite signs in from one address, ~40 times back to back, so it saturates
 * login_roster — refused loads leave the member picker empty until the window
 * frees, which slows every later test and sometimes times one out.
 *
 * Raise every budget 100x for this run only and put the real values back in
 * teardown, so database tests that assert the production budgets (and a local
 * `npm run test:db` after e2e) still see them. The limits themselves are
 * covered by tests/db/rate_limit.test.ts.
 */
async function raisePreAuthBudgets(): Promise<() => Promise<void>> {
  const svc = serviceClient()
  const { data: rules, error } = await svc
    .from('rate_limit_rules')
    .select('endpoint, max_hits')
  if (error) throw error
  const setBudgets = async (scale: number) => {
    for (const rule of rules ?? []) {
      const { error: updateError } = await svc
        .from('rate_limit_rules')
        .update({ max_hits: rule.max_hits * scale })
        .eq('endpoint', rule.endpoint)
      if (updateError) throw updateError
    }
  }
  await setBudgets(100)
  console.log(`[e2e] Pre-auth rate limits raised 100x for ${rules?.length ?? 0} endpoints.`)
  return () => setBudgets(1)
}

export default async function globalSetup() {
  if (!process.env.CI) {
    try {
      execSync('npx supabase status', { stdio: 'pipe' })
    } catch {
      console.log('\n[e2e] Starting local Supabase…')
      execSync('npx supabase start', { stdio: 'inherit' })
    }
  }

  if (process.env.CI && process.env.SKIP_DB_RESET === '1') {
    console.log('[e2e] Skipping db reset — CI already ran supabase start with migrations')
  } else {
    console.log('[e2e] Resetting database…')
    execSync('npx supabase db reset --no-seed', { stdio: 'inherit' })
  }

  await warmUpFunctions()
  // Returned function runs as global teardown.
  return raisePreAuthBudgets()
}
