import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { blockShiftY } from '@/features/buckets/rowLongPressReorder'
import { useRowLongPressReorder } from '@/features/buckets/useRowLongPressReorder'
import { prefersReducedMotion } from '@/lib/motion'
import {
  PLAN_COLUMN_LABELS,
  PLAN_LINK_BUTTON_ARIA,
  PLAN_NOTE_ICON_LABEL,
  PLAN_PAID_BY_LABELS,
  PLAN_SECTION_LABELS,
  PLAN_TABLE_ARIA_LABEL,
  PLAN_TAKE_HOME_LABEL,
  PLAN_UNPLANNED_LABEL,
  PLAN_VIEW_LABEL,
  PLAN_VIEW_LOCKED_ARIA,
  planAddLineAriaLabel,
  planCellAriaLabel,
  planLineDetailsAriaLabel,
  planLinkedColumnAria,
} from '@/lib/brand'
import { cellCents, lineYearlyUnits, type PlanSection, type PlanTotals } from '@/lib/planMath'
import { PLAN_SECTIONS, type PlanColumn, type PlanLine } from '@/lib/plan'
import { canEditColumn, cellText, formatCellCents, planCellButtonId, type PlanCellEdit } from './planCells'

/**
 * Compact pads cells thinly, so each row ends with an 8px spacer (a flex
 * pseudo-element in the row's own color): the last column never sits on the
 * table's edge.
 */
function rowEnd(compact: boolean): string {
  return compact ? " after:w-2 after:shrink-0 after:content-['']" : ''
}

/** Sum of each bucket line's floored amount in one column: what a linked rule moves per run. */
function sumPerRun(lines: readonly PlanLine[], gross: bigint, column: PlanColumn): bigint {
  if (column === 'percent') return 0n
  let total = 0n
  for (const line of lines) {
    if (line.section !== 'buckets' || !line.bucketId) continue
    total += cellCents(lineYearlyUnits(line, gross), column)
  }
  return total
}



interface Props {
  lines: readonly PlanLine[]
  totals: PlanTotals
  columns: readonly PlanColumn[]
  compact: boolean
  canEdit: boolean
  flashIds: ReadonlySet<string>
  editing: PlanCellEdit | null
  /** Display name and notes per line (bucket lines use their bucket's). */
  lineName: (line: PlanLine) => string
  lineHasNote: (line: PlanLine) => boolean
  /** Whether the line's sheet has anything to show (admins always; viewers need a note or Paid by). */
  lineHasDetails: (line: PlanLine) => boolean
  /** True while Hide amounts masks numbers (applies to % too). */
  masked: boolean
  onStartEdit: (line: PlanLine, column: PlanColumn) => void
  onEditText: (text: string) => void
  onCommit: (via: 'enter' | 'blur') => void
  onCancel: () => void
  onOpenLine: (line: PlanLine) => void
  /** A finished drag: the section's line ids in their new order. */
  onReorder: (section: PlanSection, lineIds: string[]) => void
  onAdd: (section: PlanSection) => void
  onOpenView: () => void
  /** Editing is locked on this device (View sheet): the View button shows a lock. */
  locked: boolean
  /** A tap on something that would be editable if editing weren't locked. */
  onLockedTap: () => void
  /** The column the linked Auto-bucket rule runs on (⚡), if linked. */
  linkedColumn: PlanColumn | null
  linkedRuleName: string | null
  onOpenLink: () => void
}

/**
 * The plan as a spreadsheet-like table: line names pinned left, the header and
 * Unplanned pinned on top, numbers scrolling both ways. Reads like a paycheck:
 * Income → Withheld → Take-home → Bills → Buckets (docs/PLAN.md § The table).
 */
