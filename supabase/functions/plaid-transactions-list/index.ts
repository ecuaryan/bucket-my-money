// =====================================================================
// plaid-transactions-list Edge Function
//
// Recent bank transactions for a Plaid-linked account, mirroring
// simplefin-transactions-list: family adults see any family account; a
// child sees only the account assigned to them. Fetches a 14-day window
// via /transactions/get (covered by the Transactions subscription — free
// on the trial tier; NEVER /transactions/refresh, the per-call-billed
// force-repoll). Nothing is persisted locally; response shape matches
// the other providers so the Bank activity view stays provider-agnostic.
//
// Sign convention: Plaid amounts are positive for money OUT; the app
// renders positive as money IN (Teller convention), so amounts flip.
// =====================================================================

// @ts-nocheck — targets the Deno runtime, not the Vite TS build.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { secretKey } from '../_shared/keys.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { requireCallerMember } from '../_shared/callerMember.ts'
import { mapPlaidTransactionDetails } from '../_shared/plaidTransactionDetails.ts'
import {
  getTransactions,
  isReconnectError,
  PlaidTimeoutError,
  type PlaidTransaction,
} from '../_shared/plaid.ts'

const BANK_TRANSACTIONS_DAYS = 14
const BANK_TRANSACTIONS_LIMIT = 50

type TransactionsRequest = {
  accountId?: string
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function transactionLabel(txn: PlaidTransaction): string {
  const merchant = txn.merchant_name?.trim()
  if (merchant) return merchant
  return txn.name?.trim() || 'Transaction'
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

  let body: TransactionsRequest = {}
  try {
    const text = await req.text()
    if (text.trim()) {
      body = JSON.parse(text) as TransactionsRequest
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const accountId = body.accountId?.trim()
  if (!accountId) {
    return jsonResponse({ error: 'accountId is required' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, secretKey())

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select(
      'id, family_id, owner_member_id, source, plaid_account_id, plaid_item_id, plaid_items ( id, family_id, access_token, status )',
    )
    .eq('id', accountId)
    .maybeSingle()
  if (accountError) {
    return jsonResponse(
      { error: 'Failed to load account', details: accountError.message },
      500,
    )
  }
  // Same 404 whether the account is missing or in another family.
  if (!account || account.family_id !== member.family_id) {
    return jsonResponse({ error: 'Account not found in your family' }, 404)
  }

  const isFamilyAdult = member.role === 'admin' || member.role === 'member'
  const ownsAccount = account.owner_member_id === member.id
  if (!isFamilyAdult && !ownsAccount) {
    return jsonResponse({ error: 'You can only view your own account' }, 403)
  }

  if (account.source !== 'plaid') {
    return jsonResponse({ error: 'Account is not a Plaid account' }, 400)
  }
  if (!account.plaid_account_id || !account.plaid_item_id) {
    return jsonResponse({ error: 'Account is missing Plaid linkage' }, 400)
  }

  const item = Array.isArray(account.plaid_items)
    ? account.plaid_items[0]
    : account.plaid_items
  if (
    !item ||
    item.family_id !== member.family_id ||
    !item.access_token ||
    item.status !== 'active'
  ) {
    return jsonResponse(
      { error: 'Bank link needs reconnecting', code: 'bank_link_reconnect' },
      409,
    )
  }

  const end = new Date()
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - (BANK_TRANSACTIONS_DAYS - 1))

  try {
    const raw = await getTransactions(item.access_token, account.plaid_account_id, {
      startDate: isoDateOnly(start),
      endDate: isoDateOnly(end),
      count: BANK_TRANSACTIONS_LIMIT,
    })

    const transactions = raw
      .map((txn) => {
        const label = transactionLabel(txn)
        return {
          id: txn.transaction_id,
          date: txn.date,
          // Plaid: positive = outflow. App: positive = inflow. Flip.
          amount: -txn.amount,
          description: txn.name ?? '',
          label,
          status: txn.pending ? 'pending' : 'posted',
          type: '',
          category: txn.personal_finance_category?.primary ?? null,
          details: mapPlaidTransactionDetails(txn, label),
        }
      })
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date)
        if (byDate !== 0) return byDate
        return b.id.localeCompare(a.id)
      })
      .slice(0, BANK_TRANSACTIONS_LIMIT)

    return jsonResponse({
      ok: true,
      startDate: isoDateOnly(start),
      endDate: isoDateOnly(end),
      limit: BANK_TRANSACTIONS_LIMIT,
      transactions,
    })
  } catch (err) {
    if (err instanceof PlaidTimeoutError) {
      return jsonResponse(
        { error: 'Bank request timed out', code: 'bank_timeout', details: err.message },
        504,
      )
    }
    if (isReconnectError(err)) {
      await admin
        .from('plaid_items')
        .update({ status: 'reconnect_required' })
        .eq('id', item.id)
      return jsonResponse(
        { error: 'Bank link needs reconnecting', code: 'bank_link_reconnect' },
        409,
      )
    }
    return jsonResponse(
      {
        error: 'Failed to load transactions from bank',
        code: 'bank_error',
        details: err instanceof Error ? err.message : String(err),
      },
      502,
    )
  }
})
