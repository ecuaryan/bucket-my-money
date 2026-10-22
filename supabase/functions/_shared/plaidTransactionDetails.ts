// =====================================================================
// Extra detail for a Plaid transaction, beyond the label/date/amount the Bank
// tab always showed. Pure TS with no imports (runs in Edge Functions and is
// unit-tested from src/lib/plaidTransactionDetails.test.ts).
//
// Only fields Plaid actually returned are included — most banks fill some and
// leave others empty, so every field is optional and blank values are dropped.
// Nothing here is persisted; it rides along in the on-demand activity response.
// =====================================================================

export type PlaidTxnFull = {
  amount: number
  date: string
  authorized_date?: string | null
  name?: string | null
  merchant_name?: string | null
  original_description?: string | null
  payment_channel?: string | null
  iso_currency_code?: string | null
  check_number?: string | null
  personal_finance_category?: {
    primary?: string | null
    detailed?: string | null
    confidence_level?: string | null
  } | null
  counterparties?: Array<{
    name?: string | null
    type?: string | null
  }> | null
  location?: {
    city?: string | null
    region?: string | null
    country?: string | null
  } | null
  payment_meta?: {
    reference_number?: string | null
    payee?: string | null
    payer?: string | null
    payment_method?: string | null
    reason?: string | null
  } | null
}

export type BankTransactionDetails = {
  /** The bank's own description of the transaction (raw statement text). */
  description?: string
  /** Day the transaction was authorized, when it differs from `date`. */
  authorizedDate?: string
  category?: { primary: string | null; detailed: string | null }
  /** 'online' | 'in store' | 'other' */
  paymentChannel?: string
  counterparty?: { name: string; type: string | null }
  /** "Austin, TX" */
  location?: string
  checkNumber?: string
  reference?: string
  payee?: string
  payer?: string
  paymentMethod?: string
  reason?: string
  /** ISO currency code, only when it isn't USD. */
  currency?: string
}

function clean(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed : undefined
}

export function mapPlaidTransactionDetails(
  txn: PlaidTxnFull,
  label: string,
): BankTransactionDetails {
  const out: BankTransactionDetails = {}

  // Raw statement text is the useful "more data" when it says more than the
  // merchant label we already show.
  const description = clean(txn.original_description) ?? clean(txn.name)
  if (description && description.toLowerCase() !== label.trim().toLowerCase()) {
    out.description = description
  }

  const authorized = clean(txn.authorized_date)
  if (authorized && authorized !== txn.date) out.authorizedDate = authorized

  const primary = clean(txn.personal_finance_category?.primary)
  const detailed = clean(txn.personal_finance_category?.detailed)
  if (primary || detailed) {
    out.category = { primary: primary ?? null, detailed: detailed ?? null }
  }

  const channel = clean(txn.payment_channel)
  if (channel) out.paymentChannel = channel

  const counterparty = (txn.counterparties ?? []).find((c) => clean(c.name))
  if (counterparty) {
    out.counterparty = {
      name: clean(counterparty.name)!,
      type: clean(counterparty.type) ?? null,
    }
  }

  const place = [clean(txn.location?.city), clean(txn.location?.region)]
    .filter(Boolean)
    .join(', ')
  const country = clean(txn.location?.country)
  const location = country && country.toUpperCase() !== 'US' && place
    ? `${place}, ${country}`
    : place
  if (location) out.location = location

  const check = clean(txn.check_number)
  if (check) out.checkNumber = check
  const meta = txn.payment_meta
  if (clean(meta?.reference_number)) out.reference = clean(meta?.reference_number)
  if (clean(meta?.payee)) out.payee = clean(meta?.payee)
  if (clean(meta?.payer)) out.payer = clean(meta?.payer)
  if (clean(meta?.payment_method)) out.paymentMethod = clean(meta?.payment_method)
  if (clean(meta?.reason)) out.reason = clean(meta?.reason)

  const currency = clean(txn.iso_currency_code)
  if (currency && currency.toUpperCase() !== 'USD') out.currency = currency

  return out
}
