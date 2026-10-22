/**
 * Turns the optional per-transaction detail the bank connector returned into the
 * label/value rows the Bank tab shows when you tap a transaction. Blank or
 * redundant fields never produce a row, so a bank that returns little simply
 * shows little (and a transaction with nothing extra isn't expandable).
 */
import { BANK_TXN_DETAIL_LABELS } from '@/lib/brand'
import type { BankTransactionRow } from '@/lib/bankLink'

export type DetailRow = { key: string; label: string; value: string }

function sentenceCase(raw: string): string {
  const text = raw.replace(/_/g, ' ').trim().toLowerCase()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

/**
 * Plaid's category codes, made readable:
 * LOAN_PAYMENTS + LOAN_PAYMENTS_CREDIT_CARD_PAYMENT → "Loan payments › Credit card payment".
 */
export function humanizeCategory(
  primary: string | null,
  detailed: string | null,
): string | null {
  const main = primary ? sentenceCase(primary) : ''
  let sub = ''
  if (detailed) {
    const prefix = primary ? `${primary.toUpperCase()}_` : ''
    const rest =
      prefix && detailed.toUpperCase().startsWith(prefix)
        ? detailed.slice(prefix.length)
        : detailed
    sub = sentenceCase(rest)
  }
  if (main && sub && sub !== main) return `${main} › ${sub}`
  return main || sub || null
}

export function humanizeCounterpartyType(type: string | null): string | null {
  return type ? sentenceCase(type) : null
}

export function transactionDetailRows(
  row: Pick<BankTransactionRow, 'details' | 'status' | 'date' | 'label'>,
  formatDate: (isoDate: string) => string,
): DetailRow[] {
  const d = row.details
  if (!d) return []
  const L = BANK_TXN_DETAIL_LABELS
  const rows: DetailRow[] = []
  const add = (key: string, label: string, value: string | null | undefined) => {
    if (value && value.trim()) rows.push({ key, label, value: value.trim() })
  }

  add('description', L.description, d.description)
  if (d.category) {
    add('category', L.category, humanizeCategory(d.category.primary, d.category.detailed))
  }
  if (d.counterparty) {
    const kind = humanizeCounterpartyType(d.counterparty.type)
    const same = d.counterparty.name.trim().toLowerCase() === row.label.trim().toLowerCase()
    add(
      'counterparty',
      L.counterparty,
      same ? kind : kind ? `${d.counterparty.name} · ${kind}` : d.counterparty.name,
    )
  }
  add('paymentChannel', L.paymentChannel, d.paymentChannel ? sentenceCase(d.paymentChannel) : null)
  add('location', L.location, d.location)
  if (d.authorizedDate) add('authorized', L.authorized, formatDate(d.authorizedDate))
  if (row.status === 'posted' && d.authorizedDate) add('posted', L.posted, formatDate(row.date))
  add('checkNumber', L.checkNumber, d.checkNumber)
  add('reference', L.reference, d.reference)
  add('payee', L.payee, d.payee)
  add('payer', L.payer, d.payer)
  add('paymentMethod', L.paymentMethod, d.paymentMethod ? sentenceCase(d.paymentMethod) : null)
  add('reason', L.reason, d.reason)
  add('currency', L.currency, d.currency)
  return rows
}

export function isExpandable(
  row: Pick<BankTransactionRow, 'details' | 'status' | 'date' | 'label'>,
): boolean {
  return transactionDetailRows(row, (d) => d).length > 0
}
