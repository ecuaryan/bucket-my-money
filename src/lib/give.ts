import { isMissingDbFunctionError } from '@/lib/availableBalance'
import { withAuthLockRetry } from '@/lib/authLockError'
import type { GiveRecipientMember } from '@/lib/giveRecipients'
import { requireTransactionId } from '@/lib/rpcResult'
import { supabase } from '@/lib/supabase'
import { FLOAT_LABEL_LOWER } from '@/lib/brand'

export type GiveMoneyArgs = {
  toMemberId: string
  amount: number
  note?: string | null
}

export async function fetchLinkedChildMemberIds(): Promise<Set<string>> {
  return withAuthLockRetry(async () => {
    const { data, error } = await supabase.rpc('family_linked_child_member_ids')
    if (error) {
      if (isMissingDbFunctionError(error.message)) {
        return new Set()
      }
      throw error
    }
    const ids = (data ?? []) as string[]
    return new Set(ids)
  })
}

export type GiveRoster = {
  members: GiveRecipientMember[]
  linkedChildIds: Set<string>
}

/**
 * Household roster + linked-child ids that drive the Kids/Give nav tab and the
 * History give filter. Throws on any failure (after retrying auth-lock
 * contention, the documented mobile transient — see authLockError.ts) instead
 * of resolving to an empty roster: a transient error must never read as "this
 * family has no kids", because that collapses the bottom-nav tab set.
 */
export async function fetchGiveRoster(): Promise<GiveRoster> {
  const [members, linkedChildIds] = await Promise.all([
    withAuthLockRetry(async () => {
      const { data, error } = await supabase
        .from('family_members')
        .select('id, name, role')
      if (error) throw new Error(error.message)
      return (data ?? []) as GiveRecipientMember[]
    }),
    fetchLinkedChildMemberIds(),
  ])
  return { members, linkedChildIds }
}

export async function giveMoney(args: GiveMoneyArgs): Promise<string> {
  const { data, error } = await supabase.rpc('give_money', {
    p_to_member_id: args.toMemberId,
    p_amount: args.amount,
    p_note: args.note ?? undefined,
  })
  if (error) {
    if (isMissingDbFunctionError(error.message)) {
      throw new Error(
        'Give is temporarily unavailable while the server finishes updating. Try again in a few minutes.',
      )
    }
    throw new Error(humaniseGiveError(error.message))
  }
  return requireTransactionId(data)
}

export type ReturnFromChildArgs = {
  fromChildId: string
  amount: number
  note?: string | null
}

export async function returnFromChild(
  args: ReturnFromChildArgs,
): Promise<string> {
  const { data, error } = await supabase.rpc('return_from_child', {
    p_from_child_id: args.fromChildId,
    p_amount: args.amount,
    p_note: args.note ?? undefined,
  })
  if (error) {
    if (isMissingDbFunctionError(error.message)) {
      throw new Error(
        'Take is temporarily unavailable while the server finishes updating. Try again in a few minutes.',
      )
    }
    throw new Error(humaniseReturnError(error.message))
  }
  return requireTransactionId(data)
}

function humaniseReturnError(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('insufficient float')) {
    return 'That amount exceeds what the kid has available outside buckets.'
  }
  if (lower.includes('amount must be positive')) {
    return 'Enter an amount greater than $0.'
  }
  if (lower.includes('settle through the bank')) {
    return 'That kid has a linked account — settle through the bank instead.'
  }
  if (lower.includes('only adults can return')) {
    return 'Only adults on the shared balance can take money from a kid.'
  }
  if (lower.includes('not authenticated')) {
    return 'Session expired. Please sign in again.'
  }
  return msg
}

function humaniseGiveError(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('insufficient float')) {
    return `Not enough ${FLOAT_LABEL_LOWER} for that amount.`
  }
  if (lower.includes('cannot give to yourself')) {
    return 'Pick someone else in your household.'
  }
  if (lower.includes('amount must be positive')) {
    return 'Enter an amount greater than $0.'
  }
  if (lower.includes('recipient not in your family')) {
    return "That person isn't in your household."
  }
  if (lower.includes('not authenticated')) {
    return 'Session expired. Please sign in again.'
  }
  if (lower.includes('settles at the bank')) {
    return 'Your linked account settles at the bank, not by giving here.'
  }
  if (lower.includes('settle through the bank')) {
    return 'That person has a linked account — settle through the bank instead.'
  }
  return msg
}
