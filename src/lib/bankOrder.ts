/**
 * Per-person order of the institution cards on the Bank tab. Institutions are
 * keyed by lower-cased name; ones with no saved position follow the ordered
 * ones in their first-seen order (a newly linked bank lands at the bottom).
 */
import { formatErrorMessage } from '@/lib/errorMessage'
import { supabase } from '@/lib/supabase'

export function institutionKey(name: string | null | undefined): string {
  return (name ?? 'Bank').toLowerCase()
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
