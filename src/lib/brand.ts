/**
 * User-facing brand strings. Import from here instead of hard-coding copy.
 *
 * Static HTML cannot import this module — keep these in sync manually:
 * `HTML_META_DESCRIPTION` → index.html meta description;
 * `OFFLINE_PAGE_BODY` → public/offline.html main paragraph;
 * `APP_NAME` → index.html `<title>` and offline.html title.
 */
export const APP_NAME = 'Bucket My Money' as const

/** PWA install sheet / home-screen label (keep short — matches NAV_BUCKETS_LABEL). */
export const APP_SHORT_NAME = 'Buckets' as const

/** Stable hook for e2e and form tests (`data-bucketmymoney-form`). */
export const APP_FORM_DATA_ATTR = 'data-bucketmymoney-form' as const

/** Primary promise after setup (meta, PWA, post–ah-ha surfaces).
 *  "Balance" not "bank balance": a card swipe moves the number too. */
export const APP_TAGLINE =
  'Balance moved? Pick which bucket covers it.'

/** Login screen — value before bank link or first bucket view. */
export const LOGIN_TAGLINE_LEAD = 'Your bank balance is lying to you.'
export const LOGIN_TAGLINE_PAYOFF = 'See where your money actually is.'

/**
 * User-facing name for the per-balance pool that is not assigned to any bucket.
 * Paychecks land here; bills and card charges pull from here; bucket money
 * returns here when you cover a purchase. Reads as a proper-noun place
 * ("returns to Unbucketed"); use {@link FLOAT_LABEL_LOWER} + a noun
 * ("unbucketed cash") for adjective phrasing, and avoid the possessive
 * "your Unbucketed".
 *
 * UI label only. Code, SQL, and RPCs keep `float` (`member_float()`,
 * `float` JSON key, `float_balance_*` columns) — see docs/BRAND.md.
 */
export const FLOAT_LABEL = 'Unbucketed'

/** Lowercase form for adjective copy, e.g. "unbucketed cash" (swaps in one place). */
export const FLOAT_LABEL_LOWER = FLOAT_LABEL.toLowerCase()

/** Default label beside the shared loading spinner (pages, overlays, auth). */
export const LOADING_STATUS_LABEL = 'Loading…'

/** Install / share sheet blurb (may echo the tagline). */
export const PWA_DESCRIPTION =
  'Bucket budgeting on what you really have—cash minus card balances. Solo or with your household.'

/** Primary PWA icon (192×192) — also used in auth UI. */
export const PWA_ICON_192 = '/icons/icon-192.png' as const

/** Bucket mark for the Buckets nav tab (same asset as favicon-32). */
export const APP_ICON_NAV = '/favicon-32.png' as const

/** Sync with index.html `<meta name="description">`. */
export const HTML_META_DESCRIPTION = `${APP_TAGLINE} ${PWA_DESCRIPTION}`

/** Sync with public/offline.html main `<p>`. */
export const OFFLINE_PAGE_BODY =
  'Bucket My Money needs a connection to refresh balances and stay current with your household. Your last-seen balances may still be visible in the app.'

export const LOGIN_ALREADY_HAVE_ACCOUNT = 'Already have an account?'

/** Login/sign-up footnote. Fact-checked against our Teller usage (see docs/BRAND.md). */
export const BANK_READ_ONLY_ASSURANCE =
  "we read balances—we can't transfer, send, or withdraw money"

/**
 * Shown when a request fails because the connection dropped. Browsers surface
 * opaque strings here ("Load failed" on iOS Safari, "Failed to fetch" on
 * Chromium); this reassures a non-technical user that it's transient.
 */
export const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server. This is usually a brief connection hiccup—try again."

/** Shown when a stored session can no longer be refreshed (dead refresh token). */
export const SESSION_EXPIRED_MESSAGE =
  'Your session expired. Please sign out and sign back in, then try again.'

/** Membership lookup failed transiently — distinct from being removed. */
export const MEMBER_LOAD_ERROR_TITLE = "Couldn't load your profile"
export const MEMBER_LOAD_ERROR_BODY =
  'This is usually a brief connection hiccup. Try again—if it keeps happening, sign out and sign back in.'
export const MEMBER_LOAD_ERROR_RETRY = 'Try again'

/** App header sign-out control (icon button `aria-label`). */
export const HEADER_SIGN_OUT_LABEL = 'Sign out'
export const HEADER_SIGNING_OUT_LABEL = 'Signing out…'

export const LOGIN_GET_STARTED = 'Get started'

export const LOGIN_SIGNUP_TITLE = 'Create your account'

export const LOGIN_SIGNUP_SUBTITLE =
  'Confirm your email, then sign in and set up your buckets.'

/** After sign-up when email confirmation is required before first sign-in. */
export const LOGIN_SIGNUP_SUCCESS =
  'Account created. Check your email to confirm, then sign in below.'

export const LOGIN_SHARED_TITLE = 'Sharing a household?'

export const LOGIN_SHARED_SUB =
  'Use your household join code (in Admin), then your PIN.'

// Reads as the shared-household path so it does not collide with the personal
// "PIN" button on the email/password page.
export const LOGIN_SHARED_CTA = 'Use a household join code →'

// --- Household join code (Admin + PIN sign-in) ---

export const JOIN_CODE_LABEL = 'Join code'

export const JOIN_CODE_ENTER_PROMPT = 'Enter your household join code.'

export const PIN_JOIN_PAGE_TITLE = 'Join your household'

export const PIN_JOIN_PAGE_SUBTITLE =
  'Enter your household join code from Admin (or scan the QR there).'

export const ADMIN_JOIN_CODE_TITLE = 'Join code'

export const ADMIN_JOIN_CODE_INTRO =
  'Each phone or tablet enters this once, then signs in with an avatar and PIN. Set each person’s PIN before sharing the code.'

export const ADMIN_JOIN_CODE_QR_ALT =
  'QR code to link a device with your household join code'

export const ADMIN_JOIN_CODE_COPY_CODE_ARIA = 'Copy join code'

export const ADMIN_JOIN_CODE_ROTATE_SHEET_TITLE = 'Generate a new join code?'

export const ADMIN_JOIN_CODE_ROTATE_SHEET_BODY =
  'The current code and QR stop working right away. Devices already signed in stay signed in.'

