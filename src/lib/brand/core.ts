
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

export const TOAST_DISMISS_LABEL = 'Dismiss'

export const TOAST_PAUSE_LABEL = 'Pause auto-dismiss'

export const TOAST_RESUME_LABEL = 'Resume auto-dismiss'

/** Who can link banks, add members, and change Admin settings. */
export const HOUSEHOLD_ADMIN_PHRASE = 'your household admin'

/** Display name when known; generic phrase as fallback. */
export function householdAdminLabel(
  adminName: string | null | undefined,
): string {
  const trimmed = adminName?.trim()
  return trimmed || HOUSEHOLD_ADMIN_PHRASE
}

export const HIDE_AMOUNTS_LABEL = 'Hide amounts'

export const HIDE_AMOUNTS_SHOW_LABEL = 'Show amounts'

export const HIDE_AMOUNTS_SECTION_TITLE = 'Hide amounts'

export const HIDE_AMOUNTS_PEEK_HINT = 'Hold Peek to see amounts briefly.'

export const HIDE_AMOUNTS_PEEK_LABEL = 'Peek'

export const HIDE_AMOUNTS_PEEK_ARIA_LABEL = 'Peek at balances'

export const HIDE_AMOUNTS_PEEK_POPOVER_BODY = 'Press and hold to peek at balances'

/** Screen-reader label for the peek hint popover. */
export const HIDE_AMOUNTS_PEEK_POPOVER_LABEL =
  'Press and hold Peek to show balances while amounts are hidden'

// Optional nudge under the version number when a new build is already waiting.
// The app still updates itself in the background — this just lets anyone who
// happens to look force it sooner.
export const APP_UPDATE_NOW_LABEL = 'Update now'

export const APP_UPDATE_APPLYING_LABEL = 'Updating…'

export const NAV_BUCKETS_LABEL = 'Buckets'

export const INPUT_CLEAR_ARIA_LABEL = 'Clear'

/** A money RPC returned without a transaction id, so the save can't be confirmed. */
export const MONEY_SAVE_UNCONFIRMED =
  "Couldn't confirm that saved. Check History before trying again."
