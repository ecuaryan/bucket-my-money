// =====================================================================
// Keeps accounts.pending_payment_credit current for Plaid cards
// (docs/CREDIT_CARDS.md § Pending payments).
//
// Called by the Plaid refresh paths AFTER balances are updated:
//   1. per Item: pull recent transactions once, derive each account's signals
//      (pending card-payment debits on cash, pending/posted credits on cards)
//      and store them in plaid_account_signals (service-role only);
//   2. per family: combine ALL signals — the checking account and the card may
//      sit on different Items — decide what each card's in-flight payments
//      cover (pendingCardPayments.ts), and write accounts.pending_payment_credit.
//
// Never throws and never blocks a balance refresh: any failure leaves the
// previous signals to age out (they are ignored after 12h), which restores
// the plain balances — the safe direction.
// =====================================================================

// @ts-nocheck — targets the Deno runtime, not the Vite TS build.

import { isCashAccountType, isCreditCardAccountType } from './cashAccountTypes.ts'
import { getItemTransactions, pickPlaidBalance } from './plaid.ts'
import {
  cardSignalsFromPlaid,
  cashSignalsFromPlaid,
  computeCardNetting,
  parseNettingMode,
} from './pendingCardPayments.ts'

/** Look back far enough for a payment to be pending, and for a credit to have posted. */
const LOOKBACK_DAYS = 10
const TRANSACTIONS_COUNT = 500
/** Webhook bursts: reuse signals fresher than this instead of re-pulling. */
const REUSE_WINDOW_MS = 3 * 60_000

export type PendingSyncItem = {
  accessToken: string
  /** Balances just fetched for this Item (current + available per account). */
  plaidAccounts: Array<{
    account_id: string
    balances: { current: number | null; available: number | null }
  }>
  /** This Item's accounts rows. */
  linked: Array<{ id: string; plaid_account_id: string; account_type: string }>
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function syncPendingCardPayments(
  admin: any,
  args: { familyId: string; items: PendingSyncItem[] },
): Promise<void> {
  try {
    const mode = parseNettingMode(Deno.env.get('PLAID_PENDING_NETTING'))
    const now = new Date()
    const nowIso = now.toISOString()

    if (mode !== 'off') {
      const end = new Date(now)
      const start = new Date(now)
      start.setUTCDate(start.getUTCDate() - (LOOKBACK_DAYS - 1))

      for (const item of args.items) {
        const counted = item.linked.filter(
          (a) => isCashAccountType(a.account_type) || isCreditCardAccountType(a.account_type),
        )
        if (counted.length === 0) continue
        try {
          const { data: recent } = await admin
            .from('plaid_account_signals')
            .select('observed_at')
            .in('account_id', counted.map((a) => a.id))
            .order('observed_at', { ascending: false })
            .limit(1)
          const last = recent?.[0]?.observed_at ? Date.parse(recent[0].observed_at) : 0
          if (now.getTime() - last < REUSE_WINDOW_MS) continue

          const transactions = await getItemTransactions(item.accessToken, {
            startDate: isoDateOnly(start),
            endDate: isoDateOnly(end),
            count: TRANSACTIONS_COUNT,
          })
          const byPlaidId = new Map(item.plaidAccounts.map((a) => [a.account_id, a]))

          const rows = []
          for (const account of counted) {
            const plaidAccount = byPlaidId.get(account.plaid_account_id)
            if (!plaidAccount) continue
            const current = pickPlaidBalance(plaidAccount.balances)
            const signals = isCreditCardAccountType(account.account_type)
              ? cardSignalsFromPlaid({
                  accountId: account.id,
                  plaidAccountId: account.plaid_account_id,
                  debt: current,
                  transactions,
                  observedAt: nowIso,
                })
              : cashSignalsFromPlaid({
                  accountId: account.id,
                  plaidAccountId: account.plaid_account_id,
                  current,
                  available: plaidAccount.balances.available,
                  transactions,
                  observedAt: nowIso,
                })
            rows.push({
              account_id: account.id,
              family_id: args.familyId,
              signals,
              observed_at: nowIso,
            })
          }
          if (rows.length > 0) {
            const { error } = await admin
              .from('plaid_account_signals')
              .upsert(rows, { onConflict: 'account_id' })
            if (error) console.error('plaid pending signals upsert', error.message)
          }
        } catch (err) {
          // PRODUCT_NOT_READY, timeouts, … — older signals simply age out.
          console.error('plaid pending signals fetch', err)
        }
      }
    }

    await recomputeFamilyNetting(admin, args.familyId, now, mode)
  } catch (err) {
    console.error('syncPendingCardPayments failed', err)
  }
}

/** Combine every signal for the family and write each Plaid card's credit. */
async function recomputeFamilyNetting(
  admin: any,
  familyId: string,
  now: Date,
  mode: 'off' | 'strict' | 'standard',
): Promise<void> {
  const { data: cards } = await admin
    .from('accounts')
    .select('id, pending_payment_credit')
    .eq('family_id', familyId)
    .eq('source', 'plaid')
    .eq('account_type', 'credit_card')
  if (!cards || cards.length === 0) return

  let netting = new Map<string, number>()
  if (mode !== 'off') {
    const { data: rows } = await admin
      .from('plaid_account_signals')
      .select('signals')
      .eq('family_id', familyId)
    const signals = (rows ?? []).map((r) => r.signals).filter(Boolean)
    netting = computeCardNetting(signals, now, mode)
  }

  for (const card of cards) {
    const next = netting.get(card.id) ?? 0
    if (Number(card.pending_payment_credit) === next) continue
    const { error } = await admin
      .from('accounts')
      .update({ pending_payment_credit: next })
      .eq('id', card.id)
    if (error) console.error('plaid pending credit update', card.id, error.message)
  }
}
