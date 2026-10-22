import { describe, expect, it } from 'vitest'
import {
  AUTO_SCROLL_MAX_SPEED_PX,
  ROW_LONG_PRESS_MS,
  ROW_PRESS_CANCEL_MOVE_PX,
  ROW_TAP_MOVE_MAX_PX,
  autoScrollSpeed,
  blockIndexAt,
  blockShiftY,
  clampClientY,
  clampPointerYForRowDrag,
  closestRowCenterIndex,
  manualSortableShiftY,
  reorderedIdsForDrag,
  rowCenterOffsets,
  rowDragCenterY,
  rowDragOverlayTop,
  resolveRowHandlers,
  shouldCancelRowPress,
  shouldOpenMoveMoneyOnRelease,
} from '@/features/buckets/rowLongPressReorder'

describe('resolveRowHandlers', () => {
  // Regression: with a single bucket (or while another row is renaming) reorder
  // is disabled, so the drag handlers aren't attached. The row must still get a
  // click handler that opens Move money — otherwise tapping a lone bucket does
  // nothing and only the keyboard can open the dialog.
  it('returns a tap-to-open click handler when reorder is disabled', () => {
    const moved: string[] = []
    const handlers = resolveRowHandlers({
      dragEnabled: false,
      bucketId: 'b1',
      dragHandlers: { onPointerDown: () => {} },
      onMoveMoney: (id) => moved.push(id),
    })

    expect(typeof handlers.onClick).toBe('function')
    ;(handlers.onClick as () => void)()
    expect(moved).toEqual(['b1'])
  })

  it('does not borrow the drag handlers when reorder is disabled', () => {
    const handlers = resolveRowHandlers({
      dragEnabled: false,
      bucketId: 'b1',
      dragHandlers: { onPointerDown: () => {} },
      onMoveMoney: () => {},
    })

    expect(handlers.onPointerDown).toBeUndefined()
  })

  it('passes the drag handlers through unchanged when reorder is enabled', () => {
    const dragHandlers = { onPointerDown: () => {}, onPointerUp: () => {} }
    const handlers = resolveRowHandlers({
      dragEnabled: true,
      bucketId: 'b1',
      dragHandlers,
      onMoveMoney: () => {},
    })

    expect(handlers).toBe(dragHandlers)
    expect(handlers.onClick).toBeUndefined()
  })
})

describe('shouldCancelRowPress', () => {
  it('cancels when movement exceeds cancel threshold', () => {
    expect(
      shouldCancelRowPress({ x: 0, y: 0 }, { x: ROW_PRESS_CANCEL_MOVE_PX, y: 0 }),
    ).toBe(true)
  })

  it('allows small jitter while holding', () => {
    expect(
      shouldCancelRowPress({ x: 0, y: 0 }, { x: ROW_PRESS_CANCEL_MOVE_PX - 1, y: 0 }),
    ).toBe(false)
  })
})

describe('shouldOpenMoveMoneyOnRelease', () => {
  it('opens move money on short tap', () => {
    expect(
      shouldOpenMoveMoneyOnRelease({
        durationMs: 200,
        start: { x: 10, y: 10 },
        end: { x: 12, y: 11 },
        dragArmed: false,
        dragCommitted: false,
      }),
    ).toBe(true)
  })

  it('does not open after long press or drag', () => {
    expect(
      shouldOpenMoveMoneyOnRelease({
        durationMs: ROW_LONG_PRESS_MS,
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        dragArmed: false,
        dragCommitted: false,
      }),
    ).toBe(false)
    expect(
      shouldOpenMoveMoneyOnRelease({
        durationMs: 100,
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        dragArmed: true,
        dragCommitted: false,
      }),
    ).toBe(false)
  })

  it('does not open when finger moved too far', () => {
    expect(
      shouldOpenMoveMoneyOnRelease({
        durationMs: 100,
        start: { x: 0, y: 0 },
        end: { x: ROW_TAP_MOVE_MAX_PX, y: 0 },
        dragArmed: false,
        dragCommitted: false,
      }),
    ).toBe(false)
  })
})

