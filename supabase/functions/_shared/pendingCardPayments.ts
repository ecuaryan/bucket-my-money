// =====================================================================
// Pending credit-card payments (docs/CREDIT_CARDS.md § Pending payments).
//
// Problem: cash and card balances come from independent feeds. While a card
// payment is pending, the bank may already have taken it out of checking, but
// the card still reports the old amount — so `cash − card debt` subtracts the
// payment twice until it posts (Unbucketed dips, sometimes red).
//
// This module decides, from signals Plaid gives for EVERY bank (pending flag,
// category, current vs. available balance), how much of each card's debt is
// already covered by an in-flight payment. It is deliberately conservative:
// whenever the evidence is ambiguous it returns 0, which leaves the honest raw
// balances — the same temporary dip you get today, never a new wrong number.
//
// Pure TS, no imports and no Deno/DOM APIs: it runs in the Edge Functions and
// is unit-tested from src/lib/pendingCardPayments.test.ts.
// =====================================================================

/** Plaid personal_finance_category.detailed for a card payment sent from a bank account. */
export const CARD_PAYMENT_CATEGORY = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'

/**
 * off      — never net (kill switch).
 * strict   — net only when BOTH sides show the same in-flight payment: a pending
 *            card-payment debit on a cash account AND a pending credit of the
 *            same amount on the card. Never overstates your money. (Default.)
 * standard — also net when only the cash side shows it, if exactly one card can
 *            be the target. Covers issuers that don't show pending payments, at
 *            the cost of being optimistic if the bank's balance turns out not to
 *            include the pending debit.
 */
export type PendingNettingMode = 'off' | 'strict' | 'standard'

export function parseNettingMode(raw: string | null | undefined): PendingNettingMode {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'off' || v === 'standard') return v
  return 'strict'
}

/** Signals older than this are ignored (a failed sync must not leave a stale adjustment). */
export const MAX_SIGNAL_AGE_MS = 12 * 60 * 60 * 1000

/** A posted card credit this close (days) after the payment means the card already reflects it. */
const POSTED_MATCH_SLACK_DAYS = 2

const EPS = 0.01

export type PendingOutflow = {
  /** Positive amount of money leaving the account. */
  amount: number
  /** YYYY-MM-DD */
  date: string
  /** Plaid categorised it as a credit-card payment. */
  cardPayment: boolean
}

export type CardCredit = {
  /** Positive magnitude of money paid/credited to the card. */
  amount: number
  /** YYYY-MM-DD */
  date: string
  pending: boolean
}

export type CashSignals = {
  kind: 'cash'
  accountId: string
  current: number
  available: number | null
  pendingOutflows: PendingOutflow[]
  /** Total of pending inflows (positive magnitude). */
  pendingInflowTotal: number
  observedAt: string
}

export type CardSignals = {
  kind: 'card'
  accountId: string
  /** Positive = owed (the app's stored convention). */
  debt: number
  credits: CardCredit[]
  observedAt: string
}

export type AccountSignals = CashSignals | CardSignals

const close = (a: number, b: number) => Math.abs(a - b) <= EPS

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000)
}

/**
 * Does this cash account's balance already include its pending debits?
 *
 * Plaid's `available` is typically `current` minus pending outflows (plus
 * pending inflows). So when pending activity exists:
 *   available ≈ current − net pending  → `current` leaves pending OUT (no overlap)
 *   available ≈ current                → `current` already includes pending
 * Anything else, or a missing `available`, is "unknown" → treated as not
 * included, which means no adjustment.
 */
export function cashBalanceIncludesPending(cash: CashSignals): boolean {
  if (cash.available == null || !Number.isFinite(cash.available)) return false
  const pendingOut = cash.pendingOutflows.reduce((sum, p) => sum + p.amount, 0)
  const net = pendingOut - cash.pendingInflowTotal
  if (net <= EPS) return false
  return close(cash.current, cash.available)
}

function postedCreditCoversPayment(card: CardSignals, payment: PendingOutflow): boolean {
  const paidOn = dayNumber(payment.date)
  return card.credits.some(
    (c) =>
      !c.pending &&
      close(c.amount, payment.amount) &&
      dayNumber(c.date) >= paidOn - POSTED_MATCH_SLACK_DAYS,
  )
}

