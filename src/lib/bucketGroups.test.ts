import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import {
  UNGROUPED_KEY,
  applyLayoutOrder,
  buildSections,
  headerIdForKey,
  isHiddenSection,
  layoutFromVisibleOrder,
  moveSection,
  orderFromSections,
  sectionTotal,
  visibleRowIds,
  type BucketGroupLayout,
} from '@/lib/bucketGroups'

type Bucket = Database['public']['Tables']['buckets']['Row']

const bucket = (id: string, amount = 0): Bucket =>
  ({ id, name: id, allocated_amount: amount }) as unknown as Bucket

const buckets = [bucket('a', 10), bucket('b', 20), bucket('c', 5.5)]

const layout: BucketGroupLayout = {
  groups: [
    { id: 'g1', name: 'Cruise', isUngrouped: false, displayOrder: 1 },
    { id: 'g2', name: null, isUngrouped: false, displayOrder: 2 },
    { id: 'u', name: null, isUngrouped: true, displayOrder: 3 },
  ],
  bucketGroupIds: { a: 'g1', b: 'g2', c: null },
}

describe('buildSections', () => {
  it('is a single ungrouped section without real groups', () => {
    const sections = buildSections(buckets, { groups: [], bucketGroupIds: {} })
    expect(sections).toHaveLength(1)
    expect(sections[0].key).toBe(UNGROUPED_KEY)
    expect(sections[0].buckets.map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('orders groups, with Ungrouped at its stored position', () => {
    const sections = buildSections(buckets, layout)
    expect(sections.map((s) => s.key)).toEqual(['g1', 'g2', UNGROUPED_KEY])
    expect(sections.map((s) => s.buckets.map((b) => b.id))).toEqual([['a'], ['b'], ['c']])
  })

  it('defaults Ungrouped to the bottom when it has no row', () => {
    const noRow = { ...layout, groups: layout.groups.filter((g) => !g.isUngrouped) }
    expect(buildSections(buckets, noRow).at(-1)?.key).toBe(UNGROUPED_KEY)
  })

  it('treats buckets with an unknown group as ungrouped and sums totals', () => {
    const sections = buildSections(buckets, {
      ...layout,
      bucketGroupIds: { a: 'gone', b: 'g1', c: 'g1' },
    })
    expect(sections[0].buckets.map((b) => b.id)).toEqual(['b', 'c'])
    expect(sectionTotal(sections[0])).toBeCloseTo(25.5)
    expect(sections[2].buckets.map((b) => b.id)).toEqual(['a'])
  })
})

describe('visible rows and drag results', () => {
  const sections = buildSections(buckets, layout, new Set(['g2']))

  it('hides buckets of collapsed sections', () => {
    expect(visibleRowIds(sections, true)).toEqual([
      'group:g1', 'a', 'group:g2', 'group:ungrouped', 'c',
    ])
  })

  it('moves a bucket into another group by position', () => {
    const { order } = layoutFromVisibleOrder(sections, [
      'group:g1', 'group:g2', 'group:ungrouped', 'a', 'c',
    ])
    expect(order).toEqual([
      { key: 'g1', bucketIds: [] },
      { key: 'g2', bucketIds: ['b'] },
      { key: UNGROUPED_KEY, bucketIds: ['a', 'c'] },
    ])
  })

  it('expands a collapsed group that receives a bucket and keeps hidden ones', () => {
    const { order, expandKeys } = layoutFromVisibleOrder(sections, [
      'group:g1', 'group:g2', 'a', 'group:ungrouped', 'c',
    ])
    expect(expandKeys).toEqual(['g2'])
    expect(order[1]).toEqual({ key: 'g2', bucketIds: ['a', 'b'] })
  })

  it('puts a bucket dropped above every header into the first section', () => {
    const { order } = layoutFromVisibleOrder(sections, [
      'c', 'group:g1', 'a', 'group:g2', 'group:ungrouped',
    ])
    expect(order[0]).toEqual({ key: 'g1', bucketIds: ['c', 'a'] })
  })

  it('reorders sections and applies the layout optimistically', () => {
    const next = moveSection(orderFromSections(sections), 'g1', 'down')
    expect(next.map((o) => o.key)).toEqual(['g2', 'g1', UNGROUPED_KEY])
    expect(moveSection(next, 'g2', 'up')).toBe(next)

    const applied = applyLayoutOrder(buckets, layout, next)
    expect(applied.buckets.map((b) => b.id)).toEqual(['b', 'a', 'c'])
    expect(applied.layout.groups.find((g) => g.id === 'g1')?.displayOrder).toBe(2)
    expect(headerIdForKey('g1')).toBe('group:g1')
  })
})

describe('empty Ungrouped', () => {
  const allGrouped: BucketGroupLayout = {
    ...layout,
    bucketGroupIds: { a: 'g1', b: 'g2', c: 'g1' },
  }
  const sections = buildSections(buckets, allGrouped)

  it('is hidden only once groups exist and it has no buckets', () => {
    const ungrouped = sections.find((s) => s.isUngrouped)!
    expect(isHiddenSection(ungrouped, true)).toBe(true)
    expect(isHiddenSection(ungrouped, false)).toBe(false)
    expect(isHiddenSection(sections[0], true)).toBe(false)
  })

  it('keeps its slot in the saved order when it is not on screen', () => {
    const visible = sections.filter((s) => !s.isUngrouped)
    const { order } = layoutFromVisibleOrder(sections, visibleRowIds(visible, true))
    expect(order.map((o) => o.key)).toEqual(['g1', 'g2', UNGROUPED_KEY])

    // Ungrouped stored first stays first.
    const first = buildSections(buckets, {
      ...allGrouped,
      groups: allGrouped.groups.map((g) =>
        g.isUngrouped ? { ...g, displayOrder: 0 } : g,
      ),
    })
    const shown = first.filter((s) => !s.isUngrouped)
    expect(
      layoutFromVisibleOrder(first, visibleRowIds(shown, true)).order.map((o) => o.key),
    ).toEqual([UNGROUPED_KEY, 'g1', 'g2'])
  })

  it('drops a bucket above every header into the first visible group', () => {
    const visible = sections.filter((s) => !s.isUngrouped)
    const ids = visibleRowIds(visible, true)
    const { order } = layoutFromVisibleOrder(sections, ['c', ...ids.filter((i) => i !== 'c')])
    expect(order.find((o) => o.key === 'g1')?.bucketIds).toContain('c')
  })
})