export const ADMIN_JOIN_CODE_ROTATE_CONFIRM = 'Generate new code'

export const ADMIN_JOIN_CODE_ROTATE_SUCCESS =
  'New join code created. Share it with your household.'

export const PIN_UNBIND_JOIN_CODE_LINK = 'Use a different join code'

export const PIN_UNBIND_JOIN_CODE_SHEET_TITLE = 'Use a different join code?'

export const PIN_UNBIND_JOIN_CODE_SHEET_BODY =
  'This device forgets the household code. Signing in here again will need the join code from Admin.'

export const PIN_UNBIND_JOIN_CODE_CONFIRM = 'Forget this code'

export const PIN_HOUSEHOLD_LOAD_ERROR_TITLE = 'Could not load household'

// --- Admin: people & roles ---

export const ADMIN_HOUSEHOLD_MEMBERS_TITLE = 'Household members'

export const ADMIN_HOUSEHOLD_MEMBERS_INTRO =
  'New members sign in with a PIN. The account owner uses email and cannot be removed.'

export const ADMIN_HOUSEHOLD_ROLES_HELP_TOGGLE = 'About household roles'

/** Shown under the add-member role picker for the selected role. */
export const ADMIN_ROLE_CONTEXT_ADMIN =
  `Full household control—banks, members, and Auto-bucket. Shares buckets and ${FLOAT_LABEL_LOWER} cash with Shared members.`

export const ADMIN_ROLE_CONTEXT_SHARED = `Shares household buckets and ${FLOAT_LABEL_LOWER} cash, and can see bank activity. Give to kids on the Kids tab.`

// --- Kids tab (adults) ---

export const KIDS_PAGE_TITLE = 'Kids'

export const KIDS_PAGE_INTRO =
  'Give kids without a linked account money here. Linked accounts follow the bank—not this app.'

export const KIDS_VIRTUAL_SECTION_TITLE = 'No linked account'

export const KIDS_LINKED_SECTION_TITLE = 'Linked accounts'

/** Footer link to the Buckets Bank tab — used from the Kids and Admin pages. */
export const VIEW_RECENT_BANK_ACTIVITY = 'View recent bank activity'

export const KIDS_LINKED_SECTION_BODY =
  'Money moves at the bank. Assign or change accounts in Admin → Household.'

export function kidsLinkedSectionBody(
  isAdmin: boolean,
  adminName: string | null | undefined,
): string {
  if (isAdmin) return KIDS_LINKED_SECTION_BODY
  return `Money moves at the bank. Ask ${householdAdminLabel(adminName)} to assign or change linked accounts.`
}

export const KIDS_LINKED_ONLY_BODY =
  'Every kid in your household has a linked account—their balance comes from the bank. To give them money, transfer or deposit at your bank.'

export const KIDS_GIVE_ACTION = 'Give'

export function kidsGiveSheetTitle(kidName: string): string {
  return `Give to ${kidName}`
}

export function kidsGiveSheetIntro(availableLabel: string): string {
  return `You have ${availableLabel} available from shared ${FLOAT_LABEL_LOWER} cash.`
}

export function kidsGiveOverdraftMessage(availableLabel: string): string {
  return `You can only give up to ${availableLabel}.`
}

export function kidsGiveAvailableHint(availableLabel: string): string {
  return `You have ${availableLabel} available to give.`
}

export const KIDS_GIVE_SUBMIT = 'Give'

export const KIDS_GIVE_SUBMITTING = 'Giving…'

export const KIDS_GIVE_FAILED = 'Give failed. Try again.'

export function kidsGiveSuccessToast(amountLabel: string, kidName: string): string {
  return `Gave ${amountLabel} to ${kidName}.`
}

export const KIDS_TAKE_ACTION = 'Take'

export function kidsTakeSheetTitle(kidName: string): string {
  return `Take from ${kidName}`
}

export function kidsTakeSheetIntro(
  kidName: string,
  availableLabel: string,
): string {
  return `${kidName} has ${availableLabel} you can take back to shared ${FLOAT_LABEL_LOWER} cash. If some of it is set aside in their buckets, their ${FLOAT_LABEL_LOWER} goes negative and they choose which bucket covers it.`
}

/**
 * Take sheet intro for a LINKED kid: only their virtual money (net gives)
 * is takeable — typically leftovers from a stretch without a linked bank
 * that would otherwise double-count once the real account is back.
 */
export function kidsTakeLinkedSheetIntro(
  kidName: string,
  availableLabel: string,
): string {
  return `${kidName} has ${availableLabel} of virtual money on top of their linked bank account. If that money is already in their real account, take it back so it isn't counted twice. Bank money itself moves at the bank.`
}

export function kidsTakeOverdraftMessage(availableLabel: string): string {
  return `You can only take up to ${availableLabel}.`
}

export function kidsTakeAvailableHint(availableLabel: string): string {
  return `${availableLabel} is available to take.`
}

export function kidsTakeSubmitLabel(): string {
  return `Take back to ${FLOAT_LABEL}`
}

export const KIDS_TAKE_SUBMITTING = 'Taking…'

export const KIDS_TAKE_FAILED = 'Take failed. Try again.'

export function kidsTakeSuccessToast(amountLabel: string, kidName: string): string {
  return `Took ${amountLabel} from ${kidName} back to shared ${FLOAT_LABEL_LOWER} cash.`
}

export const KIDS_EMPTY_VIRTUAL_BODY =
  'Add a kid in Admin → Household to track allowance or birthday money here.'

export function kidsEmptyVirtualBody(
  isAdmin: boolean,
  adminName: string | null | undefined,
): string {
  if (isAdmin) return KIDS_EMPTY_VIRTUAL_BODY
  return `Ask ${householdAdminLabel(adminName)} to add a kid if you want to track allowance or birthday money here.`
}

export const ADMIN_ROLE_CONTEXT_KID =
  'Own buckets—not the household balance. Give on the Kids tab, or assign a linked account below.'

/** The household's collective money pool (admin + Shared role), used as the
 *  linked-account assignment owner vs a specific kid. Not the Admin "Household" tab. */
export const HOUSEHOLD_BALANCE_LABEL = 'Household balance'

