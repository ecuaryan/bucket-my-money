import { describe, expect, it } from 'vitest'
import { serviceClient } from './fixtures'
import {
  isCashAccountType,
  isCreditCardAccountType,
} from '../../src/lib/accountTypes'

/**
 * The cash/card classification exists three times: Postgres (what the ledger
 * actually sums), src/lib/accountTypes.ts (browser) and
 * supabase/functions/_shared/cashAccountTypes.ts (Edge Functions, checked
 * against the browser copy in src/lib/sharedMirrors.test.ts). If the SQL and
 * TypeScript disagree, counts and sync labels in the app stop matching the
 * balance — e.g. an account type SQL counts as cash but the browser ignores.
 */
const PROBES: (string | null)[] = [
  'checking',
  'savings',
  'money_market',
  'certificate_of_deposit',
  'cash_management',
  'treasury',
  'manual',
  'cash',
  'CASH',
  'Checking',
  'credit_card',
  'CREDIT_CARD',
  'credit',
  'loan',
  'mortgage',
  'investment',
  'cd',
  '',
  null,
]

describe('account type classification: Postgres vs browser copy', () => {
  const svc = serviceClient()

  it.each(PROBES.map((t) => [String(t), t]))(
    'classifies %s the same',
    async (_label, type) => {
      const cash = await svc.rpc('is_cash_account_type', { p_type: type })
      const card = await svc.rpc('is_credit_card_account_type', { p_type: type })
      expect(cash.error).toBeNull()
      expect(card.error).toBeNull()
      expect(cash.data).toBe(isCashAccountType(type))
      expect(card.data).toBe(isCreditCardAccountType(type))
    },
  )
})
