/**
 * Bank tab layout: accounts split into a Credit cards group and a Cash group,
 * each sorted largest balance first. The two groups reorder per person; keys
 * are stored in `member_bank_order` (which once keyed institution cards, so
 * stale institution keys may still be there and are simply ignored). Groups
 * with no saved position follow in their default order: cards, then cash.
 */
import { isCreditCardAccountType } from '@/lib/accountTypes'
import { formatErrorMessage } from '@/lib/errorMessage'
import { supabase } from '@/lib/supabase'

export const BANK_GROUP_CARDS_KEY = 'group:cards'
export const BANK_GROUP_CASH_KEY = 'group:cash'

type GroupableAccount = {
  account_type: string | null
  current_balance: number | string | null
  institution_name: string | null
  account_name: string | null
}

export type BankAccountGroup<T> = {
  key: string
  accounts: T[]
}

/**
 * Credit cards (largest owed first), then cash (largest balance first); ties
 * by institution, then account name. Empty groups are left out.
 */
export function groupBankAccounts<T extends GroupableAccount>(
  accounts: readonly T[],
): BankAccountGroup<T>[] {
  const byBalance = (a: T, b: T) =>
    Number(b.current_balance ?? 0) - Number(a.current_balance ?? 0) ||
    (a.institution_name ?? '').localeCompare(b.institution_name ?? '') ||
    (a.account_name ?? '').localeCompare(b.account_name ?? '')
  const cards = accounts.filter((a) => isCreditCardAccountType(a.account_type))
  const cash = accounts.filter((a) => !isCreditCardAccountType(a.account_type))
  const groups: BankAccountGroup<T>[] = [
    { key: BANK_GROUP_CARDS_KEY, accounts: cards.sort(byBalance) },
    { key: BANK_GROUP_CASH_KEY, accounts: cash.sort(byBalance) },
  ]
  return groups.filter((g) => g.accounts.length > 0)
}

/** Sort items (already in first-seen order) by the saved key order. */
export function sortByBankOrder<T extends { key: string }>(
  items: T[],
  orderKeys: readonly string[],
): T[] {
  const rank = new Map(orderKeys.map((k, i) => [k, i]))
  return items
    .map((item, seen) => ({ item, seen }))
    .sort((a, b) => {
      const ra = rank.get(a.item.key) ?? Number.MAX_SAFE_INTEGER
      const rb = rank.get(b.item.key) ?? Number.MAX_SAFE_INTEGER
      return ra !== rb ? ra - rb : a.seen - b.seen
    })
    .map(({ item }) => item)
}

/** Move the key at `from` to `to` (clamped no-op when out of range). */
export function moveKey(keys: string[], from: number, to: number): string[] {
  if (from < 0 || from >= keys.length || to < 0 || to >= keys.length || from === to) {
    return keys
  }
  const next = [...keys]
  const [key] = next.splice(from, 1)
  next.splice(to, 0, key)
  return next
}

/** The member's saved order, top to bottom. Failure (e.g. migration not deployed yet) → none. */
export async function fetchBankOrder(): Promise<string[]> {
  const { data, error } = await supabase
    .from('member_bank_order')
    .select('institution_key, display_order')
    .order('display_order')
  if (error || !data) return []
  return data.map((r) => r.institution_key)
}

export async function saveBankOrder(keys: string[]): Promise<void> {
  const { error } = await supabase.rpc('save_bank_order', { p_keys: keys })
  if (error) throw new Error(formatErrorMessage(error, 'Could not save order.'))
}
