import { describe, expect, it } from 'vitest'
import { pinnedSectionAt, type SectionBox } from './pinnedSection'

// Four sections, 46px headers, laid out from `top` down (page scrolled by moving `top`).
function layout(top: number): SectionBox[] {
  const heights = { income: 200, withheld: 400, bills: 300, buckets: 500 }
  let y = top
  return (Object.keys(heights) as (keyof typeof heights)[]).map((section) => {
    const box = { section, headerTop: y, headerHeight: 46, bottom: y + heights[section] }
    y += heights[section] + 10
    return box
  })
}

describe('pinnedSectionAt', () => {
  const pinnedBottom = 150

  it('pins nothing until a header scrolls under the table header', () => {
    expect(pinnedSectionAt(layout(160), pinnedBottom)).toBeNull()
    expect(pinnedSectionAt(layout(150), pinnedBottom)).toBeNull()
  })

  it('pins the section being read', () => {
    expect(pinnedSectionAt(layout(100), pinnedBottom)).toBe('income')
    expect(pinnedSectionAt(layout(-100), pinnedBottom)).toBe('withheld')
    expect(pinnedSectionAt(layout(-700), pinnedBottom)).toBe('bills')
  })

  it('lets go as a section runs out, so the next header comes up in its own place', () => {
    // Income ends 40px below the pinned header: less than a header's height left.
    expect(pinnedSectionAt(layout(-10), pinnedBottom)).toBeNull()
  })
})
