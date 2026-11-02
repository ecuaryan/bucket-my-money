/** User-facing copy — Buckets tab: hero, buckets, groups, onboarding. Import from `@/lib/brand`. */

import { FLOAT_LABEL, FLOAT_LABEL_LOWER, householdAdminLabel } from './core'

export const BUCKETS_NAME_DUPLICATE =
  'You already have a bucket with this name.'

export function bucketsDeleteBucketSheetTitle(name: string): string {
  return `Delete ${name}?`
}

/** Delete-bucket confirm: where the money goes and that History keeps the moves. */
export function bucketsDeleteBucketSheetBody(formattedAmount: string | null): string {
  return formattedAmount
    ? `${formattedAmount} returns to ${FLOAT_LABEL}. Past moves stay in History.`
    : 'Past moves stay in History.'
}

export function bucketsDeleteBucketConfirm(name: string): string {
  return `Delete ${name}`
}

/** Delete confirm when the bucket is still in Auto-bucket rules (listed below it). */
export const BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_BODY =
  'It’s in these Auto-bucket rules. Deleting removes it from each, and a rule left with no buckets is deleted too.'

export const BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_CONFIRM_LABEL = 'Remove and delete'

/** Delete failed on an Auto-bucket reference; delete removes it from rules itself. */
export const BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_BLOCK =
  'Could not delete bucket. Try again — delete removes this bucket from any schedules automatically.'

/** Rule lookup failed: the delete still cleans up rules server-side. */
export const BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_LOAD_FALLBACK =
  'Deleting also removes it from any Auto-bucket rules.'

export function bucketsDeleteBucketAutoOrganizeConfirmAriaLabel(
  bucketName: string,
): string {
  return `Remove ${bucketName} from schedules and delete bucket`
}

/** Screen-reader label for the reorder grip popover (visual uses the grip icon). */
export const BUCKETS_REORDER_POPOVER_LABEL =
  'Press and hold the reorder grip, then drag'

export function bucketsKidFloatHint(
  adminName: string | null | undefined,
): string {
  return `When someone gives you money, move it into buckets—or ask ${householdAdminLabel(adminName)} to link your bank account.`
}

/** Subtitle under the Unbucketed amount when the breakdown panel is hidden. */
export const FLOAT_HERO_SUBTITLE = 'Left over after buckets'

/** Hero subtitle when the household has credit-card balances in the mix. */
export const FLOAT_HERO_SUBTITLE_WITH_CARDS = 'Left over after buckets and cards'

/**
 * Over-bucketed hint with the exact amount you're short, e.g.
 * "You've bucketed $200 more than you have." Pair with the red negative hero
 * number; `overAmountLabel` is the formatted absolute gap.
 */
export function floatOverbucketedHint(overAmountLabel: string): string {
  return `You've bucketed ${overAmountLabel} more than you have.`
}

/** Negative Unbucketed when kids' money is the only thing set aside (no buckets). */
export function floatOverSetAsideForKidsHint(overAmountLabel: string): string {
  return `Kids' balances are ${overAmountLabel} more than your cash.`
}

/**
 * Negative-Unbucketed hint when card balances are part of the equation
 * (cash − cards = buckets + Unbucketed): red then means spending — cash or
 * card — not yet covered by a bucket, not only over-bucketing.
 */
export function floatShortWithCardsHint(overAmountLabel: string): string {
  return `Buckets and cards total ${overAmountLabel} more than your cash.`
}

/**
 * Appended to {@link floatShortWithCardsHint} when a recent card payment may
 * explain the shortfall: cash and card balances update at different times, so
 * paying a card can dip Unbucketed for a day or two. Hedged on purpose — we
 * can't tell whether a payment was made.
 */
export const FLOAT_CARD_PAYMENT_LAG_NOTE =
  'If you recently paid a card, it can take a day or two to show up here.'

/** Hero subtext clause appended after the cash summary, e.g. "· $1,200 owed on cards". */
export function floatCardsSubtextClause(
  cardDebtLabel: string,
  pendingPaymentLabel?: string,
): string {
  return pendingPaymentLabel
    ? `· ${cardDebtLabel} owed on cards after pending ${pendingPaymentLabel} payment`
    : `· ${cardDebtLabel} owed on cards`
}

/** Unbucketed hero: linked-balance refresh control when no prior sync time exists. */
export const FLOAT_REFRESH_BALANCES_LABEL = 'Refresh balances'

export function floatRefreshedLabel(relativeTime: string): string {
  return `Refreshed ${relativeTime}`
}

export const BUCKETS_PAGE_TABS_ARIA_LABEL = 'Buckets page sections'

/** Tab label for the bank account activity view (adults see all family
 * accounts, a child sees their own). "Bank" (not "Activity") to avoid
 * clashing with the in-app History feed. */
export const BUCKETS_PAGE_TAB_ACCOUNT_LABEL = 'Bank'

export const BUCKETS_EMPTY_TITLE = 'Organize your money into buckets'

export const BUCKETS_EMPTY_BODY = 'Create your first bucket below.'

export const SUGGESTED_BUCKET_NAMES = ['Groceries', 'Rent', 'Fun'] as const

export const SUGGESTED_BUCKETS_LABEL = 'Try:'

export const ONBOARDING_COACH_TITLE = 'Getting started'

export const ONBOARDING_COACH_STEP_ADD_SOURCE = 'Add a money source'

export const ONBOARDING_COACH_STEP_CREATE_BUCKET = 'Create a bucket'

export const ONBOARDING_COACH_STEP_SET_ASIDE = 'Set money aside'

