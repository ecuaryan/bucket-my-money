import { describe, expect, it } from 'vitest'
import { tapHintPosition } from '@/components/ui/tapHintPosition'

describe('tapHintPosition', () => {
  const hint = { width: 200, height: 30 }
  const cell = (top: number, left: number) => ({ top, bottom: top + 44, left, width: 80 })

  it('sits centered just above what was tapped', () => {
    expect(tapHintPosition(cell(300, 150), hint, 400, 56)).toEqual({ left: 90, top: 264 })
  })

  it('goes below when above would reach under the app header', () => {
    expect(tapHintPosition(cell(80, 150), hint, 400, 56)).toEqual({ left: 90, top: 130 })
  })

  it('stays on screen at either edge', () => {
    expect(tapHintPosition(cell(300, 0), hint, 400, 56).left).toBe(8)
    expect(tapHintPosition(cell(300, 330), hint, 400, 56).left).toBe(192)
  })
})
