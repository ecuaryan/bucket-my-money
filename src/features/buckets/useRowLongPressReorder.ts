/** Row long-press reorder: pointer handlers + manual drag session (grip uses dnd-kit). */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import {
  blurFocusedReorderGrip,
  clearReorderTouchLock,
  setReorderTouchLock,
} from '@/features/buckets/bucketReorderTouchLock'
import { isHeaderId } from '@/lib/bucketGroups'
import {
  ROW_LONG_PRESS_MS,
  autoScrollSpeed,
  blockIndexAt,
  clampPointerYForRowDrag,
  closestRowCenterIndex,
  reorderedIdsForDrag,
  rowCenterOffsets,
  rowDragCenterY,
  rowDragOverlayTop,
  shouldCancelRowPress,
  shouldOpenMoveMoneyOnRelease,
  type ListBounds,
  type PressPoint,
} from '@/features/buckets/rowLongPressReorder'

type ManualDrag = {
  bucketId: string
  pointerId: number
  clientY: number
  grabOffsetY: number
  rowHeight: number
  listBounds: ListBounds
  overIndex: number
  /** Group drags only: per-group-block extents (see blockShiftY). */
  blockExtents?: number[]
}

type PressState = {
  bucketId: string
  pointerId: number
  start: PressPoint
  startTime: number
  isTouch: boolean
  rowEl: HTMLElement | null
}

function getListBounds(listEl: HTMLUListElement | null): ListBounds | null {
  if (!listEl) return null
  const rect = listEl.getBoundingClientRect()
  return {
    left: rect.left,
    width: rect.width,
    top: rect.top,
    bottom: rect.bottom,
  }
}

function getSourceRowMetrics(
  listEl: HTMLUListElement | null,
  bucketId: string,
  pressY: number,
): { grabOffsetY: number; rowHeight: number } | null {
  const li = listEl?.querySelector(`:scope > li[data-flip-id="${bucketId}"]`)
  if (!(li instanceof HTMLElement)) return null
  const rect = li.getBoundingClientRect()
  return {
    grabOffsetY: pressY - rect.top,
    rowHeight: rect.height,
  }
}

function getRowRects(
  listEl: HTMLUListElement | null,
): Array<{ top: number; bottom: number }> {
  if (!listEl) return []
  const items = listEl.querySelectorAll(':scope > li[data-flip-id]')
  return Array.from(items).map((li) => {
    const rect = li.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  })
}

type BlockSnapshot = {
  ids: string[]
  /** Block tops relative to the list top. */
  tops: number[]
  extents: number[]
}

/**
 * Group blocks (a header plus the rows under it) as they rest, measured when a
 * group drag arms. Hit-testing and displacement use this snapshot, not live rects.
 */
function getBlockSnapshot(listEl: HTMLUListElement | null): BlockSnapshot | null {
  if (!listEl) return null
  const listTop = listEl.getBoundingClientRect().top
  const ids: string[] = []
  const tops: number[] = []
  let lastBottom = 0
  for (const li of Array.from(listEl.querySelectorAll(':scope > li'))) {
    const rect = li.getBoundingClientRect()
    if (li.hasAttribute('data-group-header')) {
      ids.push(li.getAttribute('data-flip-id') ?? '')
      tops.push(rect.top - listTop)
    }
    lastBottom = rect.bottom - listTop
  }
  if (ids.length === 0) return null
  const extents = tops.map((top, i) => (tops[i + 1] ?? lastBottom) - top)
  return { ids, tops, extents }
}

function capturePointer(node: EventTarget, pointerId: number) {
  if (!(node instanceof Element)) return
  try {
    node.setPointerCapture(pointerId)
  } catch {
    // Unsupported for this pointer type.
  }
}

function releasePointer(node: EventTarget | null, pointerId: number) {
  if (!(node instanceof Element)) return
  try {
    if (node.hasPointerCapture(pointerId)) {
      node.releasePointerCapture(pointerId)
    }
  } catch {
    // Pointer may already be released.
  }
}

type TouchTracking = {
  onMove: (clientY: number, clientX: number, e: TouchEvent) => void
  onEnd: (clientY: number, clientX: number) => void
}

