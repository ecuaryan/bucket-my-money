import {
  useLayoutEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
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
import BucketGroupHeader, {
  BucketGroupHeaderOverlay,
} from '@/features/buckets/BucketGroupHeader'
import { BucketReorderPointerSensor } from '@/features/buckets/bucketReorderSensors'
import { setReorderTouchLock } from '@/features/buckets/bucketReorderTouchLock'
import {
  shouldShowGripPopoverOnFocus,
} from '@/features/buckets/reorderHintLogic'
import { ReorderGripPopover } from '@/features/buckets/ReorderHint'
import { useReorderHint } from '@/features/buckets/ReorderHintContext'
import { useRowLongPressReorder } from '@/features/buckets/useRowLongPressReorder'
import {
  blockShiftY,
  manualSortableShiftY,
  resolveRowHandlers,
} from '@/features/buckets/rowLongPressReorder'
import { BUCKET_GROUP_EMPTY_HINT, bucketGroupSummary } from '@/lib/brand'
import { BUCKET_NAME_MAX_LENGTH } from '@/lib/buckets'
import {
  UNGROUPED_KEY,
  headerIdForKey,
  isHeaderId,
  keyFromHeaderId,
  sectionTotal,
  visibleRowIds,
  type BucketSection,
} from '@/lib/bucketGroups'
import {
  animateGroupRows,
  type GroupAnimation,
} from '@/lib/groupCollapseAnimation'
import { prefersReducedMotion } from '@/lib/motion'
import type { Database } from '@/types/database'

type Bucket = Database['public']['Tables']['buckets']['Row']

type Props = {
  /** Buckets in display sections. Without real groups: one Ungrouped section. */
  sections: BucketSection[]
  /** True when the member has at least one real group (headers are shown). */
  grouped: boolean
  /** Group whose rows are animating open/closed right now (null = none). */
  groupAnimation: GroupAnimation | null
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
  /** Full on-screen row order (bucket ids, plus header ids when grouped). */
  onDragReorder: (orderedRowIds: string[]) => void
  onGroupDragReorder: (activeHeaderId: string, overHeaderId: string) => void
  onToggleGroupCollapsed: (key: string) => void
  onRenameGroup: (key: string) => void
  onDeleteGroup: (key: string) => void
  onMoveGroup: (key: string, direction: 'up' | 'down') => void
  onRemoveFromGroup: (bucketId: string) => void
}

/** Each group is its own rounded card; rows draw the card edges (ring-1 equivalent). */
function groupedCardClass(first: boolean, last: boolean): string {
  return (
    'border-x border-t border-zinc-800 bg-zinc-900 ' +
    (first ? 'rounded-t-2xl ' : '') +
    (last ? 'border-b rounded-b-2xl ' : '')
  )
}

const LIST_CARD_CLASS =
  'divide-y divide-zinc-800 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800'

type ListItem =
  | { type: 'header'; section: BucketSection; sectionIndex: number }
  | {
      type: 'bucket'
      bucket: Bucket
      bucketIndex: number
      sectionKey: string
      card?: string
    }
  | { type: 'empty'; key: string }

export default function SortableBucketList({
  sections: sectionsProp,
  grouped,
  groupAnimation,
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
  onGroupDragReorder,
  onToggleGroupCollapsed,
  onRenameGroup,
  onDeleteGroup,
  onMoveGroup,
  onRemoveFromGroup,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const { notifyDragStarted } = useReorderHint()
  // A closing group keeps rendering its rows until the animation finishes.
  const sections = useMemo(
    () =>
      groupAnimation?.dir === 'close'
        ? sectionsProp.map((s) =>
            s.key === groupAnimation.key ? { ...s, collapsed: false } : s,
          )
        : sectionsProp,
    [sectionsProp, groupAnimation],
  )
  useLayoutEffect(() => {
    if (!groupAnimation || !listRef.current) return
    animateGroupRows(listRef.current, groupAnimation.key, groupAnimation.dir)
  }, [groupAnimation, listRef])
  const buckets = useMemo(() => sections.flatMap((s) => s.buckets), [sections])
  const dragEnabled = (buckets.length >= 2 || grouped) && renamingId === null
  const visibleIds = useMemo(
    () => visibleRowIds(sections, grouped),
    [sections, grouped],
  )
  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = []
    let bucketIndex = 0
    sections.forEach((section, sectionIndex) => {
      if (grouped) out.push({ type: 'header', section, sectionIndex })
      if (grouped && !section.collapsed && section.buckets.length === 0) {
        out.push({ type: 'empty', key: section.key })
      }
      for (const bucket of section.buckets) {
        if (!grouped || !section.collapsed) {
          const n = section.buckets.length
          const at = section.buckets.indexOf(bucket)
          out.push({
            type: 'bucket',
            bucket,
            bucketIndex,
            sectionKey: section.key,
            card: grouped ? groupedCardClass(at === 0, at === n - 1) : undefined,
          })
        }
        bucketIndex += 1
      }
    })
    return out
  }, [sections, grouped])

  const {
    pendingBucketId,
    manualDragBucketId,
    manualDragRowHeight,
    manualDragOverlay,
    manualDragOverIndex,
    manualBlockExtents,
    getRowHandlers,
  } = useRowLongPressReorder({
    listRef,
    bucketIds: visibleIds,
    onMoveMoney: handleRowTap,
    onDragReorder: handleHookReorder,
    notifyDragStarted,
    disabled: !dragEnabled,
  })

  const sensors = useSensors(
    useSensor(BucketReorderPointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const activeBucket =
    activeId && !isHeaderId(activeId)
      ? buckets.find((b) => b.id === activeId) ?? null
      : null
  const manualDragBucket =
    manualDragBucketId && !isHeaderId(manualDragBucketId)
      ? buckets.find((b) => b.id === manualDragBucketId) ?? null
      : null
  const manualDragSection =
    manualDragBucketId && isHeaderId(manualDragBucketId)
      ? sections.find((s) => s.key === keyFromHeaderId(manualDragBucketId)) ?? null
      : null

  const manualActiveIndex =
    manualDragBucketId != null ? visibleIds.indexOf(manualDragBucketId) : -1

  const manualSortableActive =
    manualActiveIndex >= 0 &&
    manualDragOverIndex != null &&
    manualDragOverIndex >= 0

  const manualSortableTransition = prefersReducedMotion()
    ? undefined
    : 'transform 250ms ease'

  const manualRowHeight = manualDragRowHeight ?? 0

  // Whole-group long-press drag: groups move as blocks and nothing collapses.
  const manualGroupIndex = manualDragSection
    ? sections.findIndex((s) => s.key === manualDragSection.key)
    : -1
  function blockShiftFor(sectionKey: string): number | undefined {
    if (manualGroupIndex < 0 || !manualBlockExtents) return undefined
    if (manualDragOverIndex == null || manualDragOverIndex < 0) return undefined
    return blockShiftY(
      sections.findIndex((s) => s.key === sectionKey),
      manualGroupIndex,
      manualDragOverIndex,
      manualBlockExtents,
    )
  }
  const draggedSectionKey = manualDragSection?.key ?? null

  // Function declarations are hoisted, so the hook above can use them.
  function handleRowTap(id: string) {
    if (isHeaderId(id)) onToggleGroupCollapsed(keyFromHeaderId(id))
    else onMoveMoney(id)
  }

  function handleHookReorder(ids: string[], dragId: string, overId: string) {
    if (isHeaderId(dragId)) {
      if (isHeaderId(overId)) onGroupDragReorder(dragId, overId)
      return
    }
    onDragReorder(ids)
  }

  function manualShiftFor(rowId: string): number | undefined {
    if (!manualSortableActive) return undefined
    const rowIndex = visibleIds.indexOf(rowId)
    if (rowIndex < 0) return undefined
    return manualSortableShiftY(
      rowIndex,
      manualActiveIndex,
      manualDragOverIndex,
      manualRowHeight,
    )
  }

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

    const oldIndex = visibleIds.indexOf(String(active.id))
    const newIndex = visibleIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    onDragReorder(arrayMove(visibleIds, oldIndex, newIndex))
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

  function removeFor(bucketId: string, sectionKey: string) {
    return grouped && sectionKey !== UNGROUPED_KEY
      ? () => onRemoveFromGroup(bucketId)
      : undefined
  }

  function summaryFor(section: BucketSection): string {
    const total = sectionTotal(section)
    return bucketGroupSummary(
      section.buckets.length,
      total > 0 ? formatMoney(total) : null,
    )
  }

  function renderHeader(
    section: BucketSection,
    sectionIndex: number,
    sortable: boolean,
  ) {
    return (
      <BucketGroupHeader
        key={headerIdForKey(section.key)}
        id={headerIdForKey(section.key)}
        sortable={sortable}
        name={section.name}
        isUngrouped={section.isUngrouped}
        collapsed={section.collapsed}
        summary={summaryFor(section)}
        isFirst={sectionIndex === 0}
        isLast={sectionIndex === sections.length - 1}
        manualShiftY={
          manualGroupIndex >= 0
            ? blockShiftFor(section.key)
            : manualShiftFor(headerIdForKey(section.key))
        }
        manualTransition={manualSortableTransition}
        rowHandlers={
          dragEnabled
            ? getRowHandlers(headerIdForKey(section.key))
            : { onClick: () => onToggleGroupCollapsed(section.key) }
        }
        pressPending={pendingBucketId === headerIdForKey(section.key)}
        manualActive={manualDragBucketId === headerIdForKey(section.key)}
        gripHandlers={
          dragEnabled ? getRowHandlers(headerIdForKey(section.key), true) : undefined
        }
        onToggle={() => onToggleGroupCollapsed(section.key)}
        onRename={() => onRenameGroup(section.key)}
        onDelete={() => onDeleteGroup(section.key)}
        onMoveUp={() => onMoveGroup(section.key, 'up')}
        onMoveDown={() => onMoveGroup(section.key, 'down')}
      />
    )
  }

  const emptyHint = (key: string) => {
    const shift = blockShiftFor(key)
    return (
    <li
      key={`empty:${key}`}
      data-section-key={key}
      style={
        shift
          ? {
              transform: `translateY(${shift}px)`,
              transition: manualSortableTransition,
            }
          : undefined
      }
      className="rounded-2xl border border-dashed border-zinc-800 px-4 py-3 text-center text-xs text-zinc-600"
    >
      {BUCKET_GROUP_EMPTY_HINT}
    </li>
    )
  }

  if (!dragEnabled) {
    return (
      <ul
        ref={listRef}
        className={grouped ? undefined : LIST_CARD_CLASS}
      >
        {items.map((item) => {
          if (item.type === 'header') {
            return renderHeader(item.section, item.sectionIndex, false)
          }
          if (item.type === 'empty') return emptyHint(item.key)
          const { bucket, bucketIndex } = item
          return (
            <li
              key={bucket.id}
              data-flip-id={bucket.id}
              data-section-key={item.sectionKey}
              className={'flex min-w-0 items-center gap-1 px-2 py-2 ' + (item.card ?? '')}
            >
              <BucketRowContent
                bucket={bucket}
                onRemoveFromGroup={removeFor(bucket.id, item.sectionKey)}
                idx={bucketIndex}
                isLast={bucketIndex === buckets.length - 1}
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
          )
        })}
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
        <SortableContext
          items={visibleIds}
          strategy={verticalListSortingStrategy}
        >
          <ul
            ref={listRef}
            className={grouped ? undefined : LIST_CARD_CLASS}
          >
            {items.map((item) => {
              if (item.type === 'header') {
                return renderHeader(item.section, item.sectionIndex, true)
              }
              if (item.type === 'empty') return emptyHint(item.key)
              const { bucket, bucketIndex } = item
              const shiftY =
                manualGroupIndex >= 0
                  ? blockShiftFor(item.sectionKey)
                  : manualShiftFor(bucket.id)
              return (
                <SortableBucketRow
                  key={bucket.id}
                  bucket={bucket}
                  idx={bucketIndex}
                  isLast={bucketIndex === buckets.length - 1}
                  cardClass={item.card}
                  sectionKey={item.sectionKey}
                  onRemoveFromGroup={removeFor(bucket.id, item.sectionKey)}
                  renaming={renamingId === bucket.id}
                  rowPressPending={pendingBucketId === bucket.id}
                  manualDragging={
                    manualDragBucketId === bucket.id ||
                    item.sectionKey === draggedSectionKey
                  }
                  manualSortableShiftY={shiftY}
                  manualSortableTransition={
                    shiftY !== undefined ? manualSortableTransition : undefined
                  }
                  rowHandlers={resolveRowHandlers({
                    dragEnabled: true,
                    bucketId: bucket.id,
                    dragHandlers: getRowHandlers(bucket.id),
                    onMoveMoney,
                  })}
                  {...rowProps}
                />
              )
            })}
          </ul>
        </SortableContext>
        <DragOverlay dropAnimation={prefersReducedMotion() ? null : undefined}>
          {activeBucket ? (
            <BucketRowOverlay bucket={activeBucket} formatMoney={formatMoney} />
          ) : null}
        </DragOverlay>
      </DndContext>
      {/* Row long-press uses a fixed overlay (dnd-kit cannot arm from touch delay on Android). */}
      {manualDragSection && manualDragOverlay ? (
        <div
          className="pointer-events-none fixed z-[999]"
          style={{
            left: manualDragOverlay.left,
            width: manualDragOverlay.width,
            top: manualDragOverlay.top,
          }}
        >
          <BucketGroupHeaderOverlay
            name={manualDragSection.name}
            isUngrouped={manualDragSection.isUngrouped}
            summary={summaryFor(manualDragSection)}
          />
        </div>
      ) : null}
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
  /** Card-edge classes when the list is grouped (each group is its own card). */
  cardClass?: string
  sectionKey?: string
  /** Set for buckets inside a real group: moves the bucket to Ungrouped. */
  onRemoveFromGroup?: () => void
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
      data-section-key={props.sectionKey}
      className={
        'flex min-w-0 items-center gap-1 px-2 py-2 ' +
        (props.cardClass ?? '') +
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
  onRemoveFromGroup,
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
          onRemoveFromGroup={onRemoveFromGroup}
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
        onRemoveFromGroup={onRemoveFromGroup}
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
