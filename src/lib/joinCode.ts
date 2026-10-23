/**
 * Join-code text helpers. New codes are 8 characters (migration 105); older
 * codes are 6-8. People type, paste, and share them in many shapes, so
 * everything funnels through `normalizeJoinCode` before it is compared or
 * stored, and `formatJoinCode` is display-only.
 */

/** Upper-case and drop everything that is not a letter or digit (dashes, spaces). */
export function normalizeJoinCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Readable grouping for display: `ABCDEFGHJKMN` → `ABCD-EFGH-JKMN`. */
export function formatJoinCode(code: string): string {
  const clean = normalizeJoinCode(code)
  return clean.match(/.{1,4}/g)?.join('-') ?? clean
}
