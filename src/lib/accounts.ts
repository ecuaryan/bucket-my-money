import { isCashAccountType, isCreditCardAccountType } from '@/lib/accountTypes'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Account = Database['public']['Tables']['accounts']['Row']

/** Family pool or legacy admin/member ownership — not assigned to a child. */
export function isFamilyPoolAccount(
  account: Pick<Account, 'owner_member_id'>,
  memberRolesById: ReadonlyMap<string, string>,
): boolean {
  if (!account.owner_member_id) return true
  const role = memberRolesById.get(account.owner_member_id)
  return role === 'admin' || role === 'member'
}

export function accountAssignmentChildId(
  account: Pick<Account, 'owner_member_id'>,
  memberRolesById: ReadonlyMap<string, string>,
): string | null {
  if (!account.owner_member_id) return null
  if (memberRolesById.get(account.owner_member_id) === 'child') {
    return account.owner_member_id
  }
  return null
}

/** Assign linked account to the family pool or to one child. Admin-only (RLS). */
export async function assignAccountOwner(
  accountId: string,
  ownerMemberId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('accounts')
    .update({ owner_member_id: ownerMemberId })
    .eq('id', accountId)
  if (error) throw error
}

export {
  CASH_ACCOUNT_SUBTYPES,
  isCashAccountType,
  isCreditCardAccountType,
} from '@/lib/accountTypes'

export function isManualAccount(a: Pick<Account, 'source'>): boolean {
  return a.source === 'manual'
}

/** Human display for Teller subtypes, e.g. "credit_card" → "credit card". */
export function accountTypeLabel(accountType: string | null): string {
  return accountType ? accountType.replace(/_/g, ' ') : '—'
}

export function isTellerAccount(a: Pick<Account, 'source'>): boolean {
  return a.source === 'teller'
}

/**
 * Linked to a bank via any provider (Teller, SimpleFIN, …) — as opposed
 * to a manually entered amount. Mirrors the SQL predicate
 * `source <> 'manual'` (member_has_linked_account, breakdown bank_cash).
 */
export function isLinkedAccount(a: Pick<Account, 'source'>): boolean {
  return a.source !== 'manual'
}

/**
 * How to tag a linked account on the Bank tab so a shared/family account is
 * visually distinct from a kid's personal account.
 * - `shared`: family-pool (or legacy adult-owned) — labelled "Shared".
 * - `member`: assigned to another member (a kid) — labelled with their name.
 * - `null`: the viewer's own account — no tag needed.
 */
export type BankAccountOwnerTag =
  | { kind: 'shared'; label: string }
  | { kind: 'member'; label: string }

export function bankAccountOwnerTag(
  account: Pick<Account, 'owner_member_id'>,
  memberRolesById: ReadonlyMap<string, string>,
  memberNamesById: ReadonlyMap<string, string>,
  viewerMemberId: string | null,
  opts: { sharedLabel: string; fallbackName: string },
): BankAccountOwnerTag | null {
  if (isFamilyPoolAccount(account, memberRolesById)) {
    return { kind: 'shared', label: opts.sharedLabel }
  }
  if (account.owner_member_id === viewerMemberId) return null
  const name = memberNamesById.get(account.owner_member_id as string)
  return { kind: 'member', label: name ?? opts.fallbackName }
}

export function isCashAccount(a: Pick<Account, 'account_type'>): boolean {
  return isCashAccountType(a.account_type)
}

/**
 * Credit cards count AGAINST the household balance:
 * cash − card balances = buckets + Unbucketed (docs/CREDIT_CARDS.md).
 * Mirrors Postgres `is_credit_card_account_type`. `current_balance` on a
 * card row is the amount owed (positive = debt).
 */
export function isCreditCardAccount(a: Pick<Account, 'account_type'>): boolean {
  return isCreditCardAccountType(a.account_type)
}

export function sumCashBalance(accounts: Account[]): number {
  return accounts
    .filter(isCashAccount)
    .reduce((sum, a) => sum + Number(a.current_balance), 0)
}

/**
 * Part of a card's debt that a payment already in flight covers (derived by the
 * Plaid sync; 0 otherwise). Mirrors Postgres `card_effective_debt`.
 */
export function cardPendingPayment(
  a: Pick<Account, 'current_balance' | 'pending_payment_credit'>,
): number {
  const balance = Number(a.current_balance)
  return Math.min(Number(a.pending_payment_credit ?? 0), Math.max(balance, 0))
}

/** Card debt after netting payments already in flight (what the ledger subtracts). */
export function sumCardDebt(accounts: Account[]): number {
  return accounts
    .filter(isCreditCardAccount)
    .reduce((sum, a) => sum + Number(a.current_balance) - cardPendingPayment(a), 0)
}

export function sumCardPendingPayments(accounts: Account[]): number {
  return accounts
    .filter(isCreditCardAccount)
    .reduce((sum, a) => sum + cardPendingPayment(a), 0)
}

/** Most recent sync time across cash accounts (ISO), or null if none synced. */
export function latestCashSyncAt(accounts: Account[]): string | null {
  let latest: string | null = null
  let latestMs = -Infinity
  for (const a of accounts) {
    if (!isCashAccount(a) || !a.last_synced_at) continue
    const ms = Date.parse(a.last_synced_at)
    if (Number.isNaN(ms)) continue
    if (ms > latestMs) {
      latestMs = ms
      latest = a.last_synced_at
    }
  }
  return latest
}

export type ManualAccountKind = 'cash' | 'card'

/** PostgREST error when the DB lags the frontend (migration not applied). */
function isMissingRpcSignatureError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('could not find the function') ||
    lower.includes('schema cache')
  )
}

export async function addManualAccount(
  amount: number,
  label: string,
  kind: ManualAccountKind = 'cash',
): Promise<string> {
  const { data, error } = await supabase.rpc('add_manual_account', {
    p_amount: amount,
    p_label: label,
    p_kind: kind,
  })
  if (!error) return data as string
  // Migration 79 adds p_kind. If the hosted DB lags the frontend, keep the
  // onboarding cash flow working via the legacy 2-arg signature; manual
  // cards genuinely need the migration, so let that error surface.
  if (kind === 'cash' && isMissingRpcSignatureError(error.message)) {
    const { data: legacy, error: legacyError } = await supabase.rpc(
      'add_manual_account',
      { p_amount: amount, p_label: label } as {
        p_amount: number
        p_label: string
      },
    )
    if (legacyError) throw legacyError
    return legacy as string
  }
  throw error
}

export async function updateManualAccount(
  accountId: string,
  amount: number,
  label: string,
): Promise<void> {
  const { error } = await supabase.rpc('update_manual_account', {
    p_account_id: accountId,
    p_amount: amount,
    p_label: label,
  })
  if (error) throw error
}

export async function deleteManualAccount(accountId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_manual_account', {
    p_account_id: accountId,
  })
  if (error) throw error
}