function attachDocumentTouchTracking(handlers: TouchTracking): () => void {
  function onTouchMove(e: TouchEvent) {
    const touch = e.touches[0]
    if (!touch) return
    handlers.onMove(touch.clientY, touch.clientX, e)
  }

  function onTouchEnd(e: TouchEvent) {
    const touch = e.changedTouches[0]
    if (!touch) return
    handlers.onEnd(touch.clientY, touch.clientX)
  }

  // Non-passive so an armed drag can preventDefault to take over from scroll.
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
  document.addEventListener('touchend', onTouchEnd, { capture: true })
  document.addEventListener('touchcancel', onTouchEnd, { capture: true })

  return () => {
    document.removeEventListener('touchmove', onTouchMove, { capture: true })
    document.removeEventListener('touchend', onTouchEnd, { capture: true })
    document.removeEventListener('touchcancel', onTouchEnd, { capture: true })
  }
}

type Args = {
  listRef: RefObject<HTMLUListElement | null>
  /** Ids of the rows currently in the DOM, top to bottom (buckets and group headers). */
  bucketIds: string[]
  /** A short tap on a row (bucket → Move money, group header → toggle). */
  onMoveMoney: (id: string) => void
  /** A finished drag: the new row order, the dragged row, and the row it landed on. */
  onDragReorder: (orderedIds: string[], dragId: string, overId: string) => void
  /** Called when a drag arms/ends so the parent can reshape the list (e.g. collapse groups). */
  onDragArmed?: (dragId: string) => void
  onDragEnded?: () => void
  notifyDragStarted: () => void
  disabled?: boolean
}

