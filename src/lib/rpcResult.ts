import { MONEY_SAVE_UNCONFIRMED } from '@/lib/brand'

/**
 * A money RPC (`move_money`, `give_money`, `return_from_child`) returns the new
 * transaction id. postgrest-js can hand back `error: null` with `data` null or
 * `[]` for a 404 or an empty 2xx body, so "no error" alone must never read as
 * "saved". Only a non-empty id string counts; anything else throws.
 */
export function requireTransactionId(data: unknown): string {
  if (typeof data === 'string' && data.trim() !== '') return data
  throw new Error(MONEY_SAVE_UNCONFIRMED)
}
