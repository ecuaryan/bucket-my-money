import { AUTO_ORGANIZE_RUN_NOW_AFTER_LABEL, AUTO_ORGANIZE_RUN_NOW_CURRENT_LABEL, AUTO_ORGANIZE_RUN_NOW_MOVE_LABEL } from '@/lib/brand'

const runNowAmountGridClassName =
  'grid grid-cols-[minmax(0,1fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_minmax(4rem,1fr)] items-baseline gap-x-2 px-2.5'

const runNowAmountHeaderClassName =
  'text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500'

const runNowAmountCellClassName =
  'text-right text-xs tabular-nums tracking-tight'

export function RunNowAmountHeader() {
  return (
    <div className={`${runNowAmountGridClassName} mb-1`} aria-hidden>
      <span />
      <span className={runNowAmountHeaderClassName}>
        {AUTO_ORGANIZE_RUN_NOW_CURRENT_LABEL}
      </span>
      <span className={runNowAmountHeaderClassName}>
        {AUTO_ORGANIZE_RUN_NOW_MOVE_LABEL}
      </span>
      <span className={runNowAmountHeaderClassName}>
        {AUTO_ORGANIZE_RUN_NOW_AFTER_LABEL}
      </span>
    </div>
  )
}

export function RunNowAmountRow({
  label,
  before,
  move,
  after,
  formatMoney,
  moveOut = false,
  as: Tag = 'li',
}: {
  label: string
  before: number
  move: number
  after: number
  formatMoney: (amount: number) => string
  moveOut?: boolean
  as?: 'li' | 'div'
}) {
  const moveClassName = moveOut ? 'text-rose-400' : 'text-emerald-400'
  const movePrefix = moveOut ? '−' : '+'

  return (
    <Tag
      className={
        // Striped like the card's bucket list.
        `${runNowAmountGridClassName} rounded-lg py-1.5` +
        (Tag === 'li' ? ' odd:bg-zinc-800/50' : '')
      }
    >
      <span className="truncate text-sm font-semibold text-zinc-300">{label}</span>
      <span className={`${runNowAmountCellClassName} text-zinc-500`}>
        {formatMoney(before)}
      </span>
      <span className={`${runNowAmountCellClassName} ${moveClassName}`}>
        {movePrefix} {formatMoney(move)}
      </span>
      <span className={`${runNowAmountCellClassName} text-zinc-400`}>
        {formatMoney(after)}
      </span>
    </Tag>
  )
}
