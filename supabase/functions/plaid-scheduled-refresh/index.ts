// =====================================================================
// plaid-scheduled-refresh Edge Function
//
// Cadence sweep for Plaid-linked balances, mirroring
// simplefin-scheduled-refresh. Invoked by pg_cron via net.http_post
// (migration 88's trigger posts to every configured provider sweep),
// NOT by end users. Claims the stalest due Items in bounded batches via
// claim_stale_plaid_items so overlapping ticks stay disjoint.
//
// Balance reads are free on the trial tier; the 6h cadence matches the
// other providers so the "Refreshed X ago" label behaves consistently.
// ITEM_LOGIN_REQUIRED marks the Item 'reconnect_required' (repair via
// Link update mode — never costs an Item slot).
//
// Trust model: publicly reachable but authenticated by a shared secret
// (X-Cron-Secret == SCHEDULED_REFRESH_SECRET). Uses the service role to
// bypass RLS. Inert until SCHEDULED_REFRESH_SECRET is configured.
// =====================================================================

// @ts-nocheck — targets the Deno runtime, not the Vite TS build.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { secretKey } from '../_shared/keys.ts'
import { isCreditCardAccountType } from '../_shared/cashAccountTypes.ts'
import { syncPendingCardPayments, type PendingSyncItem } from '../_shared/plaidPendingSync.ts'
import {
  getBalances,
  isReconnectError,
  pickPlaidBalance,
  plaidWebhookUrl,
  updateItemWebhook,
} from '../_shared/plaid.ts'

const CADENCE_HOURS = Number(Deno.env.get('SCHEDULED_REFRESH_CADENCE_HOURS') ?? '6')
const BATCH = Number(Deno.env.get('SCHEDULED_REFRESH_BATCH') ?? '25')
const CLAIM_TTL = '15 minutes'
const TIME_BUDGET_MS = 40_000
const MAX_ITEMS = 200
const ITEM_CONCURRENCY = 4

function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const expected = Deno.env.get('SCHEDULED_REFRESH_SECRET') ?? ''
  if (!expected) {
    console.error('SCHEDULED_REFRESH_SECRET not configured')
    return new Response('scheduled refresh secret not configured', { status: 500 })
  }
  const provided = req.headers.get('X-Cron-Secret') ?? ''
  if (!secretsEqual(provided, expected)) {
    return new Response('unauthorized', { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, secretKey())

  const start = Date.now()
  const staleBefore = new Date(
    Date.now() - CADENCE_HOURS * 60 * 60 * 1000,
  ).toISOString()

  let itemsProcessed = 0
  let accountsUpdated = 0
  const errors: string[] = []

  while (Date.now() - start < TIME_BUDGET_MS && itemsProcessed < MAX_ITEMS) {
    const limit = Math.min(BATCH, MAX_ITEMS - itemsProcessed)

    const { data: claimed, error: claimError } = await admin.rpc(
      'claim_stale_plaid_items',
      {
        p_stale_before: staleBefore,
        p_claim_ttl: CLAIM_TTL,
        p_limit: limit,
      },
    )
    if (claimError) {
      errors.push(`claim: ${claimError.message}`)
      break
    }
    if (!claimed || claimed.length === 0) break

    // Self-heal webhook configuration: Items created before the webhook
    // shipped (or before PLAID_WEBHOOK_URL was set) get pointed at the
    // receiver the first time the sweep touches them. Unconfigured Items
    // keep going stale, so the sweep always reaches them eventually.
    const webhook = plaidWebhookUrl()
    if (webhook) {
      const { data: unconfigured } = await admin
        .from('plaid_items')
        .select('id, access_token')
        .in('id', claimed.map((i: { id: string }) => i.id))
        .is('webhook_configured_at', null)
      for (const item of unconfigured ?? []) {
        try {
          await updateItemWebhook(item.access_token, webhook)
          await admin
            .from('plaid_items')
            .update({ webhook_configured_at: new Date().toISOString() })
            .eq('id', item.id)
        } catch (err) {
          errors.push(
            `webhook-config ${item.id}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
    }

    const { data: accounts, error: accountsError } = await admin
      .from('accounts')
      .select('id, family_id, plaid_account_id, plaid_item_id, account_type')
      .in('plaid_item_id', claimed.map((i: { id: string }) => i.id))
      .eq('source', 'plaid')
      .not('plaid_account_id', 'is', null)
    if (accountsError) {
      errors.push(`accounts: ${accountsError.message}`)
      break
    }

    const accountsByItem = new Map<string, typeof accounts>()
    for (const account of accounts ?? []) {
      const bucket = accountsByItem.get(account.plaid_item_id)
      if (bucket) bucket.push(account)
      else accountsByItem.set(account.plaid_item_id, [account])
    }

    const nowIso = new Date().toISOString()
    const pendingByFamily = new Map<string, PendingSyncItem[]>()
    await mapWithConcurrency(
      claimed,
      ITEM_CONCURRENCY,
      async (item: { id: string; access_token: string }) => {
        const linked = accountsByItem.get(item.id) ?? []
        if (linked.length === 0) return
        try {
          const plaidAccounts = await getBalances(
            item.access_token,
            linked.map((a) => a.plaid_account_id),
          )
          const byId = new Map(plaidAccounts.map((a) => [a.account_id, a]))
          for (const account of linked) {
            const plaidAccount = byId.get(account.plaid_account_id)
            if (!plaidAccount) {
              errors.push(`${account.id}: missing from Plaid response`)
              continue
            }
            try {
              const balance = pickPlaidBalance(plaidAccount.balances)
              const { error: updateError } = await admin
                .from('accounts')
                .update({ current_balance: balance, last_synced_at: nowIso })
                .eq('id', account.id)
              if (updateError) {
                errors.push(`${account.id}: ${updateError.message}`)
              } else {
                accountsUpdated++
              }
            } catch (err) {
              errors.push(
                `${account.id}: ${err instanceof Error ? err.message : String(err)}`,
              )
            }
          }
          await admin
            .from('plaid_items')
            .update({ last_synced_at: nowIso })
            .eq('id', item.id)
          const familyId = linked[0].family_id
          const list = pendingByFamily.get(familyId) ?? []
          list.push({ accessToken: item.access_token, plaidAccounts, linked })
          pendingByFamily.set(familyId, list)
        } catch (err) {
          if (isReconnectError(err)) {
            await admin
              .from('plaid_items')
              .update({ status: 'reconnect_required' })
              .eq('id', item.id)
          }
          errors.push(
            `${item.id}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      },
    )

    // Net payments already in flight against card debt. Runs for every family
    // that had an Item in this batch — even if its balance pull failed — so
    // stale adjustments get cleared rather than left behind (never throws).
    const familiesInBatch = new Set((accounts ?? []).map((a) => a.family_id))
    for (const familyId of familiesInBatch) {
      await syncPendingCardPayments(admin, {
        familyId,
        items: pendingByFamily.get(familyId) ?? [],
      })
    }

    itemsProcessed += claimed.length
    if (claimed.length < limit) break // drained the due set
  }

  return new Response(
    JSON.stringify({
      ok: true,
      itemsProcessed,
      accountsUpdated,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
      elapsedMs: Date.now() - start,
    }),
    { headers: { 'content-type': 'application/json' } },
  )
})
