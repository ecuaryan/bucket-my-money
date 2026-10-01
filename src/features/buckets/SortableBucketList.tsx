import { useMemo, useState, type KeyboardEvent, type RefObject } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ClearableInput } from '@/components/ui/ClearableInput'
import DragHandle from '@/components/ui/DragHandle'
import BucketActionsMenu from '@/features/buckets/BucketActionsMenu'
import { BucketReorderPointerSensor } from '@/features/buckets/bucketReorderSensors'
import { setReorderTouchLock } from '@/features/buckets/bucketReorderTouchLock'
import {
  shouldShowGripPopoverOnFocus,
} from '@/features/buckets/reorderHintLogic'
import { ReorderGripPopover } from '@/features/buckets/ReorderHint'
import { useReorderHint } from '@/features/buckets/ReorderHintContext'
import { useRowLongPressReorder } from '@/features/buckets/useRowLongPressReorder'
import {
  manualSortableShiftY,
  resolveRowHandlers,
} from '@/features/buckets/rowLongPressReorder'
import { BUCKET_NAME_MAX_LENGTH } from '@/lib/buckets'
import { prefersReducedMotion } from '@/lib/motion'
import type { Database } from '@/types/database'

type Bucket = Database['public']['Tables']['buckets']['Row']

type Props = {
  buckets: Bucket[]
  listRef: RefObject<HTMLUListElement | null>
  renamingId: string | null
  renameValue: string
  canManageStructure: boolean
  formatMoney: (amount: number) => string
  onRenameValueChange: (value: string) => void
  onCommitRename: (id: string) => void
  onCancelRename: () => void
  onMoveMoney: (id: string) => void
  onViewHistory: (id: string) => void
  onRename: (id: string, name: string) => void
  onViewNotes: (bucket: Bucket) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onDelete: (bucket: Bucket) => void
  onDragReorder: (orderedIds: string[]) => void
}

