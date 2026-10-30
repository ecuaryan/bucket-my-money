import {
  FLOAT_TILE_BALANCE_LABEL,
  FLOAT_TILE_CARDS_LABEL,
  floatTileCardsPendingNote,
  BREAKDOWN_CARD_DEBT_LABEL,
  BREAKDOWN_CASH_LABEL,
  BREAKDOWN_LINKED_CASH_LABEL,
  BREAKDOWN_MANUAL_CASH_LABEL,
  floatCardsSubtextClause,
  floatSourcesCountText,
} from '@/lib/brand'
import type { BucketsBalanceBreakdown } from '@/lib/availableBalance'

export type BreakdownLine = {
  key: string
  label: string
  amount: number
  kind: 'add' | 'subtract'
  indent?: boolean
}

export type FloatSummary = {
  label: string
  amount: number
  /** When set, rendered as "<money> <countText>" (e.g. "across 2 sources"). */
  countText?: string
}

type BuildOpts = {
  isChild: boolean
  cashAccountsCount: number
  bankAccountsCount: number
  manualAccountsCount: number
  childTotal: number
}

export function buildFloatLines(
  breakdown: BucketsBalanceBreakdown,
  opts: BuildOpts,
): BreakdownLine[] {
  const lines: BreakdownLine[] = []

  if (opts.isChild) {
    if (opts.childTotal > 0) {
      lines.push({
        key: 'total-balance',
        label: 'Total balance',
        amount: opts.childTotal,
        kind: 'add',
      })
    }
    if (breakdown.bucketAllocated > 0) {
      lines.push({
        key: 'in-buckets',
        label: 'In your buckets',
        amount: breakdown.bucketAllocated,
        kind: 'subtract',
      })
    }
    return lines
  }

  if (breakdown.manualCash > 0) {
    if (breakdown.bankCash > 0) {
      const bankSuffix =
        opts.bankAccountsCount > 0
          ? ` (${opts.bankAccountsCount} account${opts.bankAccountsCount === 1 ? '' : 's'})`
          : ''
      lines.push({
        key: 'bank-cash',
        label: `${BREAKDOWN_LINKED_CASH_LABEL}${bankSuffix}`,
        amount: breakdown.bankCash,
        kind: 'add',
      })
    }
    const manualSuffix =
      opts.manualAccountsCount > 1
        ? ` (${opts.manualAccountsCount} sources)`
        : ''
    // "Manual cash" only earns its qualifier when there is bank cash to
    // distinguish it from; on its own it is just the household's cash.
    const manualLabel =
      breakdown.bankCash > 0 ? BREAKDOWN_MANUAL_CASH_LABEL : BREAKDOWN_CASH_LABEL
    lines.push({
      key: 'manual-cash',
      label: `${manualLabel}${manualSuffix}`,
      amount: breakdown.manualCash,
      kind: 'add',
    })
  } else if (breakdown.totalCash > 0) {
    const accountSuffix =
      opts.cashAccountsCount > 0
        ? ` (${opts.cashAccountsCount} account${opts.cashAccountsCount === 1 ? '' : 's'})`
        : ''
    lines.push({
      key: 'linked-cash',
      label: `${BREAKDOWN_LINKED_CASH_LABEL}${accountSuffix}`,
      amount: breakdown.totalCash,
      kind: 'add',
    })
  }

  if (breakdown.cardDebt > 0) {
    lines.push({
      key: 'card-debt',
      label: BREAKDOWN_CARD_DEBT_LABEL,
      amount: breakdown.cardDebt,
      kind: 'subtract',
    })
  }

  if (breakdown.bucketAllocated > 0) {
    lines.push({
      key: 'allocated',
      label: 'Allocated to buckets',
      amount: breakdown.bucketAllocated,
      kind: 'subtract',
    })
  }

  if (breakdown.children.length > 0) {
    const childrenTotal = breakdown.children.reduce(
      (sum, child) => sum + child.amount,
      0,
    )
    lines.push({
      key: 'children-total',
      label: 'Set aside for kids',
      amount: childrenTotal,
      kind: 'subtract',
    })
    for (const child of breakdown.children) {
      lines.push({
        key: `child-${child.memberId}`,
        label: child.name,
        amount: child.amount,
        kind: 'subtract',
        indent: true,
      })
    }
  }

  return lines
}

export function floatSummary(
  breakdown: BucketsBalanceBreakdown,
  opts: BuildOpts,
): FloatSummary | null {
  if (opts.isChild) {
    if (opts.childTotal <= 0) return null
    return { label: 'Total balance', amount: opts.childTotal }
  }

  if (breakdown.totalCash <= 0) return null

  return {
    label: BREAKDOWN_CASH_LABEL,
    amount: breakdown.totalCash,
    countText: floatSourcesCountText(opts.cashAccountsCount),
  }
}

