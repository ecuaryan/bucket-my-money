import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tapHintPosition } from '@/components/ui/tapHintPosition'

const SHOW_MS = 3000

/**
 * A small hint on the element just tapped, saying why the tap did nothing (like
 * the Peek button's). It floats over the page, so nothing moves the way a toast
 * pushes content down. Gone after a few seconds, on the next press, or on scroll.
 */
export function TapHint({ anchor, text, onDone }: { anchor: HTMLElement; text: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const anchorAt = useRef<DOMRect | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  // Measured before paint, so it never shows in the wrong place.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = anchor.getBoundingClientRect()
    anchorAt.current = rect
    const headerBottom =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 0
    setPosition(tapHintPosition(rect, el.getBoundingClientRect(), window.innerWidth, headerBottom))
  }, [anchor])

  useEffect(() => {
    const done = () => onDoneRef.current()
    // A scroll that moved what was tapped; not one still settling from before
    // the tap, whose event can land just after the hint shows.
    const onScroll = () => {
      const at = anchorAt.current
      const now = anchor.getBoundingClientRect()
      if (!anchor.isConnected || !at || Math.abs(now.top - at.top) > 2 || Math.abs(now.left - at.left) > 2) done()
    }
    const timer = setTimeout(done, SHOW_MS)
    // Capture: a press anywhere, and the table's own sideways scroll too.
    document.addEventListener('pointerdown', done, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', done)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', done, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', done)
    }
  }, [anchor])

  return createPortal(
    <div
      ref={ref}
      role="status"
      style={position ?? { visibility: 'hidden', left: 0, top: 0 }}
      className="menu-popover-enter pointer-events-none fixed z-30 w-max max-w-[min(16rem,calc(100vw-2rem))] rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 shadow-lg ring-1 ring-zinc-700"
    >
      {text}
    </div>,
    document.body,
  )
}
