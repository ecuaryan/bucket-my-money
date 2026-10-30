import RefreshIcon from '@/components/ui/RefreshIcon'
import type { FloatHeroTile } from '@/lib/floatBreakdown'
import {
  floatRefreshedLabel,
  FLOAT_REFRESH_BALANCES_LABEL,
} from '@/lib/brand'

type FloatHeroProps = {
  floatLabel: string
  amount: string
  /** Red treatment: more is bucketed (or owed on cards) than there is cash. */
  negative: boolean
  cashSubtext: string | null
  /** Cash + card-debt tiles (adults with cards); replace the cash sentence. */
  tiles: { cash: FloatHeroTile; cards: FloatHeroTile } | null
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

// A calm tint when there is room to spare; a deeper tint and brighter edge
// when the household has promised more than it has.
const TONE_POSITIVE =
  'bg-gradient-to-br from-emerald-500/[0.09] to-emerald-500/[0.03] text-emerald-300 ' +
  'shadow-[inset_0_0_0_1px_rgba(52,211,153,0.22),inset_0_1px_0_rgba(255,255,255,0.05),0_6px_16px_-10px_rgba(52,211,153,0.35)]'
const TONE_NEGATIVE =
  'bg-gradient-to-br from-red-500/20 to-red-500/[0.08] text-red-300 ' +
  'shadow-[inset_0_0_0_1px_rgba(248,113,113,0.45),inset_0_1px_0_rgba(255,255,255,0.06),0_6px_18px_-10px_rgba(248,113,113,0.5)]'

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
  hint,
  bankSyncedLabel,
  canRefresh,
  syncing,
  refreshError,
  onRefresh,
}: FloatHeroProps) {
  return (
    <section
      className={
        'rounded-[22px] px-4 pt-3.5 pb-4 ' + (negative ? TONE_NEGATIVE : TONE_POSITIVE)
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
        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatTile tile={tiles.cash} />
          <StatTile tile={tiles.cards} accent />
        </div>
      ) : null}
      {refreshError ? (
        <p className="mt-1.5 text-[11px] text-red-300/80">{refreshError}</p>
      ) : null}
    </section>
  )
}
