import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  TOAST_DISMISS_LABEL,
  TOAST_PAUSE_LABEL,
  TOAST_RESUME_LABEL,
} from '@/lib/brand'
import {
  TOAST_AUTO_DISMISS_MS,
  TOAST_EXIT_MS,
  toastPushPx,
  toastStickyInsetPx,
} from '@/lib/toastDismiss'
import { pausableTimeout, type PausableTimeout } from '@/lib/pausableTimeout'
import {
  registerToastPublisher,
  type ToastPayload,
} from '@/lib/toast'

type ToastItem = ToastPayload & { id: number }

type ToastState = {
  item: ToastItem
  exiting: boolean
}

/** Past this fraction of the panel width (or the px floor), a swipe dismisses. */
const SWIPE_DISMISS_FRACTION = 0.28
const SWIPE_DISMISS_MIN_PX = 80
/** A press only becomes a drag past this much movement — a tap never captures. */
const SWIPE_SLOP_PX = 6
/** Snap-back / fling-out transition; also how long the swiped panel lingers. */
const SWIPE_SETTLE_MS = 220

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden>
      <rect x="4" y="3" width="3" height="10" rx="1" />
      <rect x="9" y="3" width="3" height="10" rx="1" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M5 3.5v9a.5.5 0 0 0 .77.42l7-4.5a.5.5 0 0 0 0-.84l-7-4.5A.5.5 0 0 0 5 3.5Z" />
    </svg>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const idRef = useRef(0)
  const timerRef = useRef<PausableTimeout | null>(null)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Why the auto-dismiss is currently held. The countdown (and its progress
  // bar) run only when none of these are set. Hovering gives mouse users a
  // passive hold; the explicit button gives everyone (incl. touch) a sticky
  // one; a swipe holds mid-drag.
  const [userPaused, setUserPaused] = useState(false)
  const [hovering, setHovering] = useState(false)

  // Swipe-to-dismiss drag state.
  const [dragDx, setDragDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [settling, setSettling] = useState(false)
  // A swipe past the threshold: the toast is flying out, so the page can ease back up.
  const [flung, setFlung] = useState(false)
  const dragStartXRef = useRef(0)
  const [panelWidth, setPanelWidth] = useState(360)
  const activePointerRef = useRef<number | null>(null)
  const draggingRef = useRef(false)

  const item = toast?.item ?? null
  const isAuto = item?.dismiss === 'auto'
  const paused = userPaused || hovering || dragging

  const clearTimers = useCallback(() => {
    timerRef.current?.cancel()
    timerRef.current = null
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
  }, [])

  const remove = useCallback(() => {
    setToast(null)
    setFlung(false)
    setDragDx(0)
    setDragging(false)
    setSettling(false)
  }, [])

  const dismiss = useCallback(() => {
    timerRef.current?.cancel()
    timerRef.current = null
    setToast((current) => {
      if (!current || current.exiting) return current
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
      exitTimerRef.current = setTimeout(() => {
        remove()
        exitTimerRef.current = null
      }, TOAST_EXIT_MS)
      return { ...current, exiting: true }
    })
  }, [remove])

  const show = useCallback(
    (next: ToastPayload) => {
      clearTimers()
      setUserPaused(false)
      setHovering(false)
      setDragDx(0)
      setDragging(false)
      setSettling(false)
      setFlung(false)
      activePointerRef.current = null
      const id = ++idRef.current
      setToast({ item: { ...next, id }, exiting: false })
      if (next.dismiss === 'auto') {
        const timer = pausableTimeout(TOAST_AUTO_DISMISS_MS, dismiss)
        timerRef.current = timer
        timer.resume() // no holds at first show
      }
    },
    [clearTimers, dismiss],
  )

  useEffect(() => {
    registerToastPublisher(show)
    return () => {
      registerToastPublisher(null)
      clearTimers()
    }
  }, [show, clearTimers])

  // Keep the live countdown in lockstep with the progress bar's freeze state.
  useEffect(() => {
    const timer = timerRef.current
    if (!timer) return
    if (paused) timer.pause()
    else timer.resume()
  }, [paused])

  // Make room for the toast: the page content slides down by the panel's height
  // while it is showing and eases back as it leaves (see .toast-push-target).
  const leaving = toast?.exiting === true || flung
  useLayoutEffect(() => {
    const root = document.documentElement
    const panel = panelRef.current
    if (!item || leaving || !panel) {
      root.style.setProperty('--toast-push', '0px')
      root.style.setProperty('--toast-inset', '0px')
      return
    }
    const apply = () => {
      root.style.setProperty(
        '--toast-push',
        `${toastPushPx(panel.offsetHeight)}px`,
      )
      root.style.setProperty(
        '--toast-inset',
        `${toastStickyInsetPx(panel.offsetHeight)}px`,
      )
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [item, leaving])
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('--toast-push')
      document.documentElement.style.removeProperty('--toast-inset')
    },
    [],
  )

  // ----- swipe-to-dismiss -----
  // While OUR drag owns the gesture, consume the touchmove stream. Otherwise
  // Chrome's native recognizer classifies a fast horizontal swipe as a fling
  // and swallows the next tap (~200ms) as "stop the fling" — pointerdown/up
  // fire but no click, so the first tap after a swipe-dismiss goes dead.
  // Attached natively: React root touch listeners are passive, so a React
  // onTouchMove could not preventDefault. Vertical scrolls never set
  // draggingRef (the slop check is horizontal), so page scroll from the
  // toast stays native.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const onTouchMove = (e: TouchEvent) => {
      if (draggingRef.current) e.preventDefault()
    }
    panel.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => panel.removeEventListener('touchmove', onTouchMove)
  }, [item?.id])

  const flingOut = useCallback(
    (direction: 1 | -1, width: number) => {
      timerRef.current?.cancel()
      timerRef.current = null
      setSettling(true)
      setFlung(true)
      setDragDx(direction * (width + 140))
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
      exitTimerRef.current = setTimeout(() => {
        remove()
        exitTimerRef.current = null
      }, SWIPE_SETTLE_MS)
    },
    [remove],
  )

  // A press only arms a potential drag; it does not capture the pointer or
  // start dragging until the finger actually moves past the slop. This keeps a
  // plain tap a plain tap — no pointer capture that could swallow the next tap.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if ((e.target as HTMLElement).closest('button')) return
    if (toast?.exiting || settling) return
    activePointerRef.current = e.pointerId
    dragStartXRef.current = e.clientX
    draggingRef.current = false
    setPanelWidth(e.currentTarget.offsetWidth)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerRef.current) return
    const dx = e.clientX - dragStartXRef.current
    if (!draggingRef.current) {
      if (Math.abs(dx) < SWIPE_SLOP_PX) return
      draggingRef.current = true
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setDragDx(dx)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerRef.current) return
    activePointerRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (!draggingRef.current) return // never moved — it was a tap, leave it be
    draggingRef.current = false
    setDragging(false)
    const dx = e.clientX - dragStartXRef.current
    const width = e.currentTarget.offsetWidth
    const threshold = Math.max(
      SWIPE_DISMISS_MIN_PX,
      width * SWIPE_DISMISS_FRACTION,
    )
    if (Math.abs(dx) > threshold) {
      flingOut(dx > 0 ? 1 : -1, width)
    } else {
      setSettling(true)
      setDragDx(0)
      window.setTimeout(() => setSettling(false), SWIPE_SETTLE_MS)
    }
  }

  const isError = item?.type === 'error'
  const dragOpacity = 1 - Math.min(1, Math.abs(dragDx) / (panelWidth * 0.9))
  const dragActive = dragging || settling || dragDx !== 0
  const dragStyle: CSSProperties | undefined = dragActive
    ? {
        transform: `translateX(${dragDx}px)`,
        opacity: dragOpacity,
        transition: settling
          ? `transform ${SWIPE_SETTLE_MS}ms ease, opacity ${SWIPE_SETTLE_MS}ms ease`
          : 'none',
      }
    : undefined

  // One structurally-stable return path: `children` must keep the same slot
  // whether or not a toast is showing. An early `return <>{children}</>` here
  // put the children ARRAY (main.tsx passes several) in slot 0 without a
  // toast but NESTED it under slot 0 with one — a fragment-vs-element type
  // mismatch that made React unmount and remount the entire app tree on every
  // toast show AND dismiss, wiping all app state (e.g. the bottom-nav roster,
  // which collapsed the Kids tab for a beat whenever a toast dismissed).
  return (
    <>
      {children}
      {item ? (
        <div
          className="toast-viewport pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
          aria-live={isError ? 'assertive' : 'polite'}
        >
          <div
            key={item.id}
            ref={panelRef}
            role={isError ? 'alert' : 'status'}
            style={{ touchAction: 'pan-y', ...dragStyle }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHovering(true)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setHovering(false)}
            className={
              'toast-panel pointer-events-auto relative flex w-full max-w-md select-none items-start gap-2 rounded-xl px-3.5 py-3 text-sm shadow-2xl ring-2 backdrop-blur-md ' +
              (isAuto ? 'pb-4 ' : '') +
              (toast?.exiting ? 'toast-panel-exit ' : '') +
              (isError
                ? 'bg-red-950/88 text-red-50 ring-red-400/60'
                : 'bg-emerald-950/88 text-emerald-50 ring-emerald-400/60')
            }
          >
            <div className="min-w-0 flex-1">
              {/* With rich content the headline is redundant on screen but still
                  announced — keep it sr-only so the live region reads the verb. */}
              <p className={item.content ? 'sr-only' : 'font-medium leading-snug'}>
                {item.message}
              </p>
              {item.content ? <div>{item.content}</div> : null}
            </div>
  
            {isAuto ? (
              <button
                type="button"
                onClick={() => setUserPaused((p) => !p)}
                className="shrink-0 rounded p-1 leading-none text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
                aria-label={userPaused ? TOAST_RESUME_LABEL : TOAST_PAUSE_LABEL}
                aria-pressed={userPaused}
              >
                {userPaused ? <PlayIcon /> : <PauseIcon />}
              </button>
            ) : null}
  
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded p-0.5 text-lg leading-none text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
              aria-label={TOAST_DISMISS_LABEL}
            >
              ×
            </button>
  
            {isAuto ? (
              <span
                className="toast-progress absolute inset-x-3 bottom-1.5 h-0.5 origin-right rounded-full bg-emerald-300/60"
                style={{
                  animationDuration: `${TOAST_AUTO_DISMISS_MS}ms`,
                  animationPlayState: paused ? 'paused' : 'running',
                }}
                aria-hidden
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
