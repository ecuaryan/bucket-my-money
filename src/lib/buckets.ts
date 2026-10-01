import { supabase } from '@/lib/supabase'
import { humaniseBucketWriteError, validateBucketName } from '@/lib/bucketName'
import { BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_BLOCK, FLOAT_LABEL_LOWER } from '@/lib/brand'
import { formatErrorMessage } from '@/lib/errorMessage'

export {
  BUCKET_NAME_MAX_LENGTH,
  humaniseBucketWriteError,
  normalizeBucketName,
  validateBucketName,
  validateBucketNameForList,
} from '@/lib/bucketName'

export type MoveMoneyArgs = {
  fromBucketId: string | null
  toBucketId: string | null
  amount: number
  note?: string | null
}

/**
 * Atomic bucket move via the `move_money` Postgres function. Server
 * enforces auth, family scope, source-bucket balance, and the
 * conservation invariant. Returns the newly inserted transaction id.
 */
export async function moveMoney(args: MoveMoneyArgs): Promise<string> {
  // Cast: the Supabase type generator doesn't model nullability for
  // function args, but the SQL function accepts null for either
  // NULL bucket id (meaning the float pool). Runtime is fine.
  const { data, error } = await supabase.rpc('move_money', {
    p_from_bucket_id: args.fromBucketId,
    p_to_bucket_id: args.toBucketId,
    p_amount: args.amount,
    p_note: args.note ?? undefined,
  } as unknown as {
    p_from_bucket_id: string
    p_to_bucket_id: string
    p_amount: number
    p_note?: string
  })
  if (error) {
    throw new Error(humaniseMoveError(error.message))
  }
  return data as unknown as string
}

/** Rename a bucket. RLS gates it to the owner or an admin. */
export async function renameBucket(
  bucketId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim()
  const invalid = validateBucketName(trimmed)
  if (invalid) throw new Error(invalid)
  const { error } = await supabase
    .from('buckets')
    .update({ name: trimmed })
    .eq('id', bucketId)
  if (error) throw new Error(humaniseBucketWriteError(error))
}

/** Update a bucket's freeform notes. RLS gates it to the owner or an admin. */
export async function updateBucketNotes(
  bucketId: string,
  notes: string | null,
): Promise<void> {
  const trimmed = (notes ?? '').trim()
  const { error } = await supabase
    .from('buckets')
    .update({ notes: trimmed ? trimmed : null })
    .eq('id', bucketId)
  if (error) throw new Error(humaniseBucketWriteError(error))
}

/**
 * Delete a bucket atomically via `delete_bucket` (auto-organize cleanup,
 * optional bucket→Unbucketed reclaim via `move_money`, then bucket row).
 * Funded buckets log a History row before delete; empty buckets do not.
 * Other historical `transactions` referencing this bucket keep their rows;
 * FKs are `on delete set null`.
 */
export async function deleteBucket(bucketId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_bucket', {
    p_bucket_id: bucketId,
  })
  if (error) throw new Error(humaniseDeleteBucketError(error))
}

/** Move a bucket one slot up or down within its family's display order. */
export async function reorderBucket(
  bucketId: string,
  direction: 'up' | 'down',
): Promise<void> {
  const { error } = await supabase.rpc('reorder_bucket', {
    p_bucket_id: bucketId,
    p_direction: direction,
  })
  if (error) throw new Error(error.message)
}

/** Set full bucket display order (top to bottom). Used by drag reorder. */
export async function reorderBuckets(
  orderedBucketIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('reorder_buckets', {
    p_ordered_bucket_ids: orderedBucketIds,
  })
  if (error) throw new Error(error.message)
}

// The Postgres function raises with codes + English messages. Map a
// few of the common ones to friendlier strings; pass the rest through.
function humaniseMoveError(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('insufficient funds')) {
    return "Not enough in the source bucket for that amount."
  }
  if (lower.includes('source and destination must differ')) {
    return 'Pick a different source and destination.'
  }
  if (lower.includes('amount must be positive')) {
    return 'Enter an amount greater than $0.'
  }
  if (lower.includes('children can only move from their own buckets')) {
    return 'You can only move money from your own buckets.'
  }
  if (lower.includes('children can only move to their own buckets')) {
    return 'You can only move money to your own buckets.'
  }
  if (lower.includes('insufficient float balance')) {
    return `Not enough ${FLOAT_LABEL_LOWER} for that amount.`
  }
  if (lower.includes('not in your family')) {
    return "That bucket isn't in your household."
  }
  if (lower.includes('not authenticated')) {
    return 'Session expired. Please sign in again.'
  }
  return msg
}

function humaniseDeleteBucketError(error: unknown): string {
  const msg = formatErrorMessage(error).toLowerCase()
  if (
    msg.includes('auto_organize_lines') ||
    msg.includes('auto_organize_lines_bucket_id_fkey')
  ) {
    return BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_BLOCK
  }
  return formatErrorMessage(error, 'Could not delete bucket.')
}
