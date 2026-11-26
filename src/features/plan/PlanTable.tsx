import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import {
  PLAN_COLUMN_LABELS,
  PLAN_NOTE_ICON_LABEL,
  PLAN_PAID_BY_LABELS,
  PLAN_SECTION_LABELS,
  PLAN_TABLE_ARIA_LABEL,
  PLAN_TAKE_HOME_LABEL,
  PLAN_UNPLANNED_LABEL,
  PLAN_VIEW_LABEL,
  planAddLineAriaLabel,
  planCellAriaLabel,
  planLineDetailsAriaLabel,
} from '@/lib/brand'
import { lineYearlyUnits, type PlanSection, type PlanTotals } from '@/lib/planMath'
import { PLAN_SECTIONS, type PlanColumn, type PlanLine } from '@/lib/plan'
import { canEditColumn, cellText, planCellButtonId, type PlanCellEdit } from './planCells'



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
  onAdd: (section: PlanSection) => void
  onOpenView: () => void
}

/**
 * The plan as a spreadsheet-like table: line names pinned left, the header and
 * Unplanned pinned on top, numbers scrolling both ways. Reads like a paycheck:
 * Income → Withheld → Take-home → Bills → Buckets (docs/PLAN.md § The table).
 */
export default function PlanTable(props: Props) {
  const { lines, totals, columns, compact, canEdit, flashIds, masked } = props
  const gross = totals.grossCents

  const nameW = compact ? 'w-[120px]' : 'w-[150px]'
  const cellW = compact ? 'w-[88px] text-[12px]' : 'w-[108px] text-[13px]'
  const nameCell = `sticky left-0 z-10 ${nameW} shrink-0 border-r border-zinc-800`
  const numCell = `${cellW} shrink-0 px-3 text-right tabular-nums whitespace-nowrap`
  // Line cells hold a full-width button or input, so they pad less.
  const lineCell = `${cellW} shrink-0 px-1 text-right tabular-nums whitespace-nowrap`

  const unplanned = totals.unplannedUnits
  const unplannedTone =
    unplanned === 0n ? 'text-emerald-300' : unplanned < 0n ? 'text-red-300' : 'text-zinc-100'

  return (
    <div
      role="table"
      aria-label={PLAN_TABLE_ARIA_LABEL}
      className="max-h-[min(72dvh,52rem)] overflow-auto overscroll-contain rounded-2xl bg-zinc-950 ring-1 ring-zinc-800"
    >
      <div className="w-max min-w-full">
        <div role="rowgroup" className="sticky top-0 z-20">
          <div role="row" className="flex min-h-11 items-stretch border-b border-zinc-800 bg-zinc-900">
            <div role="columnheader" className={`${nameCell} flex items-center bg-zinc-900 px-1.5`}>
              <button
                type="button"
                onClick={props.onOpenView}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 text-[13px] font-semibold text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                <ColumnsIcon />
                {PLAN_VIEW_LABEL}
              </button>
            </div>
            {columns.map((column) => (
              <div
                key={column}
                role="columnheader"
                className={`${numCell} flex items-center justify-end text-[12px] font-semibold leading-tight text-zinc-400`}
              >
                <span className="whitespace-normal">{PLAN_COLUMN_LABELS[column]}</span>
              </div>
            ))}
          </div>
          <div role="row" className="flex min-h-11 items-stretch border-b border-zinc-700 bg-zinc-900">
            <div role="rowheader" className={`${nameCell} flex items-center bg-zinc-900 px-3 text-sm font-bold text-zinc-100`}>
              {PLAN_UNPLANNED_LABEL}
            </div>
            {columns.map((column) => (
              <div
                key={column}
                role="cell"
                className={`${numCell} flex items-center justify-end text-sm font-bold ${unplannedTone}`}
              >
                {cellText(unplanned, column, gross, masked)}
              </div>
            ))}
          </div>
        </div>

        {PLAN_SECTIONS.map((section) => (
          <div role="rowgroup" key={section} className="mt-2.5">
            <SectionHeader
              section={section}
              subtotal={totals.sections[section]}
              {...{ columns, gross, masked, canEdit, nameCell, numCell }}
              onAdd={props.onAdd}
            />
            {lines
              .filter((line) => line.section === section)
              .map((line) => (
                <LineRow key={line.id} line={line} flash={flashIds.has(line.id)} {...props} nameCell={nameCell} numCell={lineCell} />
              ))}
            {section === 'withheld' ? (
              <TotalRow
                label={PLAN_TAKE_HOME_LABEL}
                units={totals.takeHomeUnits}
                {...{ columns, gross, masked, nameCell, numCell }}
              />
            ) : null}
          </div>
        ))}
        <div className="h-4" />
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
  nameCell,
  numCell,
  onAdd,
}: {
  section: PlanSection
  subtotal: bigint
  columns: readonly PlanColumn[]
  gross: bigint
  masked: boolean
  canEdit: boolean
  nameCell: string
  numCell: string
  onAdd: (section: PlanSection) => void
}) {
  return (
    <div role="row" className="flex min-h-11 items-stretch border-y border-zinc-800 bg-zinc-900">
      <div role="rowheader" className={`${nameCell} flex items-center justify-between bg-zinc-900 pl-3`}>
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          {PLAN_SECTION_LABELS[section]}
        </span>
        {canEdit ? (
          <button
            type="button"
            onClick={() => onAdd(section)}
            aria-label={planAddLineAriaLabel(section)}
            className="flex size-11 items-center justify-center rounded-lg text-emerald-300 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            <PlusIcon />
          </button>
        ) : null}
      </div>
      {columns.map((column) => (
        <div key={column} role="cell" className={`${numCell} flex items-center justify-end font-bold text-zinc-200`}>
          {cellText(subtotal, column, gross, masked)}
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
  nameCell,
  numCell,
}: {
  label: string
  units: bigint
  columns: readonly PlanColumn[]
  gross: bigint
  masked: boolean
  nameCell: string
  numCell: string
}) {
  return (
    <div role="row" className="mt-2.5 flex min-h-11 items-stretch border-y border-zinc-700 bg-zinc-900">
      <div role="rowheader" className={`${nameCell} flex items-center bg-zinc-900 px-3 text-sm font-bold text-zinc-100`}>
        {label}
      </div>
      {columns.map((column) => (
        <div key={column} role="cell" className={`${numCell} flex items-center justify-end text-sm font-bold text-zinc-100`}>
          {cellText(units, column, gross, masked)}
        </div>
      ))}
    </div>
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
  nameCell,
  numCell,
}: Props & { line: PlanLine; flash: boolean; nameCell: string; numCell: string }) {
  const gross = totals.grossCents
  const yearly = lineYearlyUnits(line, gross)
  const name = lineName(line)

  return (
    // `isolate`: the glow stays inside this row, never over the pinned header.
    <div role="row" className="relative isolate flex min-h-11 items-stretch border-b border-zinc-900">
      {flash ? (
        <span aria-hidden="true" className="plan-row-flash pointer-events-none absolute inset-0 z-20 bg-emerald-500/20" />
      ) : null}
      <div role="rowheader" className={`${nameCell} flex bg-zinc-950`}>
        {lineHasDetails(line) ? (
          <button
            type="button"
            onClick={() => onOpenLine(line)}
            aria-label={planLineDetailsAriaLabel(name)}
            className="flex w-full min-w-0 flex-col items-start justify-center gap-0.5 px-3 py-1.5 text-left text-[13px] leading-tight text-zinc-300 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400"
          >
            <LineLabel name={name} hasNote={lineHasNote(line)} paidBy={line.paidBy} />
          </button>
        ) : (
          <span className="flex w-full min-w-0 flex-col items-start justify-center gap-0.5 px-3 py-1.5 text-[13px] leading-tight text-zinc-300">
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
                'h-9 w-full rounded-lg px-2 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ' +
                (isInput
                  ? 'bg-zinc-950 text-zinc-200 ring-1 ring-inset ring-zinc-700'
                  : 'text-zinc-400 hover:bg-zinc-900')
              }
            >
              {text}
            </button>
          )
        } else {
          content = <span className={'px-2 ' + (isInput ? 'text-zinc-100' : 'text-zinc-400')}>{text}</span>
        }
        return (
          <div key={column} role="cell" className={`${numCell} flex items-center justify-end`}>
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
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
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
    <span className="relative z-[5] ml-auto block w-full min-w-[8.5rem]">
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
