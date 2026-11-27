import type { PlanSection } from '@/lib/planMath'

export interface SectionBox {
  section: PlanSection
  /** Viewport top and height of the section's header row. */
  headerTop: number
  headerHeight: number
  /** Viewport bottom of the whole section (its last row). */
  bottom: number
}

/**
 * Which section's header pins under the table's header, given where the
 * pinned header ends (`pinnedBottom`): the last section whose own header has
 * scrolled under it, while more than a header's height of that section is
 * still showing. As a section runs out, its pinned copy goes and the next
 * header, coming up in its own place, takes over; never two at once.
 */
export function pinnedSectionAt(sections: readonly SectionBox[], pinnedBottom: number): PlanSection | null {
  let pick: SectionBox | null = null
  for (const box of sections) {
    if (box.headerTop < pinnedBottom - 0.5) pick = box
  }
  if (!pick || pick.bottom <= pinnedBottom + pick.headerHeight) return null
  return pick.section
}
