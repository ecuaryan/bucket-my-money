import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import HideAmountsPeekSheetAnchor from '@/components/HideAmountsPeekSheetAnchor'
import { SHEET_Z_INDEX } from '@/components/layout/navLayout'
import {
  acquireSheetScrollLock,
  releaseSheetScrollLock,
} from '@/lib/sheetScrollLock'

type Props = {
  open: boolean
  onClose: () => void
  'aria-label': string
  children: ReactNode
  /** Backdrop tap closes by default; a form sheet passes false while it holds unsaved edits. */
  closeOnBackdropClick?: boolean
}

/** A little past the panel's 250ms close transition (src/index.css `.sheet-panel`). */
export const SHEET_UNMOUNT_AFTER_CLOSE_MS = 350

/** Open sheets, oldest first: Escape closes only the top one (a confirm over an editor). */
const openSheets: object[] = []

/**
 * Form dialog: top-aligned on phones (stable with the keyboard), centered on
 * wider screens. Panel scrolls when content exceeds the visible viewport.
 */
export function Sheet({
  open,
  onClose,
  'aria-label': ariaLabel,
  children,
  closeOnBackdropClick = true,
}: Props) {
  const [present, setPresent] = useState(open)
  const [shown, setShown] = useState(false)
  const onCloseRef = useRef(onClose)
  // A press that starts in the panel (selecting text, resizing a textarea) and
  // ends on the backdrop is not a tap outside.
  const pressStartedOnBackdrop = useRef(false)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (open) {
      setPresent(true)
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setShown(true))
      })
      return () => cancelAnimationFrame(frame)
    }
    setShown(false)
    // The panel's transitionend unmounts it as soon as the slide-out ends. This
    // timer is the backstop: with no transition (reduced motion, or closed
    // before it ever opened) or an interrupted one, transitionend never fires,
    // and the invisible backdrop would stay over the page blocking every tap.
    const timer = setTimeout(() => setPresent(false), SHEET_UNMOUNT_AFTER_CLOSE_MS)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!present) return
    acquireSheetScrollLock()
    const token = {}
    openSheets.push(token)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && openSheets.at(-1) === token) onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      releaseSheetScrollLock()
      openSheets.splice(openSheets.indexOf(token), 1)
      window.removeEventListener('keydown', onKey)
    }
  }, [present])

  if (!present) return null

  // Portal so fixed positioning stacks above app chrome (see APP_CHROME_Z_INDEX).
  // Sheets rendered inside <main> would otherwise sit under the sticky header.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={
        'sheet-backdrop fixed inset-0 flex flex-col items-center justify-start px-4 sm:justify-center sm:px-0 ' +
        (shown ? 'sheet-backdrop-open' : '')
      }
      style={{ zIndex: SHEET_Z_INDEX }}
      onPointerDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (closeOnBackdropClick && pressStartedOnBackdrop.current && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={
          'sheet-panel w-full max-w-md rounded-2xl bg-zinc-900/75 p-5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl ' +
          (shown ? 'sheet-panel-open' : '')
        }
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={(e) => {
          if (shown || e.propertyName !== 'transform') return
          setPresent(false)
        }}
      >
        {children}
      </div>
      <HideAmountsPeekSheetAnchor />
    </div>,
    document.body,
  )
}
