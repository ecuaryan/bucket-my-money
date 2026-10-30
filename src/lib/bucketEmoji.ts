/**
 * Bucket names carry their emoji as plain text ("🏠 Rent"). The list shows a
 * leading emoji in its own tile; this only changes how a name is displayed —
 * the stored name is never altered.
 */

// A leading emoji: pictographic (with optional skin tone / VS16 / ZWJ joins),
// a flag (two regional indicators), or a keycap like "1️⃣".
const MODIFIER = '(?:\\uFE0F|\\p{Emoji_Modifier})?'
const PICTOGRAPH = `\\p{Extended_Pictographic}${MODIFIER}`
const LEADING_EMOJI = new RegExp(
  `^(${PICTOGRAPH}(?:\\u200D${PICTOGRAPH})*|\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3)\\s*`,
  'u',
)

export type SplitBucketName = {
  /** The leading emoji, or null when the name does not start with one. */
  emoji: string | null
  /** The name without the leading emoji. */
  label: string
}

export function splitBucketEmoji(name: string): SplitBucketName {
  const trimmed = name.trim()
  const match = LEADING_EMOJI.exec(trimmed)
  if (!match) return { emoji: null, label: name }
  const label = trimmed.slice(match[0].length).trim()
  // A name that is only an emoji keeps it as the label so the row is never blank.
  if (!label) return { emoji: null, label: name }
  return { emoji: match[1], label }
}