describe('rowDragCenterY', () => {
  it('uses the floating row center, not the pointer or bottom edge', () => {
    expect(
      rowDragCenterY({ clientY: 120, grabOffsetY: 20, rowHeight: 40 }),
    ).toBe(120)
  })
})

describe('rowDragOverlayTop', () => {
  it('anchors the ghost where the finger originally pressed', () => {
    expect(rowDragOverlayTop({ clientY: 120, grabOffsetY: 20 })).toBe(100)
  })
})

describe('clampPointerYForRowDrag', () => {
  const bounds = { top: 100, bottom: 300 }

  it('keeps the full row ghost inside the list', () => {
    expect(clampPointerYForRowDrag(90, 10, 50, bounds)).toBe(110)
    expect(clampPointerYForRowDrag(310, 10, 50, bounds)).toBe(260)
  })
})

describe('rowCenterOffsets', () => {
  it('returns row centers relative to the list top', () => {
    const rects = [
      { top: 100, bottom: 150 },
      { top: 150, bottom: 200 },
      { top: 200, bottom: 250 },
    ]
    expect(rowCenterOffsets(rects, 100)).toEqual([25, 75, 125])
  })
})

describe('closestRowCenterIndex', () => {
  const centers = [25, 75, 125]

  it('picks the row whose resting center is nearest', () => {
    expect(closestRowCenterIndex(centers, 10)).toBe(0)
    expect(closestRowCenterIndex(centers, 60)).toBe(1)
    expect(closestRowCenterIndex(centers, 95)).toBe(1)
    expect(closestRowCenterIndex(centers, 120)).toBe(2)
  })

  it('returns -1 for empty list', () => {
    expect(closestRowCenterIndex([], 50)).toBe(-1)
  })
})

describe('manualSortableShiftY', () => {
  const rowHeight = 50

  it('moves the active row to the drop slot when dragging down', () => {
    expect(manualSortableShiftY(0, 0, 2, rowHeight)).toBe(100)
    expect(manualSortableShiftY(1, 0, 2, rowHeight)).toBe(-50)
    expect(manualSortableShiftY(2, 0, 2, rowHeight)).toBe(-50)
    expect(manualSortableShiftY(3, 0, 2, rowHeight)).toBe(0)
  })

  it('moves the active row to the drop slot when dragging up', () => {
    expect(manualSortableShiftY(0, 3, 1, rowHeight)).toBe(0)
    expect(manualSortableShiftY(1, 3, 1, rowHeight)).toBe(50)
    expect(manualSortableShiftY(2, 3, 1, rowHeight)).toBe(50)
    expect(manualSortableShiftY(3, 3, 1, rowHeight)).toBe(-100)
  })

  it('produces the post-move layout order (active row lands on its slot)', () => {
    // Drag index 0 → 2: rows 1,2 slide up, row 0 lands at slot 2 → order 1,2,0,3.
    const finalTop = [0, 1, 2, 3].map(
      (i) => i * rowHeight + manualSortableShiftY(i, 0, 2, rowHeight),
    )
    expect(finalTop).toEqual([100, 0, 50, 150])
  })

  it('no shift when active equals over', () => {
    expect(manualSortableShiftY(1, 1, 1, rowHeight)).toBe(0)
    expect(manualSortableShiftY(0, 1, 1, rowHeight)).toBe(0)
  })
})

