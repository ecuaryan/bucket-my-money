/** User-facing copy — Bank providers (SimpleFIN, Plaid, Teller), bank activity, refresh. Import from `@/lib/brand`. */

/** Footer link to the Buckets Bank tab — used from the Kids and Admin pages. */
export const VIEW_RECENT_BANK_ACTIVITY = 'View recent bank activity'

/** Always-shown lead for the Money sources section (banks + manual + cards). */
/** Tag for a family-pool / shared account on the Bank tab. */
export const BANK_ACCOUNT_SHARED_TAG = 'Shared'

/** Fallback tag when an assigned member's name is unknown. */
export const BANK_ACCOUNT_MEMBER_FALLBACK = 'Family member'

export const BANK_ACTIVITY_SCOPE = 'Last 2 weeks · up to 50 transactions'

export const BANK_ACTIVITY_RETRY = 'Try again'

export const BANK_ACTIVITY_EMPTY = 'No bank activity in the last 2 weeks.'

export const BANK_ACTIVITY_PENDING = 'Pending'

/**
 * Bank activity failed to load for a reason other than a dropped connection —
 * the bank/Teller returned an error, or our sync hit a temporary limit. Kept
 * friendly and honest ("bank or our sync may be busy") instead of surfacing an
 * opaque status like "Failed to load bank activity: 546". Dropped connections
 * are handled separately by {@link NETWORK_ERROR_MESSAGE}; an expired bank link
 * by {@link BANK_ACTIVITY_RECONNECT_ADMIN} / {@link BANK_ACTIVITY_RECONNECT_MEMBER}.
 */
export const BANK_ACTIVITY_LOAD_ERROR =
  "Couldn't load your bank activity right now. Your bank or our sync may be busy—try again in a moment."

/**
 * The bank link is expired or deauthorized (Teller rejected our credentials).
 * A retry can't fix it — the bank must be reconnected, which only an admin can
 * do. Distinct from the transient {@link BANK_ACTIVITY_LOAD_ERROR}.
 */
export const BANK_ACTIVITY_RECONNECT_ADMIN =
  'This bank needs reconnecting before its activity will load.'

export const BANK_ACTIVITY_RECONNECT_MEMBER =
  'This bank needs reconnecting. Ask your household admin to reconnect it in Admin.'

export const BANK_ACTIVITY_RECONNECT_CTA = 'Reconnect in Admin'

/**
 * Bank tab note under a card whose balance still shows a payment that is
 * already on its way (docs/CREDIT_CARDS.md § Pending payments).
 */
export function bankCardPendingPaymentNote(amountLabel: string): string {
  return `A ${amountLabel} payment is in progress — counted as paid in your balance.`
}

/**
 * A balance refresh finished but one or more banks failed (e.g. Teller timed
 * out). The refresh RPC returns 200 with an `errors` array rather than
 * throwing, so this is shown when that array is non-empty — otherwise the
 * spinner just stops with no feedback. Mirrors {@link BANK_ACTIVITY_LOAD_ERROR}.
 */
/**
 * Toast when Refresh was tapped but balances were synced moments ago (the
 * server refreshes a bank at most every 30 minutes). Without it the button
 * appears to do nothing.
 */
export const REFRESH_BALANCES_THROTTLED =
  'Balances are already up to date. They refresh at most every 30 minutes.'

/** Some accounts refreshed and others didn't, so "Refreshed just now" is true too. */
export const REFRESH_BALANCES_PARTIAL =
  "Some balances refreshed, but others couldn't. Try again in a moment."

export const REFRESH_BALANCES_ERROR =
  "Couldn't refresh your balances right now. Your bank or our sync may be busy—try again in a moment."

// SimpleFIN Bridge is the bank-data provider since Teller shut down. The
// user subscribes to SimpleFIN directly and pastes a one-time Setup Token;
// there is no Connect-style modal.

export const SIMPLEFIN_BRIDGE_URL = 'https://beta-bridge.simplefin.org'

export const SIMPLEFIN_CONNECT_SHEET_TITLE = 'Connect a bank with SimpleFIN'

export const SIMPLEFIN_CONNECT_SHEET_INTRO =
  'SimpleFIN is a read-only bank connection you control. Sign up at SimpleFIN Bridge (about $1.50/month, paid to SimpleFIN), connect your banks there, then create a Setup Token for Bucket My Money and paste it below.'

export const SIMPLEFIN_BRIDGE_LINK_LABEL = 'Open SimpleFIN Bridge'

export const SIMPLEFIN_TOKEN_FIELD_LABEL = 'Setup Token'

export const SIMPLEFIN_TOKEN_PLACEHOLDER = 'Paste your one-time Setup Token'