export default function SortableBucketList({
  buckets,
  listRef,
  renamingId,
  renameValue,
  canManageStructure,
  formatMoney,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onMoveMoney,
  onViewHistory,
  onRename,
  onViewNotes,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDragReorder,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const { notifyDragStarted } = useReorderHint()
  const dragEnabled = buckets.length >= 2 && renamingId === null
  const bucketIds = useMemo(() => buckets.map((b) => b.id), [buckets])

  const {
    pendingBucketId,
    manualDragBucketId,
    manualDragRowHeight,
    manualDragOverlay,
    manualDragOverIndex,
    getRowHandlers,
  } = useRowLongPressReorder({
    listRef,
    bucketIds,
    onMoveMoney,
    onDragReorder,
    notifyDragStarted,
    disabled: !dragEnabled,
  })

  const sensors = useSensors(
    useSensor(BucketReorderPointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const activeBucket = activeId
    ? buckets.find((b) => b.id === activeId) ?? null
    : null

  const manualDragBucket = manualDragBucketId
    ? buckets.find((b) => b.id === manualDragBucketId) ?? null
    : null

  const manualActiveIndex =
    manualDragBucketId != null
      ? buckets.findIndex((b) => b.id === manualDragBucketId)
      : -1

  const manualSortableActive =
    manualActiveIndex >= 0 &&
    manualDragOverIndex != null &&
    manualDragOverIndex >= 0

  const manualSortableTransition = prefersReducedMotion()
    ? undefined
    : 'transform 250ms ease'

  const manualRowHeight = manualDragRowHeight ?? 0

  function handleDragStart(event: DragStartEvent) {
    setReorderTouchLock(true)
    notifyDragStarted()
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setReorderTouchLock(false)
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = buckets.findIndex((b) => b.id === active.id)
    const newIndex = buckets.findIndex((b) => b.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const reordered = arrayMove(buckets, oldIndex, newIndex)
    onDragReorder(reordered.map((b) => b.id))
  }

  function handleDragCancel() {
    setReorderTouchLock(false)
    setActiveId(null)
  }

  const rowProps = {
    renamingId,
    renameValue,
    canManageStructure,
    formatMoney,
    onRenameValueChange,
    onCommitRename,
    onCancelRename,
    onMoveMoney,
    onViewHistory,
    onRename,
    onViewNotes,
    onMoveUp,
    onMoveDown,
    onDelete,
  }

  if (!dragEnabled) {
    return (
      <ul
        ref={listRef}
        className="divide-y divide-zinc-800 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800"
      >
        {buckets.map((bucket, idx) => (
          <li
            key={bucket.id}
            data-flip-id={bucket.id}
            className="flex min-w-0 items-center gap-1 px-2 py-2"
          >
            <BucketRowContent
              bucket={bucket}
              idx={idx}
              isLast={idx === buckets.length - 1}
              renaming={renamingId === bucket.id}
              rowHandlers={resolveRowHandlers({
                dragEnabled: false,
                bucketId: bucket.id,
                dragHandlers: {},
                onMoveMoney,
              })}
              {...rowProps}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        measuring={{
          droppable: { strategy: MeasuringStrategy.Always },
        }}
        autoScroll={{
          threshold: { x: 0, y: 0.2 },
          acceleration: 12,
          interval: 5,
          layoutShiftCompensation: false,
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        onDragAbort={() => setReorderTouchLock(false)}
      >
        <SortableContext items={bucketIds} strategy={verticalListSortingStrategy}>
          <ul
            ref={listRef}
            className="divide-y divide-zinc-800 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800"
          >
            {buckets.map((bucket, idx) => (
              <SortableBucketRow
                key={bucket.id}
                bucket={bucket}
                idx={idx}
                isLast={idx === buckets.length - 1}
                renaming={renamingId === bucket.id}
                rowPressPending={pendingBucketId === bucket.id}
                manualDragging={manualDragBucketId === bucket.id}
                manualSortableShiftY={
                  manualSortableActive
                    ? manualSortableShiftY(
                        idx,
                        manualActiveIndex,
                        manualDragOverIndex,
                        manualRowHeight,
                      )
                    : undefined
                }
                manualSortableTransition={
                  manualSortableActive ? manualSortableTransition : undefined
                }
                rowHandlers={resolveRowHandlers({
                  dragEnabled: true,
                  bucketId: bucket.id,
                  dragHandlers: getRowHandlers(bucket.id),
                  onMoveMoney,
                })}
                {...rowProps}
              />
            ))}
          </ul>
        </SortableContext>
        <DragOverlay dropAnimation={prefersReducedMotion() ? null : undefined}>
          {activeBucket ? (
            <BucketRowOverlay bucket={activeBucket} formatMoney={formatMoney} />
          ) : null}
        </DragOverlay>
      </DndContext>
      {/* Row long-press uses a fixed overlay (dnd-kit cannot arm from touch delay on Android). */}
      {manualDragBucket && manualDragOverlay ? (
        <div
          className="pointer-events-none fixed z-[999]"
          style={{
            left: manualDragOverlay.left,
            width: manualDragOverlay.width,
            top: manualDragOverlay.top,
          }}
        >
          <BucketRowOverlay
            bucket={manualDragBucket}
            formatMoney={formatMoney}
            className="w-full"
          />
        </div>
      ) : null}
    </>
  )
}

type RowProps = {
  bucket: Bucket
  idx: number
  isLast: boolean
  renaming: boolean
  rowPressPending?: boolean
  manualDragging?: boolean
  manualSortableShiftY?: number
  manualSortableTransition?: string
  rowHandlers?: Record<string, unknown>
  renameValue: string
  canManageStructure: boolean
  formatMoney: (amount: number) => string
  onRenameValueChange: (value: string) => void
  onCommitRename: (id: string) => void
  onCancelRename: () => void
  onMoveMoney: (id: string) => void
  onViewHistory: (id: string) => void
  onRename: (id: string, name: string) => void
  onViewNotes: (bucket: Bucket) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onDelete: (bucket: Bucket) => void
}

function SortableBucketRow(props: RowProps) {
  const { bucket } = props
  const { mergeGripListeners, onGripFocus, onGripBlur } = useReorderHint()
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bucket.id })

  const mergedGripListeners = mergeGripListeners(bucket.id, listeners)
  const isManualActiveRow = props.manualDragging === true
  const dimmed = isDragging || isManualActiveRow
  const useManualSortable = props.manualSortableShiftY !== undefined
  const manualShiftY = props.manualSortableShiftY ?? 0

  const style = useManualSortable
    ? {
        transform:
          manualShiftY !== 0
            ? CSS.Translate.toString({ x: 0, y: manualShiftY, scaleX: 1, scaleY: 1 })
            : undefined,
        transition: props.manualSortableTransition,
      }
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      }

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-flip-id={bucket.id}
      className={
        'flex min-w-0 items-center gap-1 px-2 py-2 ' +
        (dimmed ? 'opacity-40 ' : '')
      }
    >
      <div className="relative shrink-0">
        <DragHandle
          ref={setActivatorNodeRef}
          {...attributes}
          {...mergedGripListeners}
          onFocus={(e) => {
            if (shouldShowGripPopoverOnFocus(e.currentTarget)) {
              onGripFocus(bucket.id)
            }
          }}
          onBlur={(e) => onGripBlur(e.relatedTarget)}
          onClick={(e) => e.stopPropagation()}
        />
        <ReorderGripPopover bucketId={bucket.id} />
      </div>
      <BucketRowContent
        {...props}
        rowTouchLocked={isDragging || props.manualDragging === true}
      />
    </li>
  )
}

type BucketRowContentProps = RowProps & {
  rowTouchLocked?: boolean
}

function BucketRowContent({
  bucket,
  idx,
  isLast,
  renaming,
  rowPressPending = false,
  renameValue,
  canManageStructure,
  formatMoney,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onMoveMoney,
  onViewHistory,
  onRename,
  onViewNotes,
  onMoveUp,
  onMoveDown,
  onDelete,
  rowHandlers,
  rowTouchLocked = false,
}: BucketRowContentProps) {
  if (renaming) {
    return (
      <>
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
          <ClearableInput
            wrapperClassName="min-w-0 flex-1"
            autoFocus
            type="text"
            value={renameValue}
            maxLength={BUCKET_NAME_MAX_LENGTH}
            onValueChange={onRenameValueChange}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') void onCommitRename(bucket.id)
              if (e.key === 'Escape') onCancelRename()
            }}
            onBlur={() => void onCommitRename(bucket.id)}
            inputClassName="w-full min-w-0 rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-emerald-400 focus:outline focus:outline-2 focus:outline-emerald-400"
          />
          <p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-500">
            {formatMoney(Number(bucket.allocated_amount))}
          </p>
        </div>
        <BucketActionsMenu
          isFirst={idx === 0}
          isLast={isLast}
          hasAllocation={Number(bucket.allocated_amount) > 0}
          canManageStructure={canManageStructure}
          onViewHistory={() => onViewHistory(bucket.id)}
          onRename={() => onRename(bucket.id, bucket.name)}
          onNotes={() => onViewNotes(bucket)}
          onMoveUp={() => onMoveUp(bucket.id)}
          onMoveDown={() => onMoveDown(bucket.id)}
          onDelete={() => onDelete(bucket)}
        />
      </>
    )
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-reorder-row=""
        {...rowHandlers}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onMoveMoney(bucket.id)
        }}
        className={
          'flex min-w-0 flex-1 select-none items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-zinc-800/60 focus:bg-zinc-800/60 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 [-webkit-touch-callout:none] ' +
          (rowTouchLocked ? 'touch-none ' : 'touch-pan-y ') +
          (rowPressPending
            ? 'bg-zinc-800/70 ring-2 ring-emerald-400/45 ring-inset'
            : '')
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <p className="min-w-0 truncate text-sm font-medium text-zinc-300">
            {bucket.name}
          </p>
          {(bucket.notes ?? '').trim() && (
            <button
              type="button"
              aria-label={`View notes for ${bucket.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onViewNotes(bucket)
              }}
              className="shrink-0 rounded p-2 -m-1.5 text-zinc-500 transition hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                aria-hidden="true"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </button>
          )}
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-300">
          {formatMoney(Number(bucket.allocated_amount))}
        </p>
      </div>
      <BucketActionsMenu
        isFirst={idx === 0}
        isLast={isLast}
        hasAllocation={Number(bucket.allocated_amount) > 0}
        canManageStructure={canManageStructure}
        onViewHistory={() => onViewHistory(bucket.id)}
        onRename={() => onRename(bucket.id, bucket.name)}
        onNotes={() => onViewNotes(bucket)}
        onMoveUp={() => onMoveUp(bucket.id)}
        onMoveDown={() => onMoveDown(bucket.id)}
        onDelete={() => onDelete(bucket)}
      />
    </>
  )
}

function BucketRowOverlay({
  bucket,
  formatMoney,
  className = '',
}: {
  bucket: Bucket
  formatMoney: (amount: number) => string
  className?: string
}) {
  return (
    <div
      className={
        'flex min-w-0 items-center gap-1 rounded-2xl bg-zinc-900 px-2 py-2 shadow-lg ring-2 ring-emerald-400 ' +
        className
      }
    >
      <DragHandle className="cursor-grabbing text-zinc-400" tabIndex={-1} />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-2 py-1.5">
        <p className="truncate text-sm font-medium text-zinc-300">
          {bucket.name}
        </p>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-300">
          {formatMoney(Number(bucket.allocated_amount))}
        </p>
      </div>
      <div className="h-8 w-8 shrink-0" aria-hidden="true" />
    </div>
  )
}
