import { useId, useState } from 'react'
import RefreshIcon from '@/components/ui/RefreshIcon'
import {
  HERO_RADIUS,
  HERO_TONE_NEGATIVE,
  HERO_TONE_POSITIVE,
} from '@/components/ui/heroTone'
import type { FloatHeroTile, FloatMathRow } from '@/lib/floatBreakdown'
import {
  floatRefreshedLabel,
  FLOAT_MATH_CARDS_NOTE,
  FLOAT_MATH_TOGGLE_LABEL,
  FLOAT_REFRESH_BALANCES_LABEL,
} from '@/lib/brand'

type FloatHeroProps = {
  floatLabel: string
  amount: string
  /** Red treatment: more is bucketed (or owed on cards) than there is cash. */
  negative: boolean
  cashSubtext: string | null
  /** Total-balance tile (plus card-debt tile when owed); replaces the cash sentence. */
  tiles: { cash: FloatHeroTile; cards: FloatHeroTile | null } | null
  /** Total → buckets → kids → cards → Unbucketed, behind a quiet toggle. */
  math: FloatMathRow[] | null
  hint: string | null
  bankSyncedLabel: string | null
  canRefresh: boolean
  syncing: boolean
  refreshError: string | null
  onRefresh: () => void
}

function floatRefreshAriaLabel(bankSyncedLabel: string | null): string {
  if (bankSyncedLabel) {
    return `${FLOAT_REFRESH_BALANCES_LABEL} · last updated ${bankSyncedLabel}`
  }
  return FLOAT_REFRESH_BALANCES_LABEL
}

function floatRefreshVisibleLabel(bankSyncedLabel: string | null): string {
  if (bankSyncedLabel) {
    return floatRefreshedLabel(bankSyncedLabel)
  }
  return FLOAT_REFRESH_BALANCES_LABEL
}

function MathRows({ rows }: { rows: FloatMathRow[] }) {
  return (
    <div className="mt-2 rounded-[13px] bg-black/30 px-3 py-2.5 ring-1 ring-inset ring-white/5">
      <dl className="space-y-1 text-[12.5px]">
        {rows.map((row) => (
          <div
            key={row.key}
            className={
              'flex items-baseline justify-between gap-4 tabular-nums ' +
              (row.kind === 'result'
                ? 'mt-1.5 border-t border-white/10 pt-2 font-semibold text-zinc-100 '
                : 'text-zinc-300 ') +
              (row.indent ? 'pl-3 text-[12px] text-zinc-500' : '')
            }
          >
            <dt className="min-w-0">
              {row.label}
              {row.note ? (
                <span className="block text-[10.5px] font-normal leading-[1.35] text-zinc-500">
                  {row.note}
                </span>
              ) : null}
            </dt>
            <dd className="shrink-0">
              {row.kind === 'minus' ? '− ' : row.kind === 'result' ? '= ' : ''}
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {rows.some((row) => row.key === 'cards') ? (
        <p className="mt-2 text-[11px] leading-[1.4] text-zinc-500">
          {FLOAT_MATH_CARDS_NOTE}
        </p>
      ) : null}
    </div>
  )
}

function StatTile({
  tile,
  accent = false,
}: {
  tile: FloatHeroTile
  accent?: boolean
}) {
  return (
    <div className="min-w-0 rounded-[13px] bg-black/30 px-2.5 py-2 ring-1 ring-inset ring-white/5">
      <p className="text-[11px] leading-4 text-zinc-400">{tile.label}</p>
      <p
        className={
          'mt-0.5 text-base font-semibold leading-5 tabular-nums tracking-tight ' +
          (accent ? 'text-amber-300' : 'text-zinc-100')
        }
      >
        {tile.value}
      </p>
      {tile.caption ? (
        <p className="mt-0.5 text-[10.5px] leading-[1.35] text-zinc-500">
          {tile.caption}
        </p>
      ) : null}
    </div>
  )
}

export default function FloatHero({
  floatLabel,
  amount,
  negative,
  cashSubtext,
  tiles,
  math,
  hint,
  bankSyncedLabel,
  canRefresh,
  syncing,
  refreshError,
  onRefresh,
}: FloatHeroProps) {
  const [mathOpen, setMathOpen] = useState(false)
  const mathId = useId()
  return (
    <section
      className={
        `${HERO_RADIUS} px-4 pt-3.5 pb-4 ` +
        (negative ? HERO_TONE_NEGATIVE : HERO_TONE_POSITIVE)
      }
      aria-label={`${floatLabel} balance`}
    >
      <div className="flex min-h-6 items-center justify-between gap-3">
        <p className="text-[11.5px] font-semibold uppercase leading-4 tracking-[0.1em] opacity-75">
          {floatLabel}
        </p>
        {canRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={syncing}
            aria-label={floatRefreshAriaLabel(bankSyncedLabel)}
            className={
              '-my-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 ' +
              'text-[11.5px] leading-4 opacity-70 transition hover:opacity-100 ' +
              'disabled:cursor-not-allowed disabled:opacity-40'
            }
          >
            <span className="whitespace-nowrap">
              {floatRefreshVisibleLabel(bankSyncedLabel)}
            </span>
            <RefreshIcon spinning={syncing} className="h-3 w-3 shrink-0" />
          </button>
        ) : null}
      </div>
      <p
        className={
          'mt-1 text-[32px] font-bold leading-[1.15] tracking-tight tabular-nums ' +
          (negative ? 'text-red-200' : 'text-emerald-300')
        }
      >
        {amount}
      </p>
      {hint ? (
        <p className="mt-1.5 text-[12.5px] leading-[1.4] opacity-75">{hint}</p>
      ) : null}
      {cashSubtext ? (
        <p className="mt-1.5 text-[12.5px] leading-[1.4] opacity-75">
          {cashSubtext}
        </p>
      ) : null}
      {tiles ? (
        <div className={'mt-3 grid gap-2 ' + (tiles.cards ? 'grid-cols-2' : 'grid-cols-1')}>
          <StatTile tile={tiles.cash} />
          {tiles.cards ? <StatTile tile={tiles.cards} accent /> : null}
        </div>
      ) : null}
      {math ? (
        <>
          <button
            type="button"
            onClick={() => setMathOpen((open) => !open)}
            aria-expanded={mathOpen}
            aria-controls={mathId}
            className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] leading-4 opacity-70 transition hover:opacity-100"
          >
            {FLOAT_MATH_TOGGLE_LABEL}
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={'h-3 w-3 transition-transform ' + (mathOpen ? 'rotate-180' : '')}
            >
              <path d="m5 8 5 5 5-5" />
            </svg>
          </button>
          <div id={mathId} hidden={!mathOpen}>
            <MathRows rows={math} />
          </div>
        </>
      ) : null}
      {refreshError ? (
        <p className="mt-1.5 text-[11px] text-red-300/80">{refreshError}</p>
      ) : null}
    </section>
  )
}
