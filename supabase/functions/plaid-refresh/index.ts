// =====================================================================
// plaid-refresh Edge Function
//
// On-demand balance re-pull from Plaid for the caller's family. Any
// family member, mirroring simplefin-refresh (30-min throttle — balance
// reads are free on the trial tier but there's no reason to hammer).
// Optional itemIds scopes to specific Items.
//
// ITEM_LOGIN_REQUIRED marks the Item 'reconnect_required' so the UI can
// route to a Link update-mode repair (which costs nothing).
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
import { shouldSkipRefresh } from '../_shared/refreshThrottle.ts'
import { getBalances, isReconnectError, pickPlaidBalance } from '../_shared/plaid.ts'
import { syncPendingCardPayments } from '../_shared/plaidPendingSync.ts'

const PLAID_REFRESH_THROTTLE_MS = 30 * 60_000

type RefreshRequest = {
  itemIds?: string[]
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

  let itemQuery = admin
    .from('plaid_items')
    .select('id, access_token')
    .eq('family_id', familyId)
    .eq('status', 'active')
  if (body.itemIds?.length) {
    itemQuery = itemQuery.in('id', body.itemIds)
  }

  const { data: items, error: itemsError } = await itemQuery
  if (itemsError) {
    return jsonResponse(
      { error: 'Failed to load items', details: itemsError.message },
      500,
    )
  }

  if (body.itemIds?.length) {
    const found = new Set((items ?? []).map((i) => i.id))
    const invalid = body.itemIds.filter((id) => !found.has(id))
    if (invalid.length > 0) {
      return jsonResponse({ error: 'Item not found in your family' }, 404)
    }
  }

  const itemIds = (items ?? []).map((i) => i.id)
  if (itemIds.length === 0) {
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
    .select('id, plaid_account_id, plaid_item_id, account_type, last_synced_at')
    .eq('family_id', familyId)
    .eq('source', 'plaid')
    .in('plaid_item_id', itemIds)
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

  if (shouldSkipRefresh(latestSyncedMs, Date.now(), PLAID_REFRESH_THROTTLE_MS)) {
    return jsonResponse({
      ok: true,
      refreshed: false,
      accountsUpdated: 0,
      bankLastSyncedAt,
      errors: [],
    })
  }

  const accountsByItem = new Map<string, typeof accounts>()
  for (const account of accounts) {
    if (!account.plaid_item_id || !account.plaid_account_id) continue
    const bucket = accountsByItem.get(account.plaid_item_id)
    if (bucket) bucket.push(account)
    else accountsByItem.set(account.plaid_item_id, [account])
  }

  const errors: string[] = []
  let accountsUpdated = 0
  const nowIso = new Date().toISOString()
  const pendingSyncItems = []

  // One Plaid request per Item covers all of its accounts.
  const results = await Promise.all(
    (items ?? []).map(async (item) => {
      const linked = accountsByItem.get(item.id) ?? []
      if (linked.length === 0) return { updated: 0, errors: [] }
      const itemErrors: string[] = []
      let updated = 0
      try {
        const plaidAccounts = await getBalances(
          item.access_token,
          linked.map((a) => a.plaid_account_id),
        )
        const byId = new Map(plaidAccounts.map((a) => [a.account_id, a]))
        for (const account of linked) {
          const plaidAccount = byId.get(account.plaid_account_id)
          if (!plaidAccount) {
            itemErrors.push(`${account.id}: account missing from Plaid response`)
            continue
          }
          try {
            const balance = pickPlaidBalance(plaidAccount.balances)
            const { error: updateError } = await admin
              .from('accounts')
              .update({ current_balance: balance, last_synced_at: nowIso })
              .eq('id', account.id)
            if (updateError) {
              itemErrors.push(`${account.id}: ${updateError.message}`)
            } else {
              updated++
            }
          } catch (err) {
            itemErrors.push(
              `${account.id}: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
        await admin
          .from('plaid_items')
          .update({ last_synced_at: nowIso })
          .eq('id', item.id)
        pendingSyncItems.push({
          accessToken: item.access_token,
          plaidAccounts,
          linked,
        })
      } catch (err) {
        if (isReconnectError(err)) {
          // Repairable via Link update mode — costs no Item slot.
          await admin
            .from('plaid_items')
            .update({ status: 'reconnect_required' })
            .eq('id', item.id)
        }
        itemErrors.push(
          `${item.id}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      return { updated, errors: itemErrors }
    }),
  )

  // Net payments already in flight against card debt (never throws).
  await syncPendingCardPayments(admin, {
    familyId,
    items: pendingSyncItems,
  })

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