/** Shown in the expanded roles reference, not under the add form. */
export const ADMIN_ROLE_PIN_RESET_NOTE =
  'You reset PINs for Shared and Kid members here.'

export type HouseholdMemberRole = 'admin' | 'member' | 'child'

export function adminRoleContext(role: HouseholdMemberRole): string {
  switch (role) {
    case 'admin':
      return ADMIN_ROLE_CONTEXT_ADMIN
    case 'member':
      return ADMIN_ROLE_CONTEXT_SHARED
    case 'child':
      return ADMIN_ROLE_CONTEXT_KID
  }
}

/** One hint line under the add-member form for the selected role. */
export function adminRoleAddHint(role: HouseholdMemberRole): string {
  return adminRoleContext(role)
}

/** Collapsible reference — all roles at once when comparing options. */
export const ADMIN_HOUSEHOLD_ROLES_HELP = [
  { role: 'admin' as const, label: 'Admin', context: ADMIN_ROLE_CONTEXT_ADMIN },
  { role: 'member' as const, label: 'Shared', context: ADMIN_ROLE_CONTEXT_SHARED },
  { role: 'child' as const, label: 'Kid', context: ADMIN_ROLE_CONTEXT_KID },
] as const

/** Prompt when the signed-in admin has not set a PIN yet. */
export const ADMIN_PIN_SETUP_CTA_TITLE = 'Sign in faster with a PIN'

export const ADMIN_PIN_SETUP_CTA_BODY =
  'Set a 4-digit PIN on this device and skip email next time—pick your name and enter your PIN.'

export const ADMIN_PIN_SETUP_CTA_ACTION = 'Set your PIN'

/** Admin PIN sheet title when the admin sets their own PIN. */
export const ADMIN_PIN_SHEET_TITLE_SELF = 'Your PIN'

export function adminPinSheetTitle(memberName: string, isSelf: boolean): string {
  return isSelf ? ADMIN_PIN_SHEET_TITLE_SELF : `PIN for ${memberName}`
}

/** Explains sign-out behavior when saving (matches set-pin + client sign-out). */
export function adminPinSheetBody(memberName: string, isSelf: boolean): string {
  if (isSelf) {
    return '4 digits. We link this device for PIN sign-in. Saving signs you out on any other devices; this device stays signed in.'
  }
  return `4 digits. Saving signs ${memberName} out on every device. They sign in again with this PIN. Other devices may look signed in until they open the app or the session refreshes.`
}

export function adminPinSaveSuccess(memberName: string, isSelf: boolean): string {
  if (isSelf) return 'PIN saved. Use it on other devices.'
  return `PIN saved for ${memberName}.`
}

export function adminMemberAddedSuccess(name: string): string {
  return `Added ${name}. Set their PIN next.`
}

export function adminMemberRemovedSuccess(name: string): string {
  return `Removed ${name}.`
}

export function adminMemberLockoutClearedSuccess(name: string): string {
  return `Lockout cleared for ${name}.`
}

export const MEMBER_NAME_DUPLICATE =
  'Someone in your household already has that name.'

export function manualSourceAddedSuccess(label: string): string {
  return `Added ${label}.`
}

export function manualSourceUpdatedSuccess(label: string): string {
  return `Updated ${label}.`
}

export function manualSourceRemovedSuccess(label: string): string {
  return `Removed ${label}.`
}

export const TOAST_DISMISS_LABEL = 'Dismiss'
export const TOAST_PAUSE_LABEL = 'Pause auto-dismiss'
export const TOAST_RESUME_LABEL = 'Resume auto-dismiss'

export const HISTORY_NOTE_SAVED = 'Note saved.'

/** Who can link banks, add members, and change Admin settings. */
export const HOUSEHOLD_ADMIN_PHRASE = 'your household admin'

/** Display name when known; generic phrase as fallback. */
export function householdAdminLabel(
  adminName: string | null | undefined,
): string {
  const trimmed = adminName?.trim()
  return trimmed || HOUSEHOLD_ADMIN_PHRASE
}

/** Always-shown lead for the Money sources section (banks + manual + cards). */
export const ADMIN_MONEY_SOURCES_INTRO =
  'Link a bank or card—or enter amounts by hand to try things out. Cash counts toward the money you organize; card balances count against it.'

/** Read-only trust line, shown only once at least one bank is linked. The
 *  refresh and unlink actions are self-evident from the per-bank buttons. */
export const ADMIN_LINKED_ACCOUNTS_INTRO = `Linked banks are read-only—${BANK_READ_ONLY_ASSURANCE}. Card balances count against your household balance—link the account that pays the card so payments net out.`

export const ADMIN_LINKED_ACCOUNTS_EMPTY_DETAIL =
  'Balances count toward the money you can organize into buckets.'

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

/** Accessible label for expand/collapse on a money-source group header. */
export function adminMoneySourceGroupExpandLabel(
  expanded: boolean,
  accountCount: number,
): string {
  const n = accountCount === 1 ? '1 account' : `${accountCount} accounts`
  return expanded ? `Collapse ${n}` : `Expand ${n}`
}

export const ADMIN_LINK_BANK_CONFIRM_SHEET_TITLE = 'Link a new bank?'

export const ADMIN_LINK_BANK_CONFIRM_SHEET_INTRO =
  'Link bank is for a new institution—not for changing accounts at a bank you already linked.'

export const ADMIN_LINK_BANK_CONFIRM_ACTION = 'Link bank anyway'

export function adminUnlinkInstitutionSheetTitle(
  institutionName: string | null,
): string {
  return `Unlink ${institutionName ?? 'this bank'}?`
}

export function adminUnlinkInstitutionSheetIntro(
  institutionName: string | null,
  accountCount: number,
): string {
  const label = institutionName ?? 'This bank'
  const accounts =
    accountCount === 1 ? '1 account' : `${accountCount} accounts`
  return `${label} and ${accounts} will be removed from Bucket My Money. Balances will no longer be part of Buckets.`
}

export const ADMIN_UNLINK_INSTITUTION_CONFIRM = 'Unlink bank'

export function adminRemoveManualSourceSheetTitle(label: string): string {
  return `Remove ${label}?`
}

export const ADMIN_REMOVE_MANUAL_SOURCE_INTRO =
  'This manual amount will be removed from your money sources. Linked banks are not affected.'

