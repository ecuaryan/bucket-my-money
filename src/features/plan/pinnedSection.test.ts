import { describe, expect, it } from 'vitest'
import { pinnedSectionAt, type SectionBox } from './pinnedSection'

// Four sections, 46px headers, 10px apart, laid out from `top` down (the page
// scrolls by moving `top`).
const heights = { income: 90, withheld: 400, bills: 300, buckets: 500 }
function layout(top: number): SectionBox[] {
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

  it('pins the section being read, even a short one, all the way through', () => {
    expect(pinnedSectionAt(layout(140), pinnedBottom)).toEqual({ section: 'income', offset: 0 })
    // Income's only row is nearly gone: still pinned, not yet pushed.
    expect(pinnedSectionAt(layout(100), pinnedBottom)).toEqual({ section: 'income', offset: 0 })
    expect(pinnedSectionAt(layout(-100), pinnedBottom)).toEqual({ section: 'withheld', offset: 0 })
  })

  it('is pushed up px for px by the next header, then the next header takes over', () => {
    // Withheld's header (at top + 100) arrives 20px into the pinned Income.
    expect(pinnedSectionAt(layout(76), pinnedBottom)).toEqual({ section: 'income', offset: -20 })
    expect(pinnedSectionAt(layout(51), pinnedBottom)).toEqual({ section: 'income', offset: -45 })
    // Right at the table header: nothing pinned, the real one is there.
    expect(pinnedSectionAt(layout(50), pinnedBottom)).toBeNull()
    expect(pinnedSectionAt(layout(49), pinnedBottom)).toEqual({ section: 'withheld', offset: 0 })
  })

  it('the last section is pushed out by the end of the table', () => {
    // Buckets runs from -80 to 420.
    expect(pinnedSectionAt(layout(-900), pinnedBottom)).toEqual({ section: 'buckets', offset: 0 })
    // Its end 6px below the table header: pushed up 40 of its 46px.
    expect(pinnedSectionAt(layout(-1164), pinnedBottom)).toEqual({ section: 'buckets', offset: -40 })
    expect(pinnedSectionAt(layout(-1200), pinnedBottom)).toBeNull()
  })
})