describe('reorderedIdsForDrag', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('moves a row down to the drop index', () => {
    expect(reorderedIdsForDrag(ids, 'a', 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves a row up to the drop index', () => {
    expect(reorderedIdsForDrag(ids, 'd', 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('returns null when nothing moves or input is invalid', () => {
    expect(reorderedIdsForDrag(ids, 'a', 0)).toBeNull()
    expect(reorderedIdsForDrag(ids, 'missing', 1)).toBeNull()
    expect(reorderedIdsForDrag(ids, 'a', -1)).toBeNull()
    expect(reorderedIdsForDrag(ids, 'a', 99)).toBeNull()
  })

  it('commit order matches the visual shift target (down)', () => {
    // Visual: dragging index 0 → 2 lands the row on slot 2 (order b,c,a,d).
    const overIndex = 2
    const visualOrder = [0, 1, 2, 3]
      .map((i) => ({ i, top: i * 50 + manualSortableShiftY(i, 0, overIndex, 50) }))
      .sort((x, y) => x.top - y.top)
      .map(({ i }) => ids[i])
    expect(reorderedIdsForDrag(ids, 'a', overIndex)).toEqual(visualOrder)
  })
})

describe('row drag hit-testing uses the ghost center, not raw finger Y', () => {
  // Resting centers for three 50px rows from list top.
  const centers = [25, 75, 125]

  it('targets by ghost center so a low grab point does not skip a row', () => {
    // Finger near the bottom of a 50px row; ghost center sits 15px higher.
    const drag = { clientY: 101, grabOffsetY: 40, rowHeight: 50 }
    expect(rowDragCenterY(drag)).toBe(86)
    expect(closestRowCenterIndex(centers, rowDragCenterY(drag))).toBe(1)
    // Raw finger Y would have landed on row 2.
    expect(closestRowCenterIndex(centers, drag.clientY)).toBe(2)
  })
})

describe('autoScrollSpeed', () => {
  const vh = 800
  const edge = 72

  it('does not scroll in the middle dead zone', () => {
    expect(autoScrollSpeed(400, vh, edge)).toBe(0)
    expect(autoScrollSpeed(edge, vh, edge)).toBe(0)
    expect(autoScrollSpeed(vh - edge, vh, edge)).toBe(0)
  })

  it('scrolls up near the top and down near the bottom', () => {
    expect(autoScrollSpeed(10, vh, edge)).toBeLessThan(0)
    expect(autoScrollSpeed(vh - 10, vh, edge)).toBeGreaterThan(0)
  })

  it('ramps to max speed at the very edge', () => {
    expect(autoScrollSpeed(0, vh, edge)).toBe(-AUTO_SCROLL_MAX_SPEED_PX)
    expect(autoScrollSpeed(vh, vh, edge)).toBe(AUTO_SCROLL_MAX_SPEED_PX)
  })
})

describe('clampClientY', () => {
  const bounds = { top: 100, bottom: 200 }

  it('clamps above and below the list', () => {
    expect(clampClientY(50, bounds)).toBe(100)
    expect(clampClientY(250, bounds)).toBe(200)
    expect(clampClientY(150, bounds)).toBe(150)
  })
})


describe('group block drag math', () => {
  // Blocks at 0, 100, 150 with extents 100, 50, 80.
  const tops = [0, 100, 150]
  const extents = [100, 50, 80]

  it('finds the block under a y and clamps to the ends', () => {
    expect(blockIndexAt(tops, extents, 10)).toBe(0)
    expect(blockIndexAt(tops, extents, 120)).toBe(1)
    expect(blockIndexAt(tops, extents, 999)).toBe(2)
    expect(blockIndexAt([], [], 5)).toBe(-1)
  })

  it('moves the dragged block by the extents it passes', () => {
    expect(blockShiftY(0, 0, 2, extents)).toBe(130)
    expect(blockShiftY(1, 0, 2, extents)).toBe(-100)
    expect(blockShiftY(2, 0, 2, extents)).toBe(-100)
    expect(blockShiftY(2, 2, 0, extents)).toBe(-150)
    expect(blockShiftY(0, 2, 0, extents)).toBe(80)
    expect(blockShiftY(1, 2, 0, extents)).toBe(80)
  })

  it('is a no-op when dropped on its own slot', () => {
    expect(blockShiftY(1, 1, 1, extents)).toBe(0)
  })
})