function matchCard(
  payment: PendingOutflow,
  cards: CardSignals[],
  mode: PendingNettingMode,
): CardSignals | null {
  const candidates = cards.filter(
    (c) => c.debt >= payment.amount - EPS && !postedCreditCoversPayment(c, payment),
  )

  // Both sides agree on the same in-flight payment: the only match we trust fully.
  const confirmed = candidates.filter((c) =>
    c.credits.some((cr) => cr.pending && close(cr.amount, payment.amount)),
  )
  if (confirmed.length === 1) return confirmed[0]
  if (confirmed.length > 1 || mode !== 'standard') return null

  // standard: cash side only — require an unambiguous target.
  const exact = candidates.filter((c) => close(c.debt, payment.amount))
  if (exact.length === 1) return exact[0]
  return candidates.length === 1 ? candidates[0] : null
}

/**
 * Amount of each card's debt that an in-flight payment already covers
 * (cardAccountId → amount ≥ 0). Cards with nothing netted are present with 0.
 */
export function computeCardNetting(
  signals: AccountSignals[],
  now: Date,
  mode: PendingNettingMode = 'strict',
): Map<string, number> {
  const fresh = signals.filter(
    (s) => now.getTime() - Date.parse(s.observedAt) <= MAX_SIGNAL_AGE_MS,
  )
  const cards = fresh.filter((s): s is CardSignals => s.kind === 'card')
  const result = new Map<string, number>(
    signals.filter((s) => s.kind === 'card').map((s) => [s.accountId, 0]),
  )
  if (mode === 'off') return result

  const debtBearing = cards.filter((c) => c.debt > EPS)
  for (const cash of fresh) {
    if (cash.kind !== 'cash' || !cashBalanceIncludesPending(cash)) continue
    for (const payment of cash.pendingOutflows) {
      if (!payment.cardPayment) continue
      const card = matchCard(payment, debtBearing, mode)
      if (card) {
        result.set(card.accountId, (result.get(card.accountId) ?? 0) + payment.amount)
      }
    }
  }

  // Never net more than the card owes.
  for (const card of cards) {
    const sum = result.get(card.accountId) ?? 0
    result.set(card.accountId, Math.round(Math.min(sum, Math.max(card.debt, 0)) * 100) / 100)
  }
  return result
}

// ---------------------------------------------------------------------
// Plaid payload → signals
// ---------------------------------------------------------------------

export type PlaidTxnLike = {
  account_id: string
  /** Plaid: positive = money OUT of the account. */
  amount: number
  date: string
  pending: boolean
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null
}

export function isCardPaymentCategory(
  category: PlaidTxnLike['personal_finance_category'],
): boolean {
  return (category?.detailed ?? '').toUpperCase() === CARD_PAYMENT_CATEGORY
}

export function cashSignalsFromPlaid(args: {
  accountId: string
  plaidAccountId: string
  current: number
  available: number | null
  transactions: PlaidTxnLike[]
  observedAt: string
}): CashSignals {
  const pending = args.transactions.filter(
    (t) => t.account_id === args.plaidAccountId && t.pending,
  )
  return {
    kind: 'cash',
    accountId: args.accountId,
    current: args.current,
    available: args.available,
    pendingOutflows: pending
      .filter((t) => t.amount > 0)
      .map((t) => ({
        amount: t.amount,
        date: t.date,
        cardPayment: isCardPaymentCategory(t.personal_finance_category),
      })),
    pendingInflowTotal: pending
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum - t.amount, 0),
    observedAt: args.observedAt,
  }
}

export function cardSignalsFromPlaid(args: {
  accountId: string
  plaidAccountId: string
  /** Positive = owed. */
  debt: number
  transactions: PlaidTxnLike[]
  observedAt: string
}): CardSignals {
  return {
    kind: 'card',
    accountId: args.accountId,
    debt: args.debt,
    credits: args.transactions
      .filter((t) => t.account_id === args.plaidAccountId && t.amount < 0)
      .map((t) => ({ amount: -t.amount, date: t.date, pending: t.pending })),
    observedAt: args.observedAt,
  }
}