export function formatFloatSummary(
  summary: FloatSummary,
  formatMoney: (amount: number) => string,
): string {
  if (summary.countText) {
    return `${formatMoney(summary.amount)} ${summary.countText}`
  }
  return `${summary.label}: ${formatMoney(summary.amount)}`
}

/** Flat Unbucketed hero subtext — cash context only (no allocations or kids). */
export function formatFloatCashSubtext(
  breakdown: BucketsBalanceBreakdown,
  opts: BuildOpts,
  formatMoney: (amount: number) => string,
): string | null {
  if (opts.isChild) {
    if (opts.childTotal <= 0) return null
    if (breakdown.bankCash > 0 && opts.bankAccountsCount > 0) {
      const suffix =
        opts.bankAccountsCount === 1
          ? 'linked account'
          : `${opts.bankAccountsCount} linked accounts`
      return `${formatMoney(breakdown.bankCash)} across ${suffix}`
    }
    return formatFloatSummary(
      { label: 'Total balance', amount: opts.childTotal },
      formatMoney,
    )
  }

  if (breakdown.totalCash <= 0) return null

  const cardsClause =
    breakdown.cardDebt > 0
      ? ` ${floatCardsSubtextClause(
          formatMoney(breakdown.cardDebt),
          breakdown.cardPendingPayments > 0
            ? formatMoney(breakdown.cardPendingPayments)
            : undefined,
        )}`
      : ''

  if (breakdown.bankCash > 0 && breakdown.manualCash > 0) {
    return `${formatMoney(breakdown.bankCash)} linked · ${formatMoney(breakdown.manualCash)} manual${cardsClause}`
  }

  const summary = floatSummary(breakdown, opts)
  if (!summary) return null
  return `${formatFloatSummary(summary, formatMoney)}${cardsClause}`
}

export function formatBucketsHeaderSubtitle(
  bucketCount: number,
  bucketAllocated: number,
  formatMoney: (amount: number) => string,
): string {
  const count = `${bucketCount} bucket${bucketCount === 1 ? '' : 's'}`
  if (bucketAllocated <= 0) return count
  return `${count} · ${formatMoney(bucketAllocated)} allocated`
}

/**
 * Whether the red Unbucketed shortfall could be a card payment still posting
 * (cash already down, card not yet): a card is counted, the shortfall is no
 * bigger than what the cards owe, and no payment is already being netted (that
 * case has its own message). A household without cards, or one that is simply
 * over-bucketed by more than its card debt, never sees it.
 */
export function mayBeCardPaymentLag(
  float: number,
  breakdown: Pick<BucketsBalanceBreakdown, 'cardDebt' | 'cardPendingPayments'>,
): boolean {
  return (
    float < 0 &&
    breakdown.cardDebt > 0 &&
    breakdown.cardPendingPayments === 0 &&
    -float <= breakdown.cardDebt
  )
}

export type FloatHeroTile = {
  label: string
  value: string
  /** Optional second line under the value. */
  caption: string | null
}

/**
 * Hero stat tiles for adults with credit cards: cash on the left, card debt on
 * the right. They replace the one-line cash sentence (same numbers, easier to
 * scan). Null when there is nothing to split — no cards, no cash, or a child.
 */
export function floatHeroTiles(
  breakdown: BucketsBalanceBreakdown,
  opts: BuildOpts,
  formatMoney: (amount: number) => string,
): { cash: FloatHeroTile; cards: FloatHeroTile } | null {
  if (opts.isChild) return null
  if (breakdown.totalCash <= 0 || breakdown.cardDebt <= 0) return null

  const cashCaption =
    breakdown.bankCash > 0 && breakdown.manualCash > 0
      ? `${formatMoney(breakdown.bankCash)} linked · ${formatMoney(breakdown.manualCash)} manual`
      : (floatSourcesCountText(opts.cashAccountsCount) ?? null)

  return {
    cash: {
      label: FLOAT_TILE_BALANCE_LABEL,
      value: formatMoney(breakdown.totalCash),
      caption: cashCaption,
    },
    cards: {
      label: FLOAT_TILE_CARDS_LABEL,
      value: formatMoney(breakdown.cardDebt),
      caption:
        breakdown.cardPendingPayments > 0
          ? floatTileCardsPendingNote(formatMoney(breakdown.cardPendingPayments))
          : null,
    },
  }
}
