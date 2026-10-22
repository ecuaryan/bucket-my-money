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

export type CollapseAllPlan = {
  /** What the control does right now: collapse everything, or expand everything. */
  action: 'collapse' | 'expand'
  /** Sections whose rows will animate (the ones that actually change state). */
  animateKeys: string[]
  /** The new full collapsed set (keys of groups no longer shown are left alone). */
  next: Set<string>
}

/**
 * "Collapse all" while anything is expanded; once everything is collapsed the
 * same control becomes "Expand all". `sectionKeys` are the sections currently
 * on screen.
 */
export function planCollapseAll(
  sectionKeys: readonly string[],
  collapsed: ReadonlySet<string>,
): CollapseAllPlan | null {
  if (sectionKeys.length === 0) return null
  const expanded = sectionKeys.filter((k) => !collapsed.has(k))
  if (expanded.length > 0) {
    return {
      action: 'collapse',
      animateKeys: expanded,
      next: new Set([...collapsed, ...sectionKeys]),
    }
  }
  const shown = new Set(sectionKeys)
  return {
    action: 'expand',
    animateKeys: [...sectionKeys],
    next: new Set([...collapsed].filter((k) => !shown.has(k))),
  }
}
