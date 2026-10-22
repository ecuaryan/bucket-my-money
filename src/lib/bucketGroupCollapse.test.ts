import { describe, expect, it } from 'vitest'
import { planCollapseAll } from '@/lib/bucketGroupCollapse'

describe('planCollapseAll', () => {
  it('collapses everything while anything is expanded, animating only what changes', () => {
    const plan = planCollapseAll(['a', 'b', 'c'], new Set(['b']))
    expect(plan?.action).toBe('collapse')
    expect(plan?.animateKeys).toEqual(['a', 'c'])
    expect([...(plan?.next ?? [])].sort()).toEqual(['a', 'b', 'c'])
  })

  it('expands everything once all are collapsed', () => {
    const plan = planCollapseAll(['a', 'b'], new Set(['a', 'b']))
    expect(plan?.action).toBe('expand')
    expect(plan?.animateKeys).toEqual(['a', 'b'])
    expect(plan?.next.size).toBe(0)
  })

  it('leaves saved state for groups that are not on screen alone', () => {
    const stale = planCollapseAll(['a'], new Set(['a', 'gone']))
    expect(stale?.action).toBe('expand')
    expect([...(stale?.next ?? [])]).toEqual(['gone'])

    const collapse = planCollapseAll(['a'], new Set(['gone']))
    expect([...(collapse?.next ?? [])].sort()).toEqual(['a', 'gone'])
  })

  it('does nothing without sections', () => {
    expect(planCollapseAll([], new Set(['a']))).toBeNull()
  })
})
