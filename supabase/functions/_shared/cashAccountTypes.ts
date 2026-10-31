/** Cash subtypes that count toward spending money (mirrors Postgres is_cash_account_type). */
export const CASH_ACCOUNT_SUBTYPES = new Set([
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

export function isCashAccountType(accountType: string | null | undefined): boolean {
  if (!accountType) return false
  return CASH_ACCOUNT_SUBTYPES.has(accountType.toLowerCase())
}

/**
 * Credit cards count against the household balance (docs/CREDIT_CARDS.md).
 * Mirrors Postgres is_credit_card_account_type and src/lib/accountTypes.ts.
 */
export function isCreditCardAccountType(
  accountType: string | null | undefined,
): boolean {
  return accountType?.toLowerCase() === 'credit_card'
}
