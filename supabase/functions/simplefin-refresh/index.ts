// =====================================================================
// simplefin-refresh Edge Function
//
// On-demand balance re-pull from SimpleFIN for the caller's family. Any
// family member (admin/member/child), mirroring teller-refresh. Optional
// connectionIds scopes to specific connections.
//
// Throttled server-side at 30 minutes (vs Teller's 60s): SimpleFIN asks
// for ≲24 requests/day per connection and its upstream data refreshes
// on a daily-ish cadence anyway, so rapid re-pulls buy nothing.
// =====================================================================

// @ts-nocheck — targets the Deno runtime, not the Vite TS build.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { secretKey } from '../_shared/keys.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { requireCallerMember } from '../_shared/callerMember.ts'
import {
  isCashAccountType,
  isCreditCardAccountType,
} from '../_shared/cashAccountTypes.ts'
import { REFRESH_BUDGET, withinProviderBudget } from '../_shared/providerBudget.ts'
import { shouldSkipRefresh } from '../_shared/refreshThrottle.ts'
import { fetchAccounts, isReconnectError, normalizeBalance } from '../_shared/simplefin.ts'

const SIMPLEFIN_REFRESH_THROTTLE_MS = 30 * 60_000

type RefreshRequest = {
  connectionIds?: string[]
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const auth = await requireCallerMember(req)
  if ('errorResponse' in auth) return auth.errorResponse
  const { member } = auth
  if (
    member.role !== 'admin' &&
    member.role !== 'member' &&
    member.role !== 'child'
  ) {
    return jsonResponse({ error: 'Not authorized to refresh balances' }, 403)
  }

  let body: RefreshRequest = {}
  try {
    const text = await req.text()
    if (text.trim()) {
      body = JSON.parse(text) as RefreshRequest
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, secretKey())
  const familyId = member.family_id

  let connectionQuery = admin
    .from('simplefin_connections')
    .select('id, access_url')
    .eq('family_id', familyId)
    .eq('status', 'active')
  if (body.connectionIds?.length) {
    connectionQuery = connectionQuery.in('id', body.connectionIds)
  }

  const { data: connections, error: connectionError } = await connectionQuery
  if (connectionError) {
    return jsonResponse(
      { error: 'Failed to load connections', details: connectionError.message },
      500,
    )
  }

  if (body.connectionIds?.length) {
    const found = new Set((connections ?? []).map((c) => c.id))
    const invalid = body.connectionIds.filter((id) => !found.has(id))
    if (invalid.length > 0) {
      return jsonResponse({ error: 'Connection not found in your family' }, 404)
    }
  }

  const connectionIds = (connections ?? []).map((c) => c.id)
  if (connectionIds.length === 0) {
    return jsonResponse({
      ok: true,
      refreshed: false,
      accountsUpdated: 0,
      bankLastSyncedAt: null,
      errors: [],
    })
  }

  const { data: familyAccounts, error: accountsError } = await admin
    .from('accounts')
    .select(
      'id, simplefin_account_id, simplefin_connection_id, account_type, last_synced_at',
    )
    .eq('family_id', familyId)
    .eq('source', 'simplefin')
    .in('simplefin_connection_id', connectionIds)
  if (accountsError) {
    return jsonResponse(
      { error: 'Failed to load accounts', details: accountsError.message },
      500,
    )
  }

  const accounts = familyAccounts ?? []
  let latestSyncedMs: number | null = null
  let bankLastSyncedAt: string | null = null
  for (const account of accounts) {
    const counted =
      isCashAccountType(account.account_type) ||
      isCreditCardAccountType(account.account_type)
    if (!counted || !account.last_synced_at) continue
    const ms = Date.parse(account.last_synced_at)
    if (Number.isNaN(ms)) continue
    if (latestSyncedMs == null || ms > latestSyncedMs) {
      latestSyncedMs = ms
      bankLastSyncedAt = account.last_synced_at
    }
  }

  if (shouldSkipRefresh(latestSyncedMs, Date.now(), SIMPLEFIN_REFRESH_THROTTLE_MS)) {
    return jsonResponse({
      ok: true,
      refreshed: false,
      accountsUpdated: 0,
      bankLastSyncedAt,
      errors: [],
    })
  }

  // Atomic per-family cap on provider calls: covers parallel taps and repeated
  // failing refreshes, which the timestamp throttle above can't see.
  if (
    !(await withinProviderBudget(
      admin,
      `simplefin-refresh:${familyId}`,
      REFRESH_BUDGET.limit,
      REFRESH_BUDGET.windowSeconds,
    ))
  ) {
    return jsonResponse({
      ok: true,
      refreshed: false,
      accountsUpdated: 0,
      bankLastSyncedAt,
      errors: [],
    })
  }

  const accountsByConnection = new Map<string, typeof accounts>()
  for (const account of accounts) {
    if (!account.simplefin_connection_id || !account.simplefin_account_id) continue
    const bucket = accountsByConnection.get(account.simplefin_connection_id)
    if (bucket) bucket.push(account)
    else accountsByConnection.set(account.simplefin_connection_id, [account])
  }

  const errors: string[] = []
  let accountsUpdated = 0
  const nowIso = new Date().toISOString()

  // One SimpleFIN request per connection covers all of its accounts.
  const results = await Promise.all(
    (connections ?? []).map(async (connection) => {
      const linked = accountsByConnection.get(connection.id) ?? []
      if (linked.length === 0) return { connection, updated: 0, errors: [] }
      const connectionErrors: string[] = []
      let updated = 0
      try {
        const accountSet = await fetchAccounts(connection.access_url, {
          balancesOnly: true,
          accountIds: linked.map((a) => a.simplefin_account_id),
        })
        connectionErrors.push(...accountSet.errors)
        const byId = new Map(accountSet.accounts.map((a) => [a.id, a]))
        for (const account of linked) {
          const sfAccount = byId.get(account.simplefin_account_id)
          if (!sfAccount) {
            connectionErrors.push(
              `${account.id}: account missing from SimpleFIN response`,
            )
            continue
          }
          try {
            const kind = isCreditCardAccountType(account.account_type)
              ? 'card'
              : 'cash'
            const balance = normalizeBalance(kind, sfAccount.balance)
            const { error: updateError } = await admin
              .from('accounts')
              .update({ current_balance: balance, last_synced_at: nowIso })
              .eq('id', account.id)
            if (updateError) {
              connectionErrors.push(`${account.id}: ${updateError.message}`)
            } else {
              updated++
            }
          } catch (err) {
            connectionErrors.push(
              `${account.id}: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
        await admin
          .from('simplefin_connections')
          .update({ last_synced_at: nowIso })
          .eq('id', connection.id)
      } catch (err) {
        if (isReconnectError(err)) {
          // SimpleFIN affirmatively rejected the credentials — flag the
          // connection so the UI can route to reconnect instead of retry.
          await admin
            .from('simplefin_connections')
            .update({ status: 'disconnected' })
            .eq('id', connection.id)
        }
        connectionErrors.push(
          `${connection.id}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      return { connection, updated, errors: connectionErrors }
    }),
  )

  for (const result of results) {
    accountsUpdated += result.updated
    errors.push(...result.errors)
    if (result.updated > 0) {
      bankLastSyncedAt = maxIso(bankLastSyncedAt, nowIso)
    }
  }

  return jsonResponse({
    ok: true,
    refreshed: accountsUpdated > 0,
    accountsUpdated,
    bankLastSyncedAt,
    errors,
  })
})
