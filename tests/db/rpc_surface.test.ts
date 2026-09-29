import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import {
  createAdminFamily,
  serviceClient,
  TRANSACTIONS_CLIENT,
  userClient,
} from './fixtures'
import { requireDbEnv } from './env'

function anonClient() {
  const { url, anonKey } = requireDbEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Internal service-role-only functions (migrations 81/84/88, hardened in
// 94). Each returns credential-bearing rows (access tokens / access URLs)
// or reads Vault secrets, so anon and authenticated must both be denied
// at the PostgREST layer — exactly the path an external attacker uses.
const INTERNAL_RPCS = [
  {
    name: 'claim_stale_enrollments',
    args: {
      p_stale_before: new Date().toISOString(),
      p_claim_ttl: '1 hour',
      p_limit: 5,
    },
  },
  {
    name: 'claim_stale_simplefin_connections',
    args: {
      p_stale_before: new Date().toISOString(),
      p_claim_ttl: '1 hour',
      p_limit: 5,
    },
  },
  {
    name: 'claim_stale_plaid_items',
    args: {
      p_stale_before: new Date().toISOString(),
      p_claim_ttl: '1 hour',
      p_limit: 5,
    },
  },
  { name: 'trigger_scheduled_balance_refresh', args: {} },
  {
    name: 'member_session_lookup',
    args: {
      p_family_id: '00000000-0000-0000-0000-000000000000',
      p_member_id: '00000000-0000-0000-0000-000000000000',
    },
  },
  {
    name: 'check_rate_limit',
    args: { p_key: 'test-probe', p_limit: 5, p_window_seconds: 60 },
  },
  {
    name: 'check_pre_auth_rate_limit',
    args: { p_endpoint: 'pin-login', p_ip: 'test-probe' },
  },
  { name: 'pre_auth_rate_limit', args: { p_endpoint: 'login_roster' } },
  { name: 'cleanup_rate_limit_hits', args: {} },
] as const

describe('RPC surface hardening', () => {
  it('anon cannot execute auth or trigger helpers via PostgREST', async () => {
    const anon = anonClient()

    const authRole = await anon.rpc('auth_role')
    expect(authRole.error).not.toBeNull()

    const handleNewUser = await anon.rpc('handle_new_user')
    expect(handleNewUser.error).not.toBeNull()
  })

  it('authenticated cannot invoke trigger-only handle_new_user', async () => {
    const family = await createAdminFamily('rpc-trigger-only')
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const { error } = await admin.rpc('handle_new_user')
    expect(error).not.toBeNull()
  })

  it('authenticated can still read transactions_client and family RPCs', async () => {
    const family = await createAdminFamily('rpc-client-surface')
    const admin = await userClient(family.adminEmail, family.adminPassword)

    const history = await admin.from(TRANSACTIONS_CLIENT).select('id').limit(1)
    expect(history.error).toBeNull()

    const linkedChildren = await admin.rpc('family_linked_child_member_ids')
    expect(linkedChildren.error).toBeNull()
    expect(Array.isArray(linkedChildren.data)).toBe(true)

    const bucketOrders = await admin.rpc('ensure_member_bucket_orders')
    expect(bucketOrders.error).toBeNull()
  })

  it('anon is denied on every internal service-role RPC', async () => {
    const anon = anonClient()
    for (const fn of INTERNAL_RPCS) {
      const { error } = await anon.rpc(fn.name, fn.args as never)
      expect(error, `anon should be denied ${fn.name}`).not.toBeNull()
    }
  })

  it('authenticated users are denied on every internal service-role RPC', async () => {
    const family = await createAdminFamily('rpc-internal-denied')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    for (const fn of INTERNAL_RPCS) {
      const { error } = await admin.rpc(fn.name, fn.args as never)
      expect(error, `authenticated should be denied ${fn.name}`).not.toBeNull()
    }
  })

  it('service_role can still execute the internal sweep RPCs', async () => {
    const svc = serviceClient()

    // No stale connections exist in a fresh test DB — the point is the
    // call succeeds (empty set), proving the lockdown didn't break the
    // scheduled sweep path the Edge Functions rely on.
    const claim = await svc.rpc('claim_stale_simplefin_connections', {
      p_stale_before: new Date().toISOString(),
      p_claim_ttl: '1 hour',
      p_limit: 5,
    })
    expect(claim.error).toBeNull()
    expect(Array.isArray(claim.data)).toBe(true)

    const allowed = await svc.rpc('check_rate_limit', {
      p_key: `probe-${crypto.randomUUID()}`,
      p_limit: 5,
      p_window_seconds: 60,
    })
    expect(allowed.error).toBeNull()
    expect(allowed.data).toBe(true)

    // The pre-auth wrappers stay executable for service_role (the Edge
    // Functions call check_pre_auth_rate_limit with the service key).
    const preAuth = await svc.rpc('check_pre_auth_rate_limit', {
      p_endpoint: 'pin-login',
      p_ip: `198.51.100.${Math.floor(Math.random() * 254) + 1}`,
    })
    expect(preAuth.error).toBeNull()
    expect(preAuth.data).toBe(true)
  })

  it('intentional anon login RPCs remain callable', async () => {
    const anon = anonClient()

    // login_roster is the credential-less roster lookup behind the join
    // screen — anon must be able to call it (unknown code returns null,
    // not a permission error).
    const roster = await anon.rpc('login_roster', {
      p_code: 'NOTAREALCODE000',
    })
    expect(roster.error).toBeNull()
    expect(roster.data).toBeNull()

    // member_login_methods: unknown ids return exists:false, not a
    // permission error.
    const methods = await anon.rpc('member_login_methods', {
      p_family_id: '00000000-0000-0000-0000-000000000000',
      p_member_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(methods.error).toBeNull()
    expect(methods.data).toMatchObject({ exists: false })

    // login_webauthn_options: unknown ids return an error payload, not a
    // permission error. The RPC derives the RP ID from the Origin header,
    // so send a localhost origin like the browser does — without it the
    // RPC (correctly) reports 'Unsupported origin'.
    const { url, anonKey } = requireDbEnv()
    const optionsClient = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Origin: 'http://localhost:5173' } },
    })
    const options = await optionsClient.rpc('login_webauthn_options', {
      p_family_id: '00000000-0000-0000-0000-000000000000',
      p_member_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(options.error).toBeNull()
    expect(options.data).toMatchObject({ error: 'Invalid credentials' })
  })

  it('anon login_roster calls consume the in-RPC throttle budget', async () => {
    const svc = serviceClient()
    const anon = anonClient()

    // End-to-end proof that the RPC body actually invokes
    // pre_auth_rate_limit: each anon call must leave a hit row behind
    // under this endpoint's key prefix.
    const countHits = async (): Promise<number> => {
      const { count, error } = await svc
        .from('rate_limit_hits')
        .select('limit_key', { count: 'exact', head: true })
        .like('limit_key', 'preauth:login_roster:%')
      expect(error).toBeNull()
      return count ?? 0
    }

    const before = await countHits()
    const roster = await anon.rpc('login_roster', {
      p_code: 'NOTAREALCODE000',
    })
    expect(roster.error).toBeNull()
    const after = await countHits()
    expect(after).toBeGreaterThan(before)
  })
})
