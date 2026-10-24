// Provider-neutral bank-link types and errors shared by the Teller and
// SimpleFIN clients (and any future provider). The response shapes match
// what the provider Edge Functions return, so components can render bank
// activity and refresh results without knowing which provider served them.

import { REFRESH_BALANCES_ERROR, REFRESH_BALANCES_THROTTLED } from '@/lib/brand'

/**
 * The bank link is expired/deauthorized — a retry won't help; it must be
 * reconnected. Callers pick admin vs. member copy and show a reconnect CTA
 * rather than the generic transient error.
 */
export class BankLinkReconnectError extends Error {
  constructor() {
    super('Bank link needs reconnecting')
    this.name = 'BankLinkReconnectError'
  }
}

export type RefreshBalancesResult = {
  ok: true
  refreshed: boolean
  accountsUpdated: number
  bankLastSyncedAt: string | null
  errors: string[]
}

/** Extra per-transaction detail (Plaid). Single definition lives with the Edge mapper. */
export type { BankTransactionDetails } from '../../supabase/functions/_shared/plaidTransactionDetails'

export type BankTransactionRow = {
  id: string
  date: string
  amount: number
  description: string
  label: string
  status: 'posted' | 'pending'
  type: string
  category: string | null
  /** Optional extras; absent for providers/banks that don't supply them. */
  details?: import('../../supabase/functions/_shared/plaidTransactionDetails').BankTransactionDetails
}

export type FetchBankTransactionsResult = {
  ok: true
  startDate: string
  endDate: string
  limit: number
  transactions: BankTransactionRow[]
}

/**
 * Friendly message when a balance refresh partially or fully failed, else null.
 *
 * Refresh calls resolve (HTTP 200) even when a bank errored — per-account
 * failures are collected into `errors` rather than thrown. Callers must check
 * this so a failed refresh isn't silently swallowed (the spinner stopping with
 * no feedback). A throttled/skipped refresh has no errors and returns null.
 */
export function refreshBalancesErrorMessage(
  result: RefreshBalancesResult,
): string | null {
  return result.errors.length > 0 ? REFRESH_BALANCES_ERROR : null
}

/** Servers refresh a bank at most this often; a tap sooner is a no-op. */
const REFRESH_THROTTLE_MS = 30 * 60_000

/**
 * Message for a Refresh tap that did nothing because balances were synced
 * moments ago (throttled), else null. Not shown when anything errored, or when
 * the last sync is old or unknown (nothing to refresh is a different story).
 */
export function refreshThrottledMessage(
  result: RefreshBalancesResult,
  now: number = Date.now(),
): string | null {
  if (result.refreshed || result.errors.length > 0 || !result.bankLastSyncedAt) {
    return null
  }
  const age = now - Date.parse(result.bankLastSyncedAt)
  return age >= 0 && age <= REFRESH_THROTTLE_MS + 60_000
    ? REFRESH_BALANCES_THROTTLED
    : null
}
