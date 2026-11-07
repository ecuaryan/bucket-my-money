/** User-facing copy — Sign-in: email, join code, PIN. Import from `@/lib/brand`. */

import { householdAdminLabel } from './core'

export const LOGIN_NEW_HERE = 'New here?'

export const LOGIN_GET_STARTED = 'Get started'

export const LOGIN_OR = 'or'
export const LOGIN_LAST_USED = 'Last used'

export const LOGIN_PRIVACY = 'Privacy'

export const PRIVACY_URL = 'https://bucketmymoney.com/privacy'

export const LOGIN_CONTINUE_GOOGLE = 'Continue with Google'

export const LOGIN_CONTINUE_APPLE = 'Continue with Apple'

export const LOGIN_OAUTH_ERROR = 'Could not start sign-in. Try again or use email.'

export const LOGIN_SIGNUP_TITLE = 'Create your account'

/** After sign-up when email confirmation is required before first sign-in. */
export const LOGIN_SIGNUP_SUCCESS =
  'Account created. Check your email to confirm, then sign in below.'

export const LOGIN_SHARED_TITLE = 'Have a join code?'

// Reads as the shared-household path so it does not collide with the personal
// "PIN" button on the email/password page.
export const LOGIN_SHARED_CTA = 'Use a household join code →'

export const JOIN_CODE_LABEL = 'Join code'

export const JOIN_CODE_ENTER_PROMPT = 'Enter your household join code.'

export const PIN_JOIN_PAGE_TITLE = 'Join your household'

export const PIN_JOIN_PAGE_SUBTITLE =
  'Enter your household join code from Admin (or scan the QR there).'

export const PIN_UNBIND_JOIN_CODE_LINK = 'Use a different join code'

export const PIN_UNBIND_JOIN_CODE_SHEET_TITLE = 'Use a different join code?'

export const PIN_UNBIND_JOIN_CODE_SHEET_BODY =
  'This device forgets the household code. Signing in here again will need the join code from Admin.'

export const PIN_UNBIND_JOIN_CODE_CONFIRM = 'Forget this code'

export const PIN_HOUSEHOLD_LOAD_ERROR_TITLE = 'Could not load household'

export const PIN_MEMBER_NOT_SET_LABEL = 'PIN not set yet'

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
