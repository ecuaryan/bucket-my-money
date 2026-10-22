import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { APP_POPOVER_Z_INDEX } from '@/components/layout/navLayout'
import DragHandle from '@/components/ui/DragHandle'
import {
  BUCKET_GROUP_UNGROUPED,
  BUCKET_GROUP_UNNAMED,
} from '@/lib/brand'

type Props = {
  /** `group:<key>` — the sortable id. */
  id: string
  /** False when drag is disabled (renaming a bucket) — header is static. */
  sortable: boolean
  name: string | null
  isUngrouped: boolean
  collapsed: boolean
  /** Pre-formatted "3 buckets · $400" (respects Hide amounts). */
  summary: string
  isFirst: boolean
  isLast: boolean
  /** Vertical shift while a bucket row is long-press dragged past this header. */
  manualShiftY?: number
  manualTransition?: string
  /** Pointer handlers from the long-press hook (tap toggles, long-press drags). */
  rowHandlers?: Record<string, unknown>
  pressPending?: boolean
  /** This header is the one being long-press dragged. */
  manualActive?: boolean
  /** Pointer handlers for the grip: pressing it starts a whole-group drag at once. */
  gripHandlers?: Record<string, unknown>
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

/**
 * Section header row inside the bucket list card. Same height as a bucket row
 * so long-press drag displacement math stays uniform.
 */
export default function BucketGroupHeader(props: Props) {
  return props.sortable ? (
    <SortableHeader {...props} />
  ) : (
    <HeaderRow {...props} />
  )
}

function SortableHeader(props: Props) {
  // Registered with dnd-kit only so bucket drags can hover/drop on a header;
  // the group itself is dragged by the row-press hook (grip or long-press).
  const { setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
  })

  const manual = props.manualShiftY !== undefined
  const style = manual
    ? {
        transform: props.manualShiftY
          ? CSS.Translate.toString({
              x: 0,
              y: props.manualShiftY,
              scaleX: 1,
              scaleY: 1,
            })
          : undefined,
        transition: props.manualTransition,
      }
    : { transform: CSS.Transform.toString(transform), transition }

  return (
    <HeaderRow
      {...props}
      liRef={setNodeRef}
      style={style}
      dimmed={isDragging || props.manualActive === true}
    />
  )
}

function HeaderRow({
  id,
  name,
  isUngrouped,
  collapsed,
  summary,
  isFirst,
  isLast,
  onToggle,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  rowHandlers,
  pressPending = false,
  gripHandlers,
  liRef,
  style,
  dimmed = false,
}: Props & {
  liRef?: (node: HTMLLIElement | null) => void
  style?: React.CSSProperties
  dimmed?: boolean
}) {
  // The name is optional; Ungrouped (and unnamed groups) show no label at all.
  const label = isUngrouped ? null : name?.trim() || null
  const ariaLabel = isUngrouped
    ? BUCKET_GROUP_UNGROUPED
    : label ?? BUCKET_GROUP_UNNAMED

  return (
    <li
      ref={liRef}
      style={style}
      data-flip-id={id}
      data-group-header=""
      className={
        // Sits tight above its own card; the top margin is what separates it
        // from the group above.
        'mb-0.5 flex h-7 min-w-0 items-center gap-1 px-2 ' +
        (isFirst ? '' : 'mt-4 ') +
        (dimmed ? 'opacity-40' : '')
      }
    >
      {gripHandlers ? (
        <DragHandle label="Reorder group" {...gripHandlers} />
      ) : (
        <div className="w-7 shrink-0" aria-hidden="true" />
      )}
      <div
        role="button"
        tabIndex={0}
        data-reorder-row=""
        aria-expanded={!collapsed}
        aria-label={`${ariaLabel}, ${collapsed ? 'expand' : 'collapse'}`}
        {...rowHandlers}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onToggle()
        }}
        className={
          'group flex h-full min-w-0 flex-1 select-none items-center justify-start gap-1 rounded-lg px-1.5 py-1 text-left transition hover:bg-zinc-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 touch-pan-y [-webkit-touch-callout:none] ' +
          (pressPending ? 'bg-zinc-800/70 ring-2 ring-inset ring-emerald-400/45' : '')
        }
      >
        {label && (
          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {label}
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={
            'h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 motion-reduce:transition-none ' +
            (collapsed ? '-rotate-90' : '')
          }
        >
          <path
            fillRule="evenodd"
            d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <span className="shrink-0 pr-1 text-xs tabular-nums text-zinc-500">
        {summary}
      </span>
      <ReorderMenu
        ariaLabel="Group options"
        isFirst={isFirst}
        isLast={isLast}
        onRename={isUngrouped ? undefined : onRename}
        onDelete={isUngrouped ? undefined : onDelete}
        deleteLabel="Delete group"
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    </li>
  )
}

/**
 * Kebab menu for a reorderable section heading: Move up / Move down, plus
 * Rename / Delete when those handlers are given. Shared by bucket groups and
 * the Bank tab's institution cards.
 */
export function ReorderMenu({
  ariaLabel,
  isFirst,
  isLast,
  onRename,
  onDelete,
  deleteLabel = 'Delete',
  onMoveUp,
  onMoveDown,
}: {
  ariaLabel: string
  isFirst: boolean
  isLast: boolean
  onRename?: () => void
  onDelete?: () => void
  deleteLabel?: string
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function fire(handler: () => void) {
    return () => {
      setOpen(false)
      handler()
    }
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300 focus:outline focus:outline-2 focus:outline-emerald-400"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="h-5 w-5"
        >
          <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          style={{ zIndex: APP_POPOVER_Z_INDEX }}
          className={
            'menu-popover-enter absolute right-0 w-44 overflow-hidden rounded-lg bg-zinc-900 py-1 text-sm shadow-xl ring-1 ring-zinc-700 ' +
            (isLast ? 'bottom-full mb-1' : 'top-full mt-1')
          }
        >
          {onRename && <MenuItem onClick={fire(onRename)}>Rename</MenuItem>}
          <MenuItem onClick={fire(onMoveUp)} disabled={isFirst}>
            Move up
          </MenuItem>
          <MenuItem onClick={fire(onMoveDown)} disabled={isLast}>
            Move down
          </MenuItem>
          {onDelete && (
            <>
              <div className="my-1 h-px bg-zinc-800" />
              <MenuItem onClick={fire(onDelete)} destructive>
                {deleteLabel}
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  disabled,
  destructive,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={
        'block w-full px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ' +
        (destructive
          ? 'text-red-300 hover:bg-red-500/10'
          : 'text-zinc-300 hover:bg-zinc-800')
      }
    >
      {children}
    </button>
  )
}

export function BucketGroupHeaderOverlay({
  name,
  isUngrouped,
  summary,
}: {
  name: string | null
  isUngrouped: boolean
  summary: string
}) {
  const label = isUngrouped
    ? BUCKET_GROUP_UNGROUPED
    : name?.trim() || BUCKET_GROUP_UNNAMED
  return (
    <div className="flex h-10 min-w-0 items-center gap-1 rounded-2xl bg-zinc-900 px-2 shadow-lg ring-2 ring-emerald-400">
      <DragHandle
        label="Reorder group"
        className="cursor-grabbing text-zinc-400"
        tabIndex={-1}
      />
      <span className="min-w-0 flex-1 truncate px-1.5 text-sm font-semibold text-zinc-300">
        {label}
      </span>
      <span className="shrink-0 pr-1 text-xs tabular-nums text-zinc-500">
        {summary}
      </span>
      <div className="h-8 w-8 shrink-0" aria-hidden="true" />
    </div>
  )
}