export const ONBOARDING_COACH_ADD_SOURCE_ACTION = 'Add a money source'

export const ONBOARDING_COACH_CREATE_BUCKET_ACTION = 'Create a bucket'

export const ONBOARDING_COACH_SET_ASIDE_ACTION = 'Set money aside'

export const ONBOARDING_COACH_DISMISS_LABEL = 'Dismiss'

export function onboardingCoachStepBody(
  step: 'addSource' | 'createBucket' | 'setAside',
  adminName: string | null | undefined,
  isAdmin: boolean,
): string {
  switch (step) {
    case 'addSource':
      return isAdmin
        ? `Add a money source so your ${FLOAT_LABEL_LOWER} cash reflects what you have to organize.`
        : `Ask ${householdAdminLabel(adminName)} to add a money source so your ${FLOAT_LABEL_LOWER} cash reflects reality.`
    case 'createBucket':
      return 'Create buckets for the jobs your money has — rent, groceries, vacation, whatever matters.'
    case 'setAside':
      return `Move money from your ${FLOAT_LABEL_LOWER} cash into a bucket to set it aside.`
  }
}

export const BUCKETS_ADD_SOURCE_TITLE = 'Start organizing your money'

export const BUCKETS_ADD_SOURCE_MANUAL_ACTION = 'Add a money source'

export const BUCKETS_ADD_SOURCE_LINK_ACTION = 'Or link a bank'

export function bucketsAddSourceMemberBody(
  adminName: string | null | undefined,
): string {
  return `Ask ${householdAdminLabel(adminName)} to add a money source—a linked bank or just an amount—so Buckets can show balances.`
}

export const BREAKDOWN_CASH_LABEL = 'Cash'

export const BREAKDOWN_LINKED_CASH_LABEL = 'Linked cash'

export const BREAKDOWN_MANUAL_CASH_LABEL = 'Manual cash'

export const BREAKDOWN_CARD_DEBT_LABEL = 'Credit cards'

/** Unbucketed hero stat tiles — shown when the household has credit cards. */
export const FLOAT_TILE_BALANCE_LABEL = 'Total balance'

export const FLOAT_TILE_CARDS_LABEL = 'Owed on cards'

/** "How this adds up" disclosure under the Unbucketed hero. */
export const FLOAT_MATH_TOGGLE_LABEL = 'How this adds up'

export const FLOAT_MATH_SETTING_TITLE = 'Show how it adds up'

export const FLOAT_MATH_SETTING_DETAIL =
  'Adds a "How this adds up" line under Unbucketed that spells out the math.'

export const FLOAT_MATH_BUCKETS_LABEL = 'In buckets'

export const FLOAT_MATH_CHILD_BUCKETS_LABEL = 'In your buckets'

export const FLOAT_MATH_KIDS_LABEL = 'Set aside for kids'

/** Under the math when cards are counted: a payment in transit is owed until the card posts it. */
export const FLOAT_MATH_CARDS_NOTE =
  'A card payment in transit counts as owed until your card shows it.'

export function floatTileCardsPendingNote(pendingPaymentLabel: string): string {
  return `after ${pendingPaymentLabel} pending payment`
}

/** Collapsed float breakdown toggle, e.g. "$1,234.56 across 14 money sources". */
export function floatSourcesCountText(count: number): string | undefined {
  if (count <= 0) return undefined
  return `across ${count} money source${count === 1 ? '' : 's'}`
}

export function bucketsMemberNoBucketsHint(
  adminName: string | null | undefined,
): string {
  return `Ask ${householdAdminLabel(adminName)} to add buckets.`
}

export const BUCKETS_DB_UPDATE_PENDING_BODY =
  'Balance is estimated from linked accounts only. The server is still updating — try again in a few minutes.'

export const BUCKET_GROUP_NEW_LABEL = 'New group'

export const BUCKET_GROUP_UNNAMED = 'Unnamed group'

export const BUCKET_GROUP_UNGROUPED = 'Ungrouped'

export const BUCKET_GROUP_NAME_LABEL = 'Group name (optional)'

export const BUCKET_GROUP_NAME_PLACEHOLDER = 'Cruise, Kids, Pets…'

export const BUCKET_GROUP_CREATE_TITLE = 'New group'

export const BUCKET_GROUP_CREATE_HINT = 'Only you see your groups. No money moves.'

export const BUCKET_GROUP_RENAME_TITLE = 'Rename group'

export function bucketGroupDeleteTitle(name: string | null): string {
  return name ? `Delete group “${name}”?` : 'Delete this group?'
}

export function bucketGroupDeleteBody(bucketCount: number): string {
  if (bucketCount === 0) return 'No buckets or money are affected.'
  const buckets = bucketCount === 1 ? 'Its bucket moves' : `Its ${bucketCount} buckets move`
  return `${buckets} to ${BUCKET_GROUP_UNGROUPED}. No money moves.`
}

export const BUCKET_GROUP_EMPTY_HINT = 'Empty — drag a bucket here'

/** Group heading summary: "3 buckets · $400" (amount omitted when nothing is in it). */
export function bucketGroupSummary(
  bucketCount: number,
  formattedTotal: string | null,
): string {
  const count = `${bucketCount} ${bucketCount === 1 ? 'bucket' : 'buckets'}`
  return formattedTotal ? `${count} · ${formattedTotal}` : count
}

export const BUCKET_GROUPS_COLLAPSE_ALL = 'Collapse all'

export const BUCKET_GROUPS_EXPAND_ALL = 'Expand all'
