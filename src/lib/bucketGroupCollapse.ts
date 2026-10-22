/**
 * Which bucket groups are collapsed is a per-device view preference, kept in
 * localStorage (keyed by member) rather than the database — instant, no network
 * round trip, and nothing to sync. Keys are group ids or UNGROUPED_KEY.
 */
const PREFIX = 'bucketmymoney:group-collapsed:'

function storageKey(memberId: string): string {
  return `${PREFIX}${memberId}`
}

export function readCollapsedGroupKeys(memberId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(memberId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((k): k is string => typeof k === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}

export function writeCollapsedGroupKeys(
  memberId: string,
  keys: ReadonlySet<string>,
): void {
  try {
    localStorage.setItem(storageKey(memberId), JSON.stringify([...keys]))
  } catch {
    // Private mode / quota — state just won't persist.
  }
}
