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
  /** Backdrop tap closes by default; form sheets with lots of input often disable this. */
  closeOnBackdropClick?: boolean
}

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
  }, [open])

  useEffect(() => {
    if (!present) return
    acquireSheetScrollLock()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      releaseSheetScrollLock()
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
      onClick={closeOnBackdropClick ? onClose : undefined}
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