/** Removing a manual card makes the number go UP — name that consequence. */
export function adminRemoveManualCardIntro(balanceLabel: string): string {
  return `This card's balance will stop counting against your household balance—${FLOAT_LABEL} goes up by ${balanceLabel}. Linked banks are not affected.`
}

export const ADMIN_REMOVE_MANUAL_SOURCE_CONFIRM = 'Remove'

export const ADMIN_LOADING_MEMBERS = 'Loading household members…'

export const HIDE_AMOUNTS_LABEL = 'Hide amounts'
export const HIDE_AMOUNTS_SHOW_LABEL = 'Show amounts'
export const HIDE_AMOUNTS_DETAIL =
  'Mask balances app-wide. Names and activity stay visible.'
export const HIDE_AMOUNTS_SECTION_TITLE = 'Hide amounts'
export const HIDE_AMOUNTS_PEEK_HINT = 'Hold Peek to see amounts briefly.'

export const HIDE_AMOUNTS_PEEK_LABEL = 'Peek'
export const HIDE_AMOUNTS_PEEK_ARIA_LABEL = 'Peek at balances'
export const HIDE_AMOUNTS_PEEK_POPOVER_BODY = 'Press and hold to peek at balances'
/** Screen-reader label for the peek hint popover. */
export const HIDE_AMOUNTS_PEEK_POPOVER_LABEL =
  'Press and hold Peek to show balances while amounts are hidden'

export const SETTINGS_PAGE_TITLE = 'Settings'

// Optional nudge under the version number when a new build is already waiting.
// The app still updates itself in the background — this just lets anyone who
// happens to look force it sooner.
export const APP_UPDATE_NOW_LABEL = 'Update now'
export const APP_UPDATE_APPLYING_LABEL = 'Updating…'

export const ADMIN_ACCOUNT_TITLE = 'Admin sign-in'

export const ADMIN_ACCOUNT_INTRO =
  'Your email and password for signing in as Admin—not household PINs.'

export const ADMIN_ACCOUNT_SEND_RESET = 'Email me a reset link'

export const ADMIN_ACCOUNT_RESET_LINK_SENT =
  'We sent a reset link. Check your inbox (and spam).'

export const ADMIN_ACCOUNT_RESET_HINT =
  'Your current session stays active until you finish the reset from your inbox.'

export const ADMIN_ACCOUNT_RESET_SENT =
  'This only changes your email sign-in password. Your PIN—and everyone else\'s—stays the same.'

export function adminRemoveMemberSheetTitle(name: string): string {
  return `Remove ${name}?`
}

/** Remove-member confirm: what removal does for this role, in one or two sentences. */
export function adminRemoveMemberSheetBody(name: string, role: string): string {
  if (role === 'child') {
    return `${name} is signed out everywhere. Their bucket money returns to ${FLOAT_LABEL}, and their linked accounts move to the household.`
  }
  if (role === 'admin') {
    return `${name} is signed out everywhere and loses admin access. This can't be undone.`
  }
  return `${name} is signed out everywhere and their PIN is deleted. This can't be undone.`
}

export function adminAssignAccountToKidSheetTitle(
  kidName: string,
  accountLabel?: string | null,
): string {
  return `Assign ${accountLabel ?? 'account'} to ${kidName}?`
}

/** Assign confirm: the balance follows the bank, giving turns off, and the double-count fix. */
export function adminAssignAccountToKidSheetBody(kidName: string): string {
  return `${kidName}'s balance will follow this account, and giving in the app turns off for them. If any of their app money is already in this account, take it back on the Kids tab so it isn't counted twice.`
}

export function adminAssignAccountToKidConfirm(kidName: string): string {
  return `Assign to ${kidName}`
}

/** Kid row in Admin → Household — linked bank account list + add picker. */
export const ADMIN_KID_LINKED_ACCOUNTS_LABEL = 'Linked accounts'

export const ADMIN_KID_NO_LINKED_ACCOUNTS_HINT =
  'None yet — balance lives in the app (Give on the Kids tab).'

export const ADMIN_KID_ADD_LINKED_ACCOUNT_LABEL = 'Add linked account'

export const ADMIN_KID_LINKED_ACCOUNT_NONE_AVAILABLE =
  'All linked accounts are assigned to other kids.'

export function adminUnassignLinkedAccountAria(
  accountLabel: string,
  kidName: string,
): string {
  return `Unassign ${accountLabel} from ${kidName}`
}

// --- Buckets (main tab) ---

export const NAV_BUCKETS_LABEL = 'Buckets'

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

export const BUCKETS_DELETE_BUCKET_AUTO_ORGANIZE_SUBMITTING_LABEL =
  'Removing…'

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
 * One-line hint when Unbucketed is negative (over-bucketed). The hero keeps
 * showing the red negative number — this line names what it means so the
 * viewer faces the trade-off. Prefer {@link floatOverbucketedHint} when the
 * over amount is available.
 */
export const FLOAT_NEGATIVE_HINT = "You've bucketed more than you have."

/**
 * Over-bucketed hint with the exact amount you're short, e.g.
 * "You've bucketed $200 more than you have." Pair with the red negative hero
 * number; `overAmountLabel` is the formatted absolute gap.
 */