export function useRowLongPressReorder({
  listRef,
  bucketIds,
  onMoveMoney,
  onDragReorder,
  onDragArmed,
  onDragEnded,
  notifyDragStarted,
  disabled = false,
}: Args) {
  const [pendingBucketId, setPendingBucketId] = useState<string | null>(null)
  const [manualDrag, setManualDrag] = useState<ManualDrag | null>(null)

  const pressRef = useRef<PressState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragArmedRef = useRef(false)
  const manualDragRef = useRef<ManualDrag | null>(null)
  const touchDetachRef = useRef<(() => void) | null>(null)
  const releaseHandledRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastClientYRef = useRef(0)
  // Resting row centers (offsets from list top), snapshotted when the drag arms.
  const rowCentersRef = useRef<number[]>([])
  // Set while a whole group is being dragged (instead of rowCentersRef).
  const blockRef = useRef<BlockSnapshot | null>(null)

  useEffect(() => {
    manualDragRef.current = manualDrag
  }, [manualDrag])

  // Latest props for release handlers, which can outlive the render that bound them
  // (the parent may reshape the row list mid-drag).
  const latestRef = useRef({ bucketIds, onDragReorder, onMoveMoney, onDragArmed, onDragEnded })
  useEffect(() => {
    latestRef.current = { bucketIds, onDragReorder, onMoveMoney, onDragArmed, onDragEnded }
  })

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const detachTouchTracking = useCallback(() => {
    touchDetachRef.current?.()
    touchDetachRef.current = null
  }, [])

  const stopAutoScroll = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const resetPress = useCallback(() => {
    clearTimer()
    detachTouchTracking()
    pressRef.current = null
    dragArmedRef.current = false
    setPendingBucketId(null)
  }, [clearTimer, detachTouchTracking])

  const updateManualDragPosition = useCallback(
    (clientY: number) => {
      lastClientYRef.current = clientY
      setManualDrag((prev) => {
        if (!prev) return prev
        // Recompute bounds each move so clamping stays correct while the page scrolls.
        const bounds = getListBounds(listRef.current) ?? prev.listBounds
        const nextY = clampPointerYForRowDrag(
          clientY,
          prev.grabOffsetY,
          prev.rowHeight,
          bounds,
        )
        // Hit-test the ghost center against the resting snapshot (not live rects).
        const block = blockRef.current
        if (block) {
          // Group drag: the slot is whichever group block the pointer is over.
          const overIndex = blockIndexAt(block.tops, block.extents, nextY - bounds.top)
          return { ...prev, clientY: nextY, listBounds: bounds, overIndex }
        }
        const centerOffset =
          rowDragCenterY({
            clientY: nextY,
            grabOffsetY: prev.grabOffsetY,
            rowHeight: prev.rowHeight,
          }) - bounds.top
        const overIndex = closestRowCenterIndex(
          rowCentersRef.current,
          centerOffset,
        )
        return { ...prev, clientY: nextY, listBounds: bounds, overIndex }
      })
    },
    [listRef],
  )

  const commitManualDrag = useCallback(() => {
    const drag = manualDragRef.current
    if (!drag) return

    const { onDragReorder: commit } = latestRef.current
    const ids = blockRef.current?.ids ?? latestRef.current.bucketIds
    const next = reorderedIdsForDrag(ids, drag.bucketId, drag.overIndex)
    if (next) commit(next, drag.bucketId, ids[drag.overIndex])
  }, [])

  const endManualDragSession = useCallback(() => {
    commitManualDrag()
    stopAutoScroll()
    setManualDrag(null)
    manualDragRef.current = null
    blockRef.current = null
    resetPress()
    clearReorderTouchLock()
    latestRef.current.onDragEnded?.()
  }, [commitManualDrag, resetPress, stopAutoScroll])

  // Single guarded release path shared by touch and pointer end events.
  const finishRelease = useCallback(
    (end: PressPoint) => {
      if (releaseHandledRef.current) return
      releaseHandledRef.current = true

      if (manualDragRef.current || dragArmedRef.current) {
        endManualDragSession()
        return
      }

      const press = pressRef.current
      if (
        press &&
        shouldOpenMoveMoneyOnRelease({
          durationMs: Date.now() - press.startTime,
          start: press.start,
          end,
          dragArmed: false,
          dragCommitted: false,
        })
      ) {
        latestRef.current.onMoveMoney(press.bucketId)
      }

      const rowEl = press?.rowEl ?? null
      const pointerId = press?.pointerId ?? -1
      resetPress()
      clearReorderTouchLock()
      releasePointer(rowEl, pointerId)
    },
    [endManualDragSession, resetPress],
  )

  const cancelPress = useCallback(() => {
    const rowEl = pressRef.current?.rowEl ?? null
    const pointerId = pressRef.current?.pointerId ?? -1
    resetPress()
    clearReorderTouchLock()
    releasePointer(rowEl, pointerId)
  }, [resetPress])

  const armManualDrag = useCallback(
    (press: PressState) => {
      const listBounds = getListBounds(listRef.current)
      const rowMetrics = getSourceRowMetrics(
        listRef.current,
        press.bucketId,
        press.start.y,
      )
      if (!listBounds || !rowMetrics) {
        cancelPress()
        return
      }

      dragArmedRef.current = true
      notifyDragStarted()
      // Lock scroll only now that the drag is committed — keeps the page
      // scrollable during the pending hold (no touch-start dead zone).
      setReorderTouchLock(true)

      const clientY = clampPointerYForRowDrag(
        press.start.y,
        rowMetrics.grabOffsetY,
        rowMetrics.rowHeight,
        listBounds,
      )
      lastClientYRef.current = clientY
      // Snapshot resting row centers once; reused for all hit-tests this drag.
      const block = isHeaderId(press.bucketId)
        ? getBlockSnapshot(listRef.current)
        : null
      blockRef.current = block
      const centers = rowCenterOffsets(
        getRowRects(listRef.current),
        listBounds.top,
      )
      rowCentersRef.current = centers
      const centerOffset =
        rowDragCenterY({
          clientY,
          grabOffsetY: rowMetrics.grabOffsetY,
          rowHeight: rowMetrics.rowHeight,
        }) - listBounds.top
      const overIndex = block
        ? block.ids.indexOf(press.bucketId)
        : closestRowCenterIndex(centers, centerOffset)
      const next: ManualDrag = {
        bucketId: press.bucketId,
        pointerId: press.pointerId,
        clientY,
        grabOffsetY: rowMetrics.grabOffsetY,
        rowHeight: rowMetrics.rowHeight,
        listBounds,
        overIndex,
        blockExtents: block?.extents,
      }
      manualDragRef.current = next
      setManualDrag(next)
      setPendingBucketId(null)
      latestRef.current.onDragArmed?.(press.bucketId)
    },
    [listRef, notifyDragStarted, cancelPress],
  )

  // Auto-scroll the page while dragging near a viewport edge.
  useEffect(() => {
    if (!manualDrag) return

    function tick() {
      rafRef.current = null
      if (!manualDragRef.current) return
      const speed = autoScrollSpeed(lastClientYRef.current, window.innerHeight)
      if (speed !== 0) {
        window.scrollBy(0, speed)
        updateManualDragPosition(lastClientYRef.current)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [manualDrag, updateManualDragPosition])

  // Mouse/pen drag is driven by document pointer events once armed.
  useEffect(() => {
    if (!manualDrag) return
    const pointerId = manualDrag.pointerId

    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return
      updateManualDragPosition(e.clientY)
    }
    function onEnd(e: PointerEvent) {
      if (e.pointerId !== pointerId) return
      finishRelease({ x: e.clientX, y: e.clientY })
    }

    // Intentionally no pointercancel — Android fires it at native long-press.
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onEnd)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onEnd)
    }
  }, [manualDrag, finishRelease, updateManualDragPosition])

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      touchDetachRef.current?.()
      clearReorderTouchLock()
    },
    [],
  )

  const getRowHandlers = useCallback(
    (bucketId: string, immediate = false) => ({
      onPointerDown: (e: ReactPointerEvent) => {
        if (disabled || e.button !== 0 || pressRef.current) return

        const isTouch = e.pointerType === 'touch'
        // Don't preventDefault on touch — that would block the pending-hold scroll.
        if (!isTouch) e.preventDefault()
        blurFocusedReorderGrip()

        const rowEl =
          e.currentTarget instanceof HTMLElement ? e.currentTarget : null
        const start = { x: e.clientX, y: e.clientY }
        releaseHandledRef.current = false
        pressRef.current = {
          bucketId,
          pointerId: e.pointerId,
          start,
          startTime: Date.now(),
          isTouch,
          rowEl,
        }
        dragArmedRef.current = false
        setPendingBucketId(bucketId)

        if (isTouch) {
          touchDetachRef.current = attachDocumentTouchTracking({
            onMove: (clientY, clientX, ev) => {
              const press = pressRef.current
              if (!press || press.bucketId !== bucketId) return

              if (dragArmedRef.current || manualDragRef.current) {
                ev.preventDefault()
                updateManualDragPosition(clientY)
                return
              }

              // Pending hold: let the page scroll; bail out if it's a scroll gesture.
              if (shouldCancelRowPress(press.start, { x: clientX, y: clientY })) {
                cancelPress()
              }
            },
            onEnd: (clientY, clientX) => {
              finishRelease({ x: clientX, y: clientY })
            },
          })
        } else {
          capturePointer(e.currentTarget, e.pointerId)
        }

        timerRef.current = setTimeout(() => {
          timerRef.current = null
          const press = pressRef.current
          if (!press || press.bucketId !== bucketId) return
          armManualDrag(press)
        }, immediate ? 0 : ROW_LONG_PRESS_MS)
      },

      onPointerMove: (e: ReactPointerEvent) => {
        const press = pressRef.current
        if (
          !press ||
          press.isTouch ||
          press.bucketId !== bucketId ||
          press.pointerId !== e.pointerId ||
          dragArmedRef.current
        ) {
          return
        }

        if (shouldCancelRowPress(press.start, { x: e.clientX, y: e.clientY })) {
          cancelPress()
        }
      },

      onPointerUp: (e: ReactPointerEvent) => {
        const press = pressRef.current
        if (
          !press ||
          press.isTouch ||
          press.bucketId !== bucketId ||
          press.pointerId !== e.pointerId ||
          dragArmedRef.current ||
          manualDragRef.current
        ) {
          return
        }
        finishRelease({ x: e.clientX, y: e.clientY })
      },

      onPointerCancel: (e: ReactPointerEvent) => {
        // Android native long-press fires pointercancel; touch listeners continue.
        e.preventDefault()
      },

      onContextMenu: (e: React.SyntheticEvent) => {
        e.preventDefault()
      },
    }),
    [
      disabled,
      armManualDrag,
      cancelPress,
      finishRelease,
      updateManualDragPosition,
    ],
  )

  return {
    pendingBucketId,
    manualDragBucketId: manualDrag?.bucketId ?? null,
    manualDragRowHeight: manualDrag?.rowHeight ?? null,
    manualDragOverlay: manualDrag
      ? {
          top: rowDragOverlayTop({
            clientY: manualDrag.clientY,
            grabOffsetY: manualDrag.grabOffsetY,
          }),
          left: manualDrag.listBounds.left,
          width: manualDrag.listBounds.width,
        }
      : null,
    manualDragOverIndex: manualDrag?.overIndex ?? null,
    manualBlockExtents: manualDrag?.blockExtents ?? null,
    getRowHandlers,
  }
}
