import type { PlanSection } from '@/lib/planMath'

export interface SectionBox {
  section: PlanSection
  /** Viewport top and height of the section's header row. */
  headerTop: number
  headerHeight: number
  /** Viewport bottom of the whole section (its last row). */
  bottom: number
}

export interface PinnedSection {
  section: PlanSection
  /** How far up (≤ 0, px) the next header has pushed it. */
  offset: number
}

/**
 * Which section's header pins under the table's header (which ends at
 * `pinnedBottom`), and how far it's pushed: the last section whose own header
 * has scrolled under it. The next section's header (after the last section,
 * the table's end) pushes it up px for px as it arrives, until it's gone and
 * the next header sits in its place, so one never jumps to the other.
 */
export function pinnedSectionAt(sections: readonly SectionBox[], pinnedBottom: number): PinnedSection | null {
  let index = -1
  sections.forEach((box, i) => {
    if (box.headerTop < pinnedBottom - 0.5) index = i
  })
  if (index < 0) return null
  const box = sections[index]
  const pusher = index + 1 < sections.length ? sections[index + 1].headerTop : box.bottom
  const offset = Math.min(0, pusher - (pinnedBottom + box.headerHeight))
  if (offset <= -box.headerHeight) return null
  return { section: box.section, offset }
}
