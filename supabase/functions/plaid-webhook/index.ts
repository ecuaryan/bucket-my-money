// =====================================================================
// plaid-webhook Edge Function
//
// Receives Plaid webhooks (verify_jwt=false — Plaid has no Supabase JWT).
// Authenticity: every request carries a Plaid-Verification header, an
// ES256 JWT over a SHA-256 of the raw body, verified against Plaid's
// published key (verifyPlaidWebhook). Unverified requests get 401 and
// touch nothing.
//
// Actions (classifyPlaidWebhook):
//   * TRANSACTIONS/*            → re-pull the Item's balances immediately
//     (this is the freshness win over the 6h sweep; Realtime pushes the
//     new numbers to open sessions via the accounts table)
//   * ITEM/ERROR (login-shaped), PENDING_EXPIRATION, PENDING_DISCONNECT
//                               → status 'reconnect_required' so Admin
//     offers the free update-mode repair proactively
//   * everything else           → audit log only
//
// Every verified webhook is recorded in plaid_events regardless.
// =====================================================================

// @ts-nocheck — targets the Deno runtime, not the Vite TS build.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { secretKey } from '../_shared/keys.ts'
import { syncPendingCardPayments } from '../_shared/plaidPendingSync.ts'
import {
  classifyPlaidWebhook,
  getBalances,
  isReconnectError,
  pickPlaidBalance,
  verifyPlaidWebhook,
} from '../_shared/plaid.ts'

type PlaidWebhookBody = {
  webhook_type?: string
  webhook_code?: string
  item_id?: string
  error?: { error_code?: string | null } | null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()
  const verification = await verifyPlaidWebhook(
    rawBody,
    req.headers.get('Plaid-Verification'),
  )
  if (!verification.ok) {
    console.warn('plaid-webhook rejected:', verification.reason)
    return new Response('unauthorized', { status: 401 })
  }

  let body: PlaidWebhookBody
  try {
    body = JSON.parse(rawBody) as PlaidWebhookBody
  } catch {
    return new Response('invalid body', { status: 400 })
  }

  const webhookType = body.webhook_type ?? 'UNKNOWN'
  const webhookCode = body.webhook_code ?? 'UNKNOWN'
  const plaidItemId = body.item_id ?? null

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, secretKey())

  // Plaid item_ids are globally unique; ours are unique per family.
  let item: {
    id: string
    family_id: string
    access_token: string
    status: string
  } | null = null
  if (plaidItemId) {
    const { data } = await admin
      .from('plaid_items')
      .select('id, family_id, access_token, status')
      .eq('item_id', plaidItemId)
      .maybeSingle()
    item = data ?? null
  }

  // Audit first — even events for unknown items are worth a trace.
  await admin.from('plaid_events').insert({
    family_id: item?.family_id ?? null,
    plaid_item_id: item?.id ?? null,
    webhook_type: webhookType,
    webhook_code: webhookCode,
    payload: body,
  })

  if (!item) {
    // Not ours (or already fully removed) — acknowledged, nothing to do.
    return new Response(JSON.stringify({ ok: true, handled: false }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  const action = classifyPlaidWebhook(
    webhookType,
    webhookCode,
    body.error?.error_code ?? null,
  )

  if (action === 'reconnect') {
    // Don't resurrect a deliberately detached Item.
    if (item.status === 'active') {
      await admin
        .from('plaid_items')
        .update({ status: 'reconnect_required' })
        .eq('id', item.id)
    }
    return new Response(JSON.stringify({ ok: true, action }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  if (action === 'refresh' && item.status !== 'detached') {
    const { data: accounts } = await admin
      .from('accounts')
      .select('id, plaid_account_id, account_type')
      .eq('family_id', item.family_id)
      .eq('source', 'plaid')
      .eq('plaid_item_id', item.id)
      .not('plaid_account_id', 'is', null)

    const linked = accounts ?? []
    if (linked.length > 0) {
      try {
        const plaidAccounts = await getBalances(
          item.access_token,
          linked.map((a) => a.plaid_account_id),
        )
        const byId = new Map(plaidAccounts.map((a) => [a.account_id, a]))
        const nowIso = new Date().toISOString()
        for (const account of linked) {
          const plaidAccount = byId.get(account.plaid_account_id)
          if (!plaidAccount) continue
          try {
            const balance = pickPlaidBalance(plaidAccount.balances)
            await admin
              .from('accounts')
              .update({ current_balance: balance, last_synced_at: nowIso })
              .eq('id', account.id)
          } catch (err) {
            console.error(`plaid-webhook balance update ${account.id}`, err)
          }
        }
        // A LOGIN_REPAIRED (or any successful pull on a flagged Item)
        // means the link works again.
        await admin
          .from('plaid_items')
          .update({ last_synced_at: nowIso, status: 'active' })
          .eq('id', item.id)
        // Net payments already in flight against card debt (never throws).
        await syncPendingCardPayments(admin, {
          familyId: item.family_id,
          items: [{ accessToken: item.access_token, plaidAccounts, linked }],
        })
      } catch (err) {
        if (isReconnectError(err) && item.status === 'active') {
          await admin
            .from('plaid_items')
            .update({ status: 'reconnect_required' })
            .eq('id', item.id)
        }
        console.error('plaid-webhook refresh failed', err)
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, action }), {
    headers: { 'content-type': 'application/json' },
  })
})