export const SIMPLEFIN_TOKEN_INVALID_HINT =
  "That doesn't look like a SimpleFIN Setup Token. Copy the whole token from the Bridge site and paste it again."

export const SIMPLEFIN_CONNECT_ACTION = 'Connect'

export const SIMPLEFIN_CONNECTING_LABEL = 'Connecting…'

export const SIMPLEFIN_CONFIRM_SHEET_TITLE = 'Choose accounts to import'

export const SIMPLEFIN_CONFIRM_SHEET_INTRO =
  'Pick which accounts to bring in, and mark each one as cash or a credit card—card balances count against your household balance.'

export const SIMPLEFIN_CONFIRM_KIND_CASH = 'Cash'

export const SIMPLEFIN_CONFIRM_KIND_CARD = 'Credit card'

export const SIMPLEFIN_CONFIRM_IMPORT_ACTION = 'Import selected'

export const SIMPLEFIN_CONFIRM_IMPORTING_LABEL = 'Importing…'

export const SIMPLEFIN_CONFIRM_EMPTY =
  'SimpleFIN returned no accounts. Connect your bank on the Bridge site first, then create a new Setup Token.'

export const SIMPLEFIN_INVALID_TOKEN_ERROR =
  "That Setup Token didn't work. Tokens are single-use—create a fresh one on the SimpleFIN Bridge site and try again."

export const SIMPLEFIN_CLAIM_REJECTED_ERROR =
  'SimpleFIN rejected the Setup Token. Tokens are single-use—create a fresh one on the Bridge site and try again.'

export function simpleFinImportedSuccess(count: number): string {
  return `Imported ${count} account${count === 1 ? '' : 's'} from SimpleFIN.`
}

/** Unlink confirm for a SimpleFIN connection — no server-side revoke exists. */
export const SIMPLEFIN_UNLINK_REVOKE_NOTE =
  'To fully revoke access, also delete this app in SimpleFIN Bridge.'

// Sheet appears only when detached Items exist — re-adding one of those is
// instant and slot-free, so it's offered before opening Link for a new bank.
export const PLAID_NEW_LINK_SHEET_TITLE = 'Connect with Plaid'

export const PLAID_NEW_LINK_SHEET_INTRO =
  'Re-add a bank you’ve connected before, or connect a new one.'

export const PLAID_NEW_LINK_CONFIRM_ACTION = 'Connect a new bank'

export const PLAID_REATTACH_HINT =
  'Already connected to Plaid — re-add instantly:'

export function plaidReattachAction(institutionName: string | null): string {
  return `Re-add ${institutionName ?? 'bank'}`
}

export function plaidLinkedSuccess(count: number): string {
  return `Linked ${count} account${count === 1 ? '' : 's'} via Plaid.`
}

export const PLAID_RECONNECTED_SUCCESS = 'Bank reconnected.'

/** Unlink confirm for a Plaid Item — detaches locally, keeps the slot. */
export const PLAID_UNLINK_KEEPS_ITEM_NOTE =
  'Its Plaid connection stays reserved, so re-adding this bank won’t use another of the 10 lifetime slots.'

/** Row/banner note when a Plaid Item needs a Link update-mode repair. */
export const PLAID_RECONNECT_NEEDED_NOTE =
  'This bank needs reconnecting. Reconnect repairs the existing connection—it never uses a new slot.'

// Teller withdrew its API product (July 2026). Teller-linked accounts stay
// with frozen balances; live actions are hidden until a possible Teller v2.
export const TELLER_SUNSET_ADMIN_NOTE =
  'Teller (this bank connection service) shut down, so this balance no longer refreshes. Unlink it and reconnect the bank with SimpleFIN, or keep it as a frozen snapshot.'

export const TELLER_SUNSET_ACTIVITY_NOTE =
  'This account was linked through Teller, which shut down—recent activity is unavailable. An admin can reconnect the bank with SimpleFIN.'

/** Per-row note on card accounts in Admin and the Bank tab. */
export const ACCOUNT_CARD_OWED_SUFFIX = 'owed'

export const BANK_TXN_DETAIL_LABELS = {
  description: 'Description',
  category: 'Category',
  counterparty: 'With',
  paymentChannel: 'Paid',
  location: 'Where',
  authorized: 'Authorized',
  posted: 'Posted',
  checkNumber: 'Check #',
  reference: 'Reference',
  payee: 'Payee',
  payer: 'Payer',
  paymentMethod: 'Method',
  reason: 'Reason',
  currency: 'Currency',
} as const

export function bankTxnDetailsToggleLabel(label: string, open: boolean): string {
  return `${open ? 'Hide' : 'Show'} details for ${label}`
}