export default function PlanTable(props: Props) {
  const { lines, totals, columns, compact, canEdit, masked } = props
  const gross = totals.grossCents

  // Compact fits the names plus three full money columns on a 390px phone.
  // Yearly is wider in both views so six-figure totals fit.
  const nameW = compact ? 'w-[124px]' : 'w-[150px]'
  const cellW = (column: PlanColumn) =>
    compact
      ? `${column === 'year' ? 'w-[92px]' : 'w-[77px]'} text-[11px]`
      : `${column === 'year' ? 'w-[120px]' : 'w-[108px]'} text-[13px]`
  const pad = compact ? 'px-1' : 'px-3'
  const nameCell = `sticky left-0 z-10 ${nameW} shrink-0 border-r border-zinc-800`
  const numCell = (column: PlanColumn) => `${cellW(column)} shrink-0 ${pad} text-right tabular-nums whitespace-nowrap`
  // Line cells hold a full-width button or input, so they pad less.
  const lineCell = (column: PlanColumn) =>
    `${cellW(column)} shrink-0 ${compact ? 'px-0.5' : 'px-1'} text-right tabular-nums whitespace-nowrap`

  // The page scrolls vertically; the table scrolls only sideways. The header
  // (column names + Unplanned) pins under the app bar and keeps its own
  // sideways scroll in step with the body's.
  const headRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const head = headRef.current
    const body = bodyRef.current
    if (!head || !body) return
    // A value we set on one side fires its scroll event a frame later; skip
    // that echo so it never drags the other side back mid-fling.
    const echo = new WeakMap<HTMLElement, number>()
    // Sub-pixel tolerance: high-DPI screens can round scrollLeft when it's set.
    const same = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1
    const follow = (from: HTMLElement, to: HTMLElement) => () => {
      if (same(echo.get(from), from.scrollLeft)) {
        echo.delete(from)
        return
      }
      if (!same(to.scrollLeft, from.scrollLeft)) {
        echo.set(to, from.scrollLeft)
        to.scrollLeft = from.scrollLeft
      }
    }
    const onBody = follow(body, head)
    const onHead = follow(head, body)
    body.addEventListener('scroll', onBody, { passive: true })
    head.addEventListener('scroll', onHead, { passive: true })
    return () => {
      body.removeEventListener('scroll', onBody)
      head.removeEventListener('scroll', onHead)
    }
  }, [])

  const unplanned = totals.unplannedUnits
  const unplannedTone =
    unplanned === 0n ? 'text-emerald-300' : unplanned < 0n ? 'text-red-300' : 'text-zinc-100'

  return (
    // On wider screens the table breaks out of the app's narrow column to the
    // window's width (less a margin), then sizes to its columns, centered.
    <div className="sm:mx-[calc(50%-50vw+1.5rem)]">
    <div
      role="table"
      aria-label={PLAN_TABLE_ARIA_LABEL}
      // No vertical scroll of its own (a nested one eats the first swipe), and
      // `overflow: clip` rounds the corners without becoming a scroll box, so
      // the header can still pin to the page.
      className="rounded-2xl bg-zinc-950 ring-1 ring-zinc-800 [overflow:clip] sm:mx-auto sm:w-max sm:max-w-full"
    >
      <div
        ref={headRef}
        role="rowgroup"
        className="sticky-below-header z-20 overflow-x-auto overscroll-x-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="w-max min-w-full">
          <div role="row" className={`flex min-h-11 items-stretch border-b border-zinc-800 bg-zinc-900${rowEnd(compact)}`}>
            <div role="columnheader" className={`${nameCell} flex items-center bg-zinc-900 px-1.5`}>
              <button
                type="button"
                onClick={props.onOpenView}
                aria-label={props.locked ? PLAN_VIEW_LOCKED_ARIA : undefined}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-800 px-2 text-[13px] font-semibold text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                {props.locked ? <LockIcon /> : <ColumnsIcon />}
                {PLAN_VIEW_LABEL}
              </button>
            </div>
            {columns.map((column) =>
              column === props.linkedColumn ? (
                <div key={column} role="columnheader" className={`${cellW(column)} flex shrink-0 items-stretch`}>
                  <button
                    type="button"
                    onClick={props.onOpenLink}
                    aria-label={planLinkedColumnAria(props.linkedRuleName ?? '', PLAN_COLUMN_LABELS[column])}
                    className={`flex w-full items-center justify-end ${pad} text-[12px] font-semibold leading-tight text-emerald-300 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400`}
                  >
                    {/* Inline, so the bolt sits right against the label's first line;
                        sized to the text (1em) and centered on its capitals. */}
                    <span className="whitespace-normal text-right">
                      <span className="mr-1 inline-block align-[-0.15em]">
                        <BoltIcon className="size-[1em]" />
                      </span>
                      {PLAN_COLUMN_LABELS[column]}
                    </span>
                  </button>
                </div>
              ) : (
                <div
                  key={column}
                  role="columnheader"
                  className={`${numCell(column)} flex items-center justify-end text-[12px] font-semibold leading-tight text-zinc-400`}
                >
                  <span className="whitespace-normal">{PLAN_COLUMN_LABELS[column]}</span>
                </div>
              ),
            )}
          </div>
          <div role="row" className={`flex min-h-11 items-stretch border-b border-zinc-700 bg-zinc-900${rowEnd(compact)}`}>
            <div role="rowheader" className={`${nameCell} flex items-center bg-zinc-900 px-3 text-sm font-bold text-zinc-100`}>
              {PLAN_UNPLANNED_LABEL}
            </div>
            {columns.map((column) => (
              <div
                key={column}
                role="cell"
                className={`${numCell(column)} flex items-center justify-end text-sm font-bold ${unplannedTone}`}
              >
                {cellText(unplanned, column, gross, masked)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={bodyRef} data-plan-body="" className="overflow-x-auto overscroll-x-none">
        <div className="w-max min-w-full">
        {PLAN_SECTIONS.map((section) => (
          <div role="rowgroup" key={section} className="mt-2.5">
            <SectionHeader
              section={section}
              subtotal={totals.sections[section]}
              {...{ columns, gross, masked, canEdit, compact, nameCell, numCell }}
              onAdd={props.onAdd}
              linkedColumn={props.linkedColumn}
              linkedRunCents={
                section === 'buckets' && props.linkedColumn
                  ? sumPerRun(lines, gross, props.linkedColumn)
                  : null
              }
              onOpenLink={props.onOpenLink}
            />
            <SectionLines
              section={section}
              rows={lines.filter((line) => line.section === section)}
              table={props}
              boxRef={bodyRef}
              pinnedRef={headRef}
              nameCell={nameCell}
              numCell={lineCell}
            />
            {section === 'withheld' ? (
              <TotalRow
                label={PLAN_TAKE_HOME_LABEL}
                units={totals.takeHomeUnits}
                {...{ columns, gross, masked, compact, nameCell, numCell }}
              />
            ) : null}
          </div>
        ))}
        <div className="h-4" />
        </div>
      </div>
    </div>
    </div>
  )
}

function SectionHeader({
  section,
  subtotal,
  columns,
  gross,
  masked,
  canEdit,
  compact,
  nameCell,
  numCell,
  onAdd,
  linkedColumn,
  linkedRunCents,
  onOpenLink,
}: {
  section: PlanSection
  subtotal: bigint
  linkedColumn: PlanColumn | null
  /** In the linked column, the Buckets subtotal is the sum of per-run amounts: exactly what moves. */
  linkedRunCents: bigint | null
  onOpenLink: () => void
  columns: readonly PlanColumn[]
  gross: bigint
  masked: boolean
  canEdit: boolean
  compact: boolean
  nameCell: string
  numCell: (column: PlanColumn) => string
  onAdd: (section: PlanSection) => void
}) {
  // 44pt tall; narrower so the label and both actions fit the name column
  // with the same 12px edge as every other row.
  const actionW = compact ? 'w-7' : 'w-10'
  return (
    <div role="row" className={`flex min-h-11 items-stretch border-y border-zinc-800 bg-zinc-900${rowEnd(compact)}`}>
      <div role="rowheader" className={`${nameCell} flex items-center justify-between bg-zinc-900 pl-3`}>
        <span
          className={`font-bold uppercase text-zinc-400 ${compact ? 'text-[10px] tracking-wide' : 'text-[11px] tracking-wider'}`}
        >
          {PLAN_SECTION_LABELS[section]}
        </span>
        {canEdit || (section === 'buckets' && linkedColumn) ? (
          <span className="flex">
            {section === 'buckets' ? (
              <button
                type="button"
                onClick={onOpenLink}
                aria-label={PLAN_LINK_BUTTON_ARIA}
                className={`flex h-11 ${actionW} items-center justify-center rounded-lg hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                  linkedColumn ? 'text-emerald-300' : 'text-zinc-500'
                }`}
              >
                <BoltIcon />
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                onClick={() => onAdd(section)}
                aria-label={planAddLineAriaLabel(section)}
                className={`flex h-11 ${actionW} items-center justify-center rounded-lg text-emerald-300 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400`}
              >
                <PlusIcon />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {columns.map((column) => (
        <div key={column} role="cell" className={`${numCell(column)} flex items-center justify-end font-bold text-zinc-200`}>
          {column === linkedColumn && linkedRunCents !== null
            ? formatCellCents(linkedRunCents, masked)
            : cellText(subtotal, column, gross, masked)}
        </div>
      ))}
    </div>
  )
}

function TotalRow({
  label,
  units,
  columns,
  gross,
  masked,
  compact,
  nameCell,
  numCell,
}: {
  label: string
  units: bigint
  columns: readonly PlanColumn[]
  gross: bigint
  masked: boolean
  compact: boolean
  nameCell: string
  numCell: (column: PlanColumn) => string
}) {
  return (
    <div role="row" className={`mt-2.5 flex min-h-11 items-stretch border-y border-zinc-700 bg-zinc-900${rowEnd(compact)}`}>
      <div role="rowheader" className={`${nameCell} flex items-center bg-zinc-900 px-3 text-sm font-bold text-zinc-100`}>
        {label}
      </div>
      {columns.map((column) => (
        <div key={column} role="cell" className={`${numCell(column)} flex items-center justify-end text-sm font-bold text-zinc-100`}>
          {cellText(units, column, gross, masked)}
        </div>
      ))}
    </div>
  )
}

/** Where a row sits while another line is dragged (see useRowLongPressReorder). */
interface RowDrag {
  /** Long-press handlers for the name button; absent when the line can't move. */
  handlers?: Record<string, unknown>
  pending: boolean
  dragging: boolean
  style?: CSSProperties
}

/**
 * One section's lines. Admins reorder them by long-pressing a line's name
 * (the same gesture and hook as the Buckets list); a tap still opens the line.
 */
function SectionLines({
  section,
  rows,
  table,
  boxRef,
  pinnedRef,
  nameCell,
  numCell,
}: {
  section: PlanSection
  rows: PlanLine[]
  table: Props
  /** The table's sideways scroller: the drag ghost spans its visible width. */
  boxRef: RefObject<HTMLDivElement | null>
  /** The pinned header: dragging up scrolls the page from its bottom edge. */
  pinnedRef: RefObject<HTMLDivElement | null>
  nameCell: string
  numCell: (column: PlanColumn) => string
}) {
  const listRef = useRef<HTMLDivElement>(null)
  // Row heights and the visible table box, measured when a drag starts: names
  // can wrap, so rows differ in height, and the ghost stays inside the table.
  const [measured, setMeasured] = useState<{ heights: number[]; box: DOMRect } | null>(null)
  const ids = rows.map((line) => line.id)
  const dragEnabled = table.canEdit && rows.length >= 2 && table.editing === null

  const { pendingBucketId, manualDragBucketId, manualDragRowHeight, manualDragOverlay, manualDragOverIndex, getRowHandlers } =
    useRowLongPressReorder({
      listRef,
      scrollTopInset: () => pinnedRef.current?.getBoundingClientRect().bottom ?? 0,
      bucketIds: ids,
      onMoveMoney: (id) => {
        const line = rows.find((l) => l.id === id)
        if (line) table.onOpenLine(line)
      },
      onDragReorder: (next) => table.onReorder(section, next),
      onDragArmed: () => {
        const list = listRef.current
        const box = boxRef.current?.getBoundingClientRect()
        if (!list || !box) return
        const heights = Array.from(list.children).map((row) => row.getBoundingClientRect().height)
        setMeasured({ heights, box })
      },
      onDragEnded: () => setMeasured(null),
      notifyDragStarted: () => {},
      disabled: !dragEnabled,
    })

  const activeIndex = manualDragBucketId ? ids.indexOf(manualDragBucketId) : -1
  const shifting =
    activeIndex >= 0 &&
    manualDragOverIndex !== null &&
    manualDragOverIndex >= 0 &&
    measured !== null &&
    measured.heights.length === ids.length
  const transition = prefersReducedMotion() ? undefined : 'transform 250ms ease'
  const dragged = activeIndex >= 0 ? rows[activeIndex] : null

  return (
    <>
      <div ref={listRef}>
        {rows.map((line, index) => {
          const shift = shifting ? blockShiftY(index, activeIndex, manualDragOverIndex, measured.heights) : 0
          const drag: RowDrag = {
            handlers: dragEnabled ? getRowHandlers(line.id) : undefined,
            pending: pendingBucketId === line.id,
            dragging: manualDragBucketId === line.id,
            style: shifting
              ? { transform: shift ? `translateY(${shift}px)` : undefined, transition }
              : undefined,
          }
          return (
            <LineRow
              key={line.id}
              line={line}
              flash={table.flashIds.has(line.id)}
              {...table}
              drag={drag}
              nameCell={nameCell}
              numCell={numCell}
            />
          )
        })}
      </div>
      {dragged && manualDragOverlay && measured
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[999] flex items-center rounded-lg bg-zinc-900 px-3 text-[13px] leading-tight text-zinc-200 shadow-lg ring-2 ring-emerald-400"
              style={{
                left: measured.box.left,
                width: measured.box.width,
                height: manualDragRowHeight ?? undefined,
                top: manualDragOverlay.top,
              }}
            >
              <LineLabel name={table.lineName(dragged)} hasNote={table.lineHasNote(dragged)} paidBy={dragged.paidBy} />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function LineRow({
  line,
  flash,
  totals,
  columns,
  canEdit,
  editing,
  lineName,
  lineHasNote,
  lineHasDetails,
  masked,
  onStartEdit,
  onEditText,
  onCommit,
  onCancel,
  onOpenLine,
  locked,
  onLockedTap,
  compact,
  drag,
  nameCell,
  numCell,
}: Props & {
  line: PlanLine
  flash: boolean
  drag: RowDrag
  nameCell: string
  numCell: (column: PlanColumn) => string
}) {
  const gross = totals.grossCents
  const yearly = lineYearlyUnits(line, gross)
  const name = lineName(line)
  const pressedWithDrag = useRef(false)

  return (
    // `isolate`: the glow stays inside this row, never over the pinned header.
    <div
      role="row"
      data-flip-id={line.id}
      style={drag.style}
      className={`relative isolate flex min-h-11 items-stretch border-b border-zinc-900 ${drag.dragging ? 'opacity-40' : ''}${rowEnd(compact)}`}
    >
      {flash ? (
        <span aria-hidden="true" className="plan-row-flash pointer-events-none absolute inset-0 z-20 bg-emerald-500/20" />
      ) : null}
      <div role="rowheader" className={`${nameCell} flex bg-zinc-950`}>
        {lineHasDetails(line) ? (
          <button
            type="button"
            {...drag.handlers}
            onPointerDownCapture={() => {
              pressedWithDrag.current = Boolean(drag.handlers)
            }}
            onClick={(e) => {
              // A pointer press that started with long-press reorder on opens the
              // line from the press handlers; otherwise (keyboard, or a press that
              // began while a cell was open) this click opens it.
              if (pressedWithDrag.current && e.detail !== 0) return
              onOpenLine(line)
            }}
            aria-label={planLineDetailsAriaLabel(name)}
            className={
              'flex w-full min-w-0 select-none flex-col items-start justify-center gap-0.5 px-3 py-1.5 text-left text-[13px] leading-tight text-zinc-300 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400 [-webkit-touch-callout:none] ' +
              (drag.pending ? 'bg-zinc-800/70 ring-2 ring-inset ring-emerald-400/45' : '')
            }
          >
            <LineLabel name={name} hasNote={lineHasNote(line)} paidBy={line.paidBy} />
          </button>
        ) : (
          <span
            onClick={locked ? onLockedTap : undefined}
            className="flex w-full min-w-0 flex-col items-start justify-center gap-0.5 px-3 py-1.5 text-[13px] leading-tight text-zinc-300"
          >
            <LineLabel name={name} hasNote={false} paidBy={line.paidBy} />
          </span>
        )}
      </div>
      {columns.map((column) => {
        const isInput = line.unit === column
        const isEditing = editing?.lineId === line.id && editing.column === column
        const text = cellText(yearly, column, gross, masked)
        const label = planCellAriaLabel(name, PLAN_COLUMN_LABELS[column])
        let content: ReactNode
        if (canEdit && isEditing) {
          content = (
            <CellInput
              column={column}
              label={label}
              value={editing.text}
              invalid={editing.invalid}
              returnFocusTo={planCellButtonId(line.id, column)}
              onChange={onEditText}
              onCommit={onCommit}
              onCancel={onCancel}
            />
          )
        } else if (canEdit && canEditColumn(line.section, column)) {
          content = (
            <button
              id={planCellButtonId(line.id, column)}
              type="button"
              onClick={() => onStartEdit(line, column)}
              aria-label={`${label}, ${text}`}
              className={
                `min-h-11 w-full self-stretch rounded-lg ${compact ? 'px-0.5' : 'px-2'} text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ` +
                // The typed value reads brighter than the ones calculated from it.
                (isInput ? 'text-zinc-100 hover:bg-zinc-900' : 'text-zinc-400 hover:bg-zinc-900')
              }
            >
              {text}
            </button>
          )
        } else {
          content = <span className={(compact ? 'px-0.5 ' : 'px-2 ') + (isInput ? 'text-zinc-100' : 'text-zinc-400')}>{text}</span>
        }
        return (
          <div
            key={column}
            role="cell"
            // Locked: a tap on a number says why nothing opens.
            onClick={locked && canEditColumn(line.section, column) ? onLockedTap : undefined}
            className={`${numCell(column)} flex items-center justify-end`}
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}

function LineLabel({ name, hasNote, paidBy }: { name: string; hasNote: boolean; paidBy: PlanLine['paidBy'] }) {
  return (
    <>
      <span className="flex max-w-full items-start gap-1">
        <span className="line-clamp-2 break-words">{name}</span>
        {hasNote ? (
          <span role="img" aria-label={PLAN_NOTE_ICON_LABEL} className="mt-0.5 shrink-0 text-zinc-500">
            <NoteIcon />
          </span>
        ) : null}
      </span>
      {paidBy ? <span className="text-[11px] font-semibold text-zinc-400">{PLAN_PAID_BY_LABELS[paidBy]}</span> : null}
    </>
  )
}

function CellInput({
  column,
  label,
  value,
  invalid,
  returnFocusTo,
  onChange,
  onCommit,
  onCancel,
}: {
  column: PlanColumn
  label: string
  value: string
  invalid: boolean
  /** The cell's button id: keyboard users land back on it after Enter/Escape. */
  returnFocusTo: string
  onChange: (text: string) => void
  onCommit: (via: 'enter' | 'blur') => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus()
    input.select()
    // The open input can be wider than its cell and grows left; bring all of
    // it out from under the pinned names (and inside the right edge).
    const scroller = input.closest<HTMLElement>('[data-plan-body]')
    const names = scroller?.querySelector('[role="rowheader"]')
    if (!scroller || !names) return
    const left = names.getBoundingClientRect().right + 4
    const right = scroller.getBoundingClientRect().right - 4
    let box = input.getBoundingClientRect()
    if (box.left < left) scroller.scrollLeft -= left - box.left
    else if (box.right > right) scroller.scrollLeft += box.right - right
    // In the first column there's nothing to scroll back to: grow right instead.
    box = input.getBoundingClientRect()
    if (box.left < left && wrapRef.current) wrapRef.current.style.marginRight = `${box.left - left}px`
  }, [])

  function refocusCell() {
    // After React swaps the input back for the cell's button.
    setTimeout(() => document.getElementById(returnFocusTo)?.focus(), 0)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onCommit('enter')
      refocusCell()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
      refocusCell()
    }
  }

  const isPercent = column === 'percent'
  return (
    // Phones force inputs to 16px (no zoom on focus), so the open input may be
    // wider than its cell; it grows to the left, under the pinned name column.
    <span ref={wrapRef} className="relative z-[5] ml-auto block w-full min-w-[8.5rem]">
      {isPercent ? null : (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-zinc-500">
          $
        </span>
      )}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        aria-label={label}
        aria-invalid={invalid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit('blur')}
        onKeyDown={onKeyDown}
        className={
          'h-9 w-full rounded-lg border-0 bg-zinc-950 text-right text-zinc-100 ring-1 ring-inset focus:outline focus:outline-2 ' +
          (invalid ? 'ring-red-500/70 focus:outline-red-400 ' : 'ring-zinc-700 focus:outline-emerald-400 ') +
          (isPercent ? 'pr-6 pl-2' : 'pr-2 pl-5')
        }
      />
      {isPercent ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-zinc-500">
          %
        </span>
      ) : null}
    </span>
  )
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function ColumnsIcon() {
  return (
    <svg {...iconProps} strokeWidth={1.75} className="size-4">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg {...iconProps} strokeWidth={1.75} className="size-4">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function BoltIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg {...iconProps} strokeWidth={2} className={`${className} shrink-0`}>
      <path d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg {...iconProps} strokeWidth={2.2} className="size-[18px]">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg {...iconProps} strokeWidth={2} className="size-3">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
  )
}
