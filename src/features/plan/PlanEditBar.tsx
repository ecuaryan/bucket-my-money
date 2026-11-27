import { PLAN_EDIT_BAR_STICKY_BOTTOM_CLASS } from '@/components/layout/navLayout'
import { useSheetBackdropOpen } from '@/hooks/useSheetBackdropOpen'
import { PLAN_EDIT_BAR_LABEL, PLAN_LOCK_LABEL, PLAN_REDO_LABEL, PLAN_UNDO_LABEL } from '@/lib/brand'

/**
 * The lock, and while unlocked, undo and redo for typed numbers. It sits in its
 * own spot under the table and is natively sticky to the bottom of the screen,
 * so it floats over the table while the table runs past the screen and rests
 * in its spot at the table's end, never over what comes after. Centered (Peek
 * keeps the right corner; on the narrowest phones it moves left so the two
 * never touch).
 */
export function PlanEditBar({
  hidden,
  locked,
  canUndo,
  canRedo,
  onToggleLock,
  onUndo,
  onRedo,
}: {
  /** Out of sight but still holding its spot, so nothing below moves. */
  hidden: boolean
  locked: boolean
  canUndo: boolean
  canRedo: boolean
  onToggleLock: () => void
  onUndo: () => void
  onRedo: () => void
}) {
  // Like Peek: out of the way while a sheet is up.
  const sheetOpen = useSheetBackdropOpen()

  return (
    <div
      className={`pointer-events-none sticky z-30 mt-3 flex justify-center max-[359px]:justify-start ${PLAN_EDIT_BAR_STICKY_BOTTOM_CLASS} ${hidden || sheetOpen ? 'invisible' : ''}`}
    >
      <div
        role="group"
        aria-label={PLAN_EDIT_BAR_LABEL}
        className="pointer-events-auto flex items-center rounded-full bg-zinc-900/95 p-1 shadow-lg ring-1 ring-zinc-700 backdrop-blur"
      >
        <button
          type="button"
          aria-label={PLAN_LOCK_LABEL}
          aria-pressed={locked}
          onClick={onToggleLock}
          className={`${buttonClass} ${locked ? 'bg-zinc-800 text-amber-300' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          {locked ? <LockIcon /> : <UnlockIcon />}
        </button>
        {locked ? null : (
          <>
            <span aria-hidden="true" className="mx-1 h-6 w-px bg-zinc-700" />
            <button
              type="button"
              aria-label={PLAN_UNDO_LABEL}
              // aria-disabled, not disabled: a tap that empties the history
              // keeps focus on the button instead of dropping it to the page.
              aria-disabled={!canUndo}
              onClick={canUndo ? onUndo : undefined}
              className={`${buttonClass} ${canUndo ? stepOn : stepOff}`}
            >
              <UndoIcon />
            </button>
            <button
              type="button"
              aria-label={PLAN_REDO_LABEL}
              aria-disabled={!canRedo}
              onClick={canRedo ? onRedo : undefined}
              className={`${buttonClass} ${canRedo ? stepOn : stepOff}`}
            >
              <RedoIcon />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const stepOn = 'text-zinc-200 hover:text-white'
const stepOff = 'cursor-default text-zinc-600'

const buttonClass =
  'flex size-11 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400'

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  className: 'size-5',
} as const

function LockIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function UnlockIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.75-1.4" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg {...iconProps}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  )
}
