// Pure account-type classification shared by client modules (no Supabase
// import, so pure libs and tests can use it). Mirrors the Postgres
// functions `is_cash_account_type` and `is_credit_card_account_type`
// and the Deno copy in supabase/functions/_shared/cashAccountTypes.ts.

// Account subtypes Teller returns. Anything in this set is treated as
// real, allocatable cash on hand. Everything else (credit cards,
// loans, investments, etc.) is excluded from the cash pool —
// you can't allocate borrowed money or unrealised stock gains into a
// "groceries" bucket.
//
// Reference: https://teller.io/docs/api/account
export const CASH_ACCOUNT_SUBTYPES = new Set<string>([
  'checking',
  'savings',
  'money_market',
  'certificate_of_deposit',
  'cash_management',
  'treasury',
  'manual',
  // SimpleFIN cash rows, and Plaid depository accounts without a classic subtype
  // (HSA, prepaid, …). Postgres counts it; so must every copy.
  'cash',
])

export function isCashAccountType(
  accountType: string | null | undefined,
): boolean {
  if (!accountType) return false
  return CASH_ACCOUNT_SUBTYPES.has(accountType.toLowerCase())
}

/**
 * Credit cards count AGAINST the household balance:
 * cash − card balances = buckets + Unbucketed (docs/CREDIT_CARDS.md).
 * `current_balance` on a card row is the amount owed (positive = debt).
 */
export function isCreditCardAccountType(
  accountType: string | null | undefined,
): boolean {
  return accountType?.toLowerCase() === 'credit_card'
}
