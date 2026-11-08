// =====================================================================
// simplefin-transactions-list Edge Function
//
// Recent bank transactions for a SimpleFIN-linked account, mirroring
// teller-transactions-list: viewable by family adults for any account in
// their family, or by the member the account is assigned to. Fetches a
// 14-day window on demand from SimpleFIN — nothing is persisted locally.
// Response shape matches the Teller variant so the Bank activity view is
// provider-agnostic.
// =====================================================================

// @ts-nocheck — targets the Deno runtime, not the Vite TS build.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { secretKey } from '../_shared/keys.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import { requireCallerMember } from '../_shared/callerMember.ts'
import { LIST_BUDGET, withinProviderBudget } from '../_shared/providerBudget.ts'
import { rateLimitResponse } from '../_shared/rateLimit.ts'
import {
  fetchAccounts,
  isReconnectError,
  SimpleFinTimeoutError,
  type SimpleFinTransaction,
} from '../_shared/simplefin.ts'

const BANK_TRANSACTIONS_DAYS = 14
const BANK_TRANSACTIONS_LIMIT = 50

type TransactionsRequest = {
  accountId?: string
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** SimpleFIN timestamps are unix seconds; pending rows may use transacted_at. */
function transactionDate(txn: SimpleFinTransaction): string {
  const seconds = txn.posted || txn.transacted_at || 0
  if (!seconds) return ''
  return isoDateOnly(new Date(seconds * 1000))
}

function transactionLabel(txn: SimpleFinTransaction): string {
  const payee = txn.payee?.trim()
  if (payee) return payee
  return txn.description?.trim() || 'Transaction'
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
      'id, family_id, owner_member_id, source, simplefin_account_id, simplefin_connection_id, simplefin_connections ( id, family_id, access_url, status )',
    )
    .eq('id', accountId)
    .maybeSingle()
  if (accountError) {
    return jsonResponse(
      { error: 'Failed to load account', details: accountError.message },
      500,
    )
  }
  // Same 404 whether the account is missing or in another family — no
  // existence leak across tenants.
  if (!account || account.family_id !== member.family_id) {
    return jsonResponse({ error: 'Account not found in your family' }, 404)
  }

  // Family adults see every family account; a child sees only the account
  // assigned to them. Same rule as accounts_select_family_or_self —
  // re-checked here because this function uses the service role.
  const isFamilyAdult = member.role === 'admin' || member.role === 'member'
  const ownsAccount = account.owner_member_id === member.id
  if (!isFamilyAdult && !ownsAccount) {
    return jsonResponse({ error: 'You can only view your own account' }, 403)
  }

  if (account.source !== 'simplefin') {
    return jsonResponse({ error: 'Account is not a SimpleFIN account' }, 400)
  }
  if (!account.simplefin_account_id || !account.simplefin_connection_id) {
    return jsonResponse({ error: 'Account is missing SimpleFIN linkage' }, 400)
  }

  const connection = Array.isArray(account.simplefin_connections)
    ? account.simplefin_connections[0]
    : account.simplefin_connections
  if (
    !connection ||
    connection.family_id !== member.family_id ||
    !connection.access_url ||
    connection.status !== 'active'
  ) {
    return jsonResponse(
      { error: 'Bank link needs reconnecting', code: 'bank_link_reconnect' },
      409,
    )
  }

  if (
    !(await withinProviderBudget(
      admin,
      `simplefin-transactions-list:${member.family_id}`,
      LIST_BUDGET.limit,
      LIST_BUDGET.windowSeconds,
    ))
  ) {
    return rateLimitResponse()
  }

  const end = new Date()
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - (BANK_TRANSACTIONS_DAYS - 1))
  start.setUTCHours(0, 0, 0, 0)

  try {
    const accountSet = await fetchAccounts(connection.access_url, {
      accountIds: [account.simplefin_account_id],
      startDate: Math.floor(start.getTime() / 1000),
      endDate: Math.floor(end.getTime() / 1000),
      pending: true,
    })

    const sfAccount = accountSet.accounts.find(
      (a) => a.id === account.simplefin_account_id,
    )
    if (!sfAccount) {
      return jsonResponse(
        {
          error: 'Failed to load transactions from bank',
          code: 'bank_error',
          details:
            accountSet.errors.join('; ') ||
            'account missing from SimpleFIN response',
        },
        502,
      )
    }

    const transactions = (sfAccount.transactions ?? [])
      .map((txn) => ({
        id: txn.id,
        date: transactionDate(txn),
        amount: Number(txn.amount),
        description: txn.description ?? '',
        label: transactionLabel(txn),
        status: txn.pending ? 'pending' : 'posted',
        type: '',
        category: null,
      }))
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
    if (err instanceof SimpleFinTimeoutError) {
      return jsonResponse(
        { error: 'Bank request timed out', code: 'bank_timeout', details: err.message },
        504,
      )
    }
    if (isReconnectError(err)) {
      await admin
        .from('simplefin_connections')
        .update({ status: 'disconnected' })
        .eq('id', connection.id)
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