export function floatOverbucketedHint(overAmountLabel: string): string {
  return `You've bucketed ${overAmountLabel} more than you have.`
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

/**
 * Bank tab note under a card whose balance still shows a payment that is
 * already on its way (docs/CREDIT_CARDS.md § Pending payments).
 */
export function bankCardPendingPaymentNote(amountLabel: string): string {
  return `A ${amountLabel} payment is in progress — counted as paid in your balance.`
}

/** Unbucketed hero: linked-balance refresh control when no prior sync time exists. */
export const FLOAT_REFRESH_BALANCES_LABEL = 'Refresh balances'

export function floatRefreshedLabel(relativeTime: string): string {
  return `Refreshed ${relativeTime}`
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

/**
 * Shown when the pre-flight check says Teller is unreachable, so we decline to
 * open Teller Connect (link / reconnect) rather than trap the user on Teller's
 * full-screen 503. Names Teller's outage plainly — nothing the user can fix.
 */
export const TELLER_UNAVAILABLE_MESSAGE =
  "Your bank connection service (Teller) is temporarily unavailable. Please try again in a little while."

// --- Auto-bucket (Buckets tab) ---
// UI label is "Auto-bucket"; schema/RPCs keep `auto_organize*` (see docs).

/** Buckets tab section header. Schema: `auto_organizes`. */
export const AUTO_ORGANIZE_SECTION_TITLE = 'Auto-bucket'

export const BUCKETS_PAGE_TABS_ARIA_LABEL = 'Buckets page sections'
/** Tab label for the bank account activity view (adults see all family
 * accounts, a child sees their own). "Bank" (not "Activity") to avoid
 * clashing with the in-app History feed. */
export const BUCKETS_PAGE_TAB_ACCOUNT_LABEL = 'Bank'

export const AUTO_ORGANIZE_LOAD_ERROR_TITLE = 'Could not load Auto-bucket'

export const AUTO_ORGANIZE_LOADING_ARIA_LABEL = 'Loading Auto-bucket'

/** One line under the section header (admin + Shared). */
export const AUTO_ORGANIZE_GUARDRAIL =
  'You choose when and how much — on a schedule or when you tap Run now.'

/** Admin CTA in the section header (empty state uses the same label). */
export const AUTO_ORGANIZE_ADD_LABEL = 'Add'

/** Empty state when no auto-organizes exist (admin). */
export const AUTO_ORGANIZE_EMPTY_BODY =
  'Set up moves, top-ups, or save-offs — on a schedule or when you choose.'

export type AutoOrganizeKind = 'organize' | 'top_up' | 'save_off'

export const AUTO_ORGANIZE_KIND_ORGANIZE_LABEL = 'Auto-bucket'

export const AUTO_ORGANIZE_KIND_TOPUP_LABEL = 'Auto top-up'

export const AUTO_ORGANIZE_KIND_SAVEOFF_LABEL = 'Auto save-off'

/** Screen-reader name for the kind tabs at the top of a new rule. */
export const AUTO_ORGANIZE_KIND_TABS_LABEL = 'Rule type'

/** Kind tab labels: short forms of the kind names, so three fit on a phone. */
export const AUTO_ORGANIZE_KIND_TOPUP_TAB_LABEL = 'Top-up'
export const AUTO_ORGANIZE_KIND_SAVEOFF_TAB_LABEL = 'Save-off'

export const AUTO_ORGANIZE_TOPUP_FILL_TO_LABEL = 'Fill to'

export const AUTO_ORGANIZE_SAVEOFF_SOURCES_LABEL = 'From these buckets'

export const AUTO_ORGANIZE_SAVEOFF_KEEP_LABEL = 'Leave at least'

export const AUTO_ORGANIZE_SAVEOFF_SWEEP_ALL_LABEL = 'Sweep all'

export const AUTO_ORGANIZE_SAVEOFF_DESTINATION_LABEL = 'Send the rest to'

export const AUTO_ORGANIZE_SAVEOFF_DEST_FLOAT_LABEL = FLOAT_LABEL

export const AUTO_ORGANIZE_ESTIMATED_TOTAL_LABEL = 'If it ran now'

export const AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL = 'Nothing to move now'

/** Top-up fill met, or save-off balance at/below keep amount. */
export const AUTO_ORGANIZE_AT_TARGET_LABEL = 'At target'

/** @deprecated use AUTO_ORGANIZE_AT_TARGET_LABEL */
export const AUTO_ORGANIZE_TOPUP_AT_TARGET_LABEL = AUTO_ORGANIZE_AT_TARGET_LABEL

export const AUTO_ORGANIZE_RUN_NOW_NOTHING_TO_MOVE = AUTO_ORGANIZE_NOTHING_TO_MOVE_NOW_LABEL

export const AUTO_ORGANIZE_SWEEP_THEN_FILL_TOPUP_NOTE =
  'This bucket is also in a save-off rule. Excess is swept before top-ups on the same day.'

export const AUTO_ORGANIZE_SWEEP_THEN_FILL_SAVEOFF_NOTE =
  'This bucket is also in a top-up or Auto-bucket rule. Save-offs run before refills on the same day.'

/** @deprecated use AUTO_ORGANIZE_SWEEP_THEN_FILL_TOPUP_NOTE or AUTO_ORGANIZE_SWEEP_THEN_FILL_SAVEOFF_NOTE */
export const AUTO_ORGANIZE_SWEEP_THEN_FILL_NOTE =
  AUTO_ORGANIZE_SWEEP_THEN_FILL_TOPUP_NOTE

export function autoOrganizeSaveOffKeepRuleShort(
  amount: number,
  formatMoney: (value: number) => string,
): string {
  if (amount === 0) return AUTO_ORGANIZE_SAVEOFF_SWEEP_ALL_LABEL
  return `Keep ${formatMoney(amount)}`
}

export function autoOrganizeSaveOffMovesNowLabel(
  move: number,
  formatMoney: (value: number) => string,
): string {
  return `Moves ${formatMoney(move)}`
}

export function autoOrganizeTopUpAddsNowLabel(
  move: number,
  formatMoney: (value: number) => string,
): string {
  return `Adds ${formatMoney(move)}`
}

export function autoOrganizeBucketsSectionLabel(kind: AutoOrganizeKind): string {
  if (kind === 'save_off') return AUTO_ORGANIZE_SAVEOFF_SOURCES_LABEL
  return AUTO_ORGANIZE_BUCKETS_LABEL
}

export function autoOrganizeKindLabel(kind: AutoOrganizeKind): string {
  switch (kind) {
    case 'top_up':
      return AUTO_ORGANIZE_KIND_TOPUP_LABEL
    case 'save_off':
      return AUTO_ORGANIZE_KIND_SAVEOFF_LABEL
    default:
      return AUTO_ORGANIZE_KIND_ORGANIZE_LABEL
  }
}

/** History transaction note for an auto-organize run (kind + rule name). */
export function autoOrganizeHistoryNote(
  kind: AutoOrganizeKind,
  displayName: string,
): string {
  return `${autoOrganizeKindLabel(kind)} · ${displayName}`
}

export function autoOrganizeSaveOffDestinationLabel(
  destinationBucketName: string | null,
): string {
  if (destinationBucketName) return destinationBucketName
  return AUTO_ORGANIZE_SAVEOFF_DEST_FLOAT_LABEL
}

export function autoOrganizeRunNowConfirmBodyForKind(
  kind: AutoOrganizeKind,
  totalLabel: string,
): string {
  switch (kind) {
    case 'top_up':
      return `This will top up your buckets by ${totalLabel} now.`
    case 'save_off':
      return `This will move ${totalLabel} from your buckets now.`
    default:
      return `This will move ${totalLabel} into your buckets now.`
  }
}

/** History subtitle label for moves from an automatic run (not a member name). */
export const HISTORY_SCHEDULED_MOVE_LABEL = 'Scheduled'

export const AUTO_ORGANIZE_TOTAL_PER_RUN_LABEL = 'Total per run'

export const AUTO_ORGANIZE_SCHEDULE_SUMMARY_LABEL = 'Schedule'

/** Editor footer row — cadence is already in the form above. */
export const AUTO_ORGANIZE_NEXT_RUN_LABEL = 'Next run'

export const AUTO_ORGANIZE_RUN_NOW_LABEL = 'Run now'

/** Confirm sheet primary action (amount is in the summary above). */
export const AUTO_ORGANIZE_RUN_NOW_SUBMITTING_LABEL = 'Running…'

/** Run-now confirm when this auto-organize already ran today (any trigger). */
/** @deprecated use autoOrganizeRunNowLastRunContext */
export const AUTO_ORGANIZE_RUN_NOW_ALREADY_RAN_WARNING =
  'This already ran today. Running again will move the same amounts again.'

export const AUTO_ORGANIZE_RUN_NOW_LAST_RUN_TODAY_PREFIX = 'Last run today at'

export const AUTO_ORGANIZE_RUN_NOW_CURRENT_LABEL = 'Current'

export const AUTO_ORGANIZE_RUN_NOW_MOVE_LABEL = 'Move'

export const AUTO_ORGANIZE_RUN_NOW_AFTER_LABEL = 'Will be'

export function autoOrganizeViewBucketsLabel(count: number): string {
  if (count === 1) return 'View 1 bucket'
  return `View ${count} buckets`
}

export function autoOrganizeViewLinesLabel(
  kind: AutoOrganizeKind,
  count: number,
): string {
  if (kind === 'save_off') {
    return count === 1 ? 'View 1 source bucket' : `View ${count} source buckets`
  }
  return autoOrganizeViewBucketsLabel(count)
}

export const AUTO_ORGANIZE_PAUSE_LABEL = 'Pause'

export const AUTO_ORGANIZE_PAUSED_LABEL = 'Paused'

/** List card when an auto-organize is paused (admin). */
export const AUTO_ORGANIZE_PAUSED_STATUS =
  'Automatic runs and Run now are off until you resume.'

/** List card when paused; shared members cannot resume. */
export const AUTO_ORGANIZE_PAUSED_STATUS_SHARED = 'Automatic runs are off.'

export function autoOrganizePausedStatus(shared: boolean): string {
  return shared ? AUTO_ORGANIZE_PAUSED_STATUS_SHARED : AUTO_ORGANIZE_PAUSED_STATUS
}

export const AUTO_ORGANIZE_RESUME_LABEL = 'Resume'

export const AUTO_ORGANIZE_EDIT_LABEL = 'Edit'

export const AUTO_ORGANIZE_DELETE_LABEL = 'Delete'

export function autoOrganizeDeleteSheetTitle(displayName: string): string {
  return `Delete ${displayName}?`
}

export const AUTO_ORGANIZE_DELETE_SHEET_BODY = 'Past moves stay in History.'

export const AUTO_ORGANIZE_DELETED_TOAST = 'Deleted.'

export const AUTO_ORGANIZE_RAN_TOAST = 'Moves completed.'

export const AUTO_ORGANIZE_SAVE_LABEL = 'Save'

export const AUTO_ORGANIZE_SAVED_TOAST = 'Saved.'

export const AUTO_ORGANIZE_ADD_REQUIRES_BUCKETS_HINT =
  'Create a shared bucket first.'

export const AUTO_ORGANIZE_FREQUENCY_MANUAL_LABEL = 'Manual only'

export const AUTO_ORGANIZE_MANUAL_CADENCE_SUMMARY = 'Manual only'

export const AUTO_ORGANIZE_MANUAL_NEXT_RUN_LABEL = 'Runs when you choose'

export const AUTO_ORGANIZE_FREQUENCY_LABEL = 'Frequency'

export const AUTO_ORGANIZE_NO_UPCOMING_RUN_LABEL = 'No upcoming run'

export function autoOrganizeNamePlaceholder(kind: AutoOrganizeKind): string {
  switch (kind) {
    case 'top_up':
      return 'Month-start refill'
    case 'save_off':
      return 'Month-end sweep'
    default:
      return 'Payday'
  }
}

export const AUTO_ORGANIZE_BUCKETS_LABEL = 'Buckets'

export const AUTO_ORGANIZE_NO_BUCKETS_ERROR =
  'Enter an amount for at least one bucket.'

export const AUTO_ORGANIZE_FREQUENCY_OPTIONS = [
  { value: 'manual-only', label: AUTO_ORGANIZE_FREQUENCY_MANUAL_LABEL },
  { value: '1-week', label: 'Every week' },
  { value: '2-week', label: 'Every 2 weeks' },
  { value: 'monthly-once', label: 'Once a month' },
  { value: 'monthly-twice', label: 'Twice a month' },
  { value: '2-month', label: 'Every 2 months' },
  { value: '3-month', label: 'Every 3 months' },
  { value: '4-month', label: 'Every 4 months' },
  { value: '6-month', label: 'Every 6 months' },
] as const

export type AutoOrganizeFrequencySelection =
  (typeof AUTO_ORGANIZE_FREQUENCY_OPTIONS)[number]['value']

export const AUTO_ORGANIZE_TWICE_FIRST_DAY_LABEL = 'First day'
export const AUTO_ORGANIZE_TWICE_SECOND_DAY_LABEL = 'Second day'

export const AUTO_ORGANIZE_INTERVAL_START_LABEL = 'Starts on'

/** Read-only anchor once the interval start date is in the past. */
export const AUTO_ORGANIZE_INTERVAL_STARTED_LABEL = 'Started on'

export const AUTO_ORGANIZE_TIMEZONE_LABEL = 'Timezone'

export const AUTO_ORGANIZE_START_DATE_TODAY_ERROR =
  'Start date can’t be today. Pick a later date, or save and use Run now on the card.'

export const AUTO_ORGANIZE_START_DATE_PAST_ERROR =
  'Start date can’t be in the past. Pick tomorrow or later.'

export const AUTO_ORGANIZE_START_DATE_TOO_FAR_ERROR =
  'Start date can’t be more than 2 years away.'

export const AUTO_ORGANIZE_ONCE_MONTHLY_DAY_LABEL = 'Day of the month'

export const AUTO_ORGANIZE_DISCARD_TITLE = 'Discard changes?'

export const AUTO_ORGANIZE_DISCARD_BODY = 'Your changes to this rule will be lost.'

export const AUTO_ORGANIZE_DISCARD_CONFIRM = 'Discard'

export const AUTO_ORGANIZE_DISCARD_CANCEL = 'Keep editing'

export const AUTO_ORGANIZE_SET_ASIDE_FLOAT_CONFIRM_TITLE =
  'Set aside more than Unbucketed?'

export function autoOrganizeSetAsideFloatConfirmBody(amountLabel: string): string {
  return `This set-aside of ${amountLabel} is more than you have unbucketed. ${FLOAT_LABEL} will go negative until your money sources reflect more cash or you move money back.`
}

export function autoOrganizeRunNowConfirmTitle(name: string): string {
  return `Run ${name} now?`
}

export function autoOrganizeRunNowConfirmBody(totalLabel: string): string {
  return `This will move ${totalLabel} into your buckets now.`
}

export const BUCKETS_LINK_BANK_TITLE = 'Link a bank account'

export const BUCKETS_LINK_BANK_ADMIN_BODY =
  `Connect banks in Admin. To change which accounts you share at a bank, Unlink it and link again. Read-only—${BANK_READ_ONLY_ASSURANCE}.`

export const BUCKETS_LINK_BANK_ADMIN_ACTION = 'Link in Admin'

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

export const BUCKETS_ADD_SOURCE_ADMIN_BODY =
  'Not ready to link a bank? Add a money source with the amount you want to organize—your real balance, a rough estimate, or any number to try it out. No bank connection required, and you can link one anytime.'

export const BUCKETS_ADD_SOURCE_MANUAL_ACTION = 'Add a money source'

export const BUCKETS_ADD_SOURCE_LINK_ACTION = 'Or link a bank'

export function bucketsAddSourceMemberBody(
  adminName: string | null | undefined,
): string {
  return `Ask ${householdAdminLabel(adminName)} to add a money source—a linked bank or just an amount—so Buckets can show balances.`
}

export const MANUAL_SOURCE_DIALOG_TITLE = 'Add a money source'
export const MANUAL_SOURCE_DIALOG_BODY =
  'Enter the amount you want to organize. Make it up, estimate it, or use your real balance—you can edit it anytime.'
export const MANUAL_SOURCE_LABEL_PLACEHOLDER = 'Cash on hand'
export const MANUAL_SOURCE_DEFAULT_LABEL = 'Cash on hand'

/** Prefill for new manual sources so admins can tap Add and try buckets immediately. */
export const MANUAL_SOURCE_SUGGESTED_AMOUNT = 1000

// Manual credit cards: self-reported balances for cards the app can't
// link. Debt is entered as what's owed and counts AGAINST the household
// balance (docs/CREDIT_CARDS.md).
export const MANUAL_CARD_DIALOG_TITLE = 'Add a credit card'
export const MANUAL_CARD_EDIT_DIALOG_TITLE = 'Edit credit card'
export const MANUAL_CARD_DIALOG_BODY =
  'Enter what you currently owe on the card. It counts against your household balance—update it whenever the balance changes.'
export const MANUAL_CARD_LABEL_PLACEHOLDER = 'Credit card'
export const MANUAL_CARD_DEFAULT_LABEL = 'Credit card'
export const MANUAL_CARD_AMOUNT_LABEL = 'Balance owed'

export const ADMIN_MANUAL_GROUP_TITLE = 'Manual sources'
export const ADMIN_MONEY_SOURCES_SECTION_TITLE = 'Money sources'

export const ADMIN_PAGE_TAB_HOUSEHOLD_LABEL = 'Household'
export const ADMIN_PAGE_TABS_ARIA_LABEL = 'Admin page sections'
export const ADMIN_ADD_MONEY_SOURCE_ACTION = 'Add money source'
// Linked accounts (banks AND credit cards) come through SimpleFIN — one flow.
// Manual entry is the try-it / demo path: parallel wording so cash and card
// read as the same secondary method, not a third way to link.
export const ADMIN_ADD_SOURCE_LINK_OPTION = 'Link a bank or card'
export const ADMIN_ADD_SOURCE_MANUAL_OPTION = 'Enter cash manually'
export const ADMIN_ADD_SOURCE_CARD_OPTION = 'Enter a card balance manually'

// --- SimpleFIN (linked banks) ---
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
  'This removes the accounts from Bucket My Money. To fully revoke access, also delete this app from your SimpleFIN Bridge account.'

// --- Plaid (flag-gated: owner's household only) ---
// The Plaid team has 10 LIFETIME production Items (bank connections);
// deleting one never frees its slot. Copy here exists to make every
// slot-consuming action explicit and every slot-free action obvious.

export const ADMIN_ADD_SOURCE_PLAID_OPTION = 'Connect with Plaid'

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
  'This removes the accounts from Bucket My Money but keeps the Plaid connection reserved, so re-adding this bank later won’t use another of the 10 lifetime slots.'

/** Row/banner note when a Plaid Item needs a Link update-mode repair. */
export const PLAID_RECONNECT_NEEDED_NOTE =
  'This bank needs reconnecting. Reconnect repairs the existing connection—it never uses a new slot.'

// --- Teller (quiesced) ---
// Teller withdrew its API product (July 2026). Teller-linked accounts stay
// with frozen balances; live actions are hidden until a possible Teller v2.
export const TELLER_SUNSET_ADMIN_NOTE =
  'Teller (this bank connection service) shut down, so this balance no longer refreshes. Unlink it and reconnect the bank with SimpleFIN, or keep it as a frozen snapshot.'
export const TELLER_SUNSET_ACTIVITY_NOTE =
  'This account was linked through Teller, which shut down—recent activity is unavailable. An admin can reconnect the bank with SimpleFIN.'

/** Per-row note on card accounts in Admin and the Bank tab. */
export const ACCOUNT_CARD_OWED_SUFFIX = 'owed'
export const ADMIN_CARD_COUNTS_AGAINST_NOTE =
  'Counts against your household balance'

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

export const GIVE_ADD_SOURCE_TITLE = 'Add a money source first'

export const GIVE_ADD_SOURCE_ADMIN_BODY =
  'Give uses cash from the household balance in Buckets. Add a money source in Admin—a linked bank or just an amount—so we know how much you can give.'

export function bucketsLinkBankMemberBody(
  adminName: string | null | undefined,
): string {
  return `No bank accounts are linked yet. Ask ${householdAdminLabel(adminName)} to connect a bank account so balances can refresh and your ${FLOAT_LABEL_LOWER} cash stays current.`
}

export function giveLinkBankMemberBody(
  adminName: string | null | undefined,
): string {
  return `No bank accounts are linked yet. Ask ${householdAdminLabel(adminName)} to connect one before you can give.`
}

export function bucketsMemberNoBucketsHint(
  adminName: string | null | undefined,
): string {
  return `Ask ${householdAdminLabel(adminName)} to add buckets.`
}

// --- Give ---

export const GIVE_SHARED_BALANCE_INTRO =
  'Give money to other people in your household.'

export const GIVE_SHARED_BALANCE_NO_ACCOUNTS_BODY =
  'Give uses cash from the household balance in Buckets. Link a bank account in Admin first so we know how much you can give.'

export const GIVE_KID_INTRO =
  `Give your ${FLOAT_LABEL_LOWER} cash to another household member.`

export const GIVE_LINKED_KID_TITLE = 'Your money is in your bank account'

export const GIVE_LINKED_KID_BODY =
  'Spending comes from your debit card. When you need to move money in or out, use your bank app or ask your household admin to transfer at the bank.'

export const GIVE_LINKED_KIDS_EXCLUDED_HINT =
  'Kids with a linked account aren’t listed—transfer or deposit at your bank to give them money.'

export const GIVE_ADULT_LINKED_KIDS_ONLY_TITLE = 'Your kids have linked accounts'

export const GIVE_ADULT_LINKED_KIDS_ONLY_BODY =
  'Every kid in your household has their own linked account—their balance comes from the bank. To give them money, transfer or deposit at your bank.'

export const GIVE_ADULT_LINKED_KIDS_ONLY_GIVE_FOR =
  'Give is for kids who don’t have a linked account—you can track their money here instead.'

export const GIVE_DB_NOT_READY_BODY =
  'Give is temporarily unavailable while the server finishes updating. Try again in a few minutes, then refresh.'

export const BUCKETS_DB_UPDATE_PENDING_BODY =
  'Balance is estimated from linked accounts only. The server is still updating — try again in a few minutes.'

// --- History ---

/** History filter dropdown + active chip — all give/take activity. */
export const HISTORY_FILTER_GIVES_AND_TAKES = 'Gives & takes'

/** History balance trail when the viewer is the subject kid. */
export const HISTORY_BALANCE_YOUR_LABEL = FLOAT_LABEL

export const HISTORY_EMPTY_BUCKET_BODY =
  'Move money in or out of this bucket and it will appear here.'

export const HISTORY_EMPTY_BODY =
  `Move money between buckets and ${FLOAT_LABEL} in Buckets—it will appear here.`

export const HISTORY_EMPTY_SENDS_BODY =
  'Give money to a kid—or take it back—and it will appear here.'

export const HISTORY_NOTE_ADD = 'Add note'

export const HISTORY_NOTE_EDIT = 'Edit note'

export const HISTORY_NOTE_SHEET_TITLE_ADD = 'Add note'

export const HISTORY_NOTE_SHEET_TITLE_EDIT = 'Edit note'

export const TRANSACTION_NOTE_FIELD_LABEL = 'Note'

export const TRANSACTION_NOTE_PLACEHOLDER = "What's this for?"

export const HISTORY_NOTE_CLEAR = 'Clear note'

export const INPUT_CLEAR_ARIA_LABEL = 'Clear'

// --- PIN sign-in ---

export const PIN_MEMBER_NOT_SET_LABEL = 'PIN not set yet'

export const PIN_PICKER_AUTO_UPDATE_NOTE = 'This page updates automatically.'

export function pinPickerPendingLead(
  adminName: string | null | undefined,
  everyoneWaiting: boolean,
): string {
  const admin = householdAdminLabel(adminName)
  if (everyoneWaiting) {
    return `Waiting for ${admin} to set your PIN.`
  }
  return `Waiting for ${admin} to set remaining PINs.`
}

export function pinNoMembersYet(adminName: string | null | undefined): string {
  return `No household members yet. Ask ${householdAdminLabel(adminName)} to add you and set your PIN.`
}

// --- Admin (non-admin viewers) ---

export function adminLinkedAccountsMemberGate(
  adminName: string | null | undefined,
): string {
  return `Only ${householdAdminLabel(adminName)} can link bank accounts and manage household settings here. Ask them to connect an account if Buckets is not showing balances yet.`
}

// --- Bucket groups (visual, per-person sections on the Buckets tab) ---

export const BUCKET_GROUP_NEW_LABEL = 'New group'
export const BUCKET_GROUP_UNNAMED = 'Unnamed group'
export const BUCKET_GROUP_UNGROUPED = 'Ungrouped'
export const BUCKET_GROUP_NAME_LABEL = 'Group name (optional)'
export const BUCKET_GROUP_NAME_PLACEHOLDER = 'Cruise, Kids, Pets…'
export const BUCKET_GROUP_CREATE_TITLE = 'New group'
export const BUCKET_GROUP_CREATE_HINT =
  'Groups just organize your buckets on your own Buckets tab. Nobody else sees them, and no money moves. Drag buckets in afterwards.'
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

// --- Bank activity: transaction details (tap a row) ---
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
