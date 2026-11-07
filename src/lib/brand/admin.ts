/** User-facing copy — Admin: members, roles, PINs, money sources; Settings account. Import from `@/lib/brand`. */

import { ACCOUNT_OWNER_LABEL, roleLabel } from '../memberRoles'
import { FLOAT_LABEL, householdAdminLabel } from './core'

export const ADMIN_JOIN_CODE_TITLE = 'Join code'

export const ADMIN_JOIN_CODE_QR_ALT =
  'QR code to link a device with your household join code'

export const ADMIN_JOIN_CODE_COPY_CODE_ARIA = 'Copy join code'

export const ADMIN_JOIN_CODE_ROTATE_SHEET_TITLE = 'Generate a new join code?'

export const ADMIN_JOIN_CODE_ROTATE_SHEET_BODY =
  'The current code and QR stop working right away. Devices already signed in stay signed in.'

export const ADMIN_JOIN_CODE_ROTATE_CONFIRM = 'Generate new code'

export const ADMIN_JOIN_CODE_ROTATE_SUCCESS =
  'New join code created. Share it with your household.'

export const ADMIN_HOUSEHOLD_MEMBERS_TITLE = 'Household members'

/** Shown under the add-member role picker for the selected role. */
export const ADMIN_ROLE_CONTEXT_ADMIN =
  'Everything Shared can do, plus banks, members, and Auto-bucket.'

export const ADMIN_ROLE_CONTEXT_SHARED =
  'Shares the household buckets, sees bank activity, and can give to kids.'

export const ADMIN_ROLE_CONTEXT_KID =
  'Gets their own buckets, separate from the household’s money.'

/** Shown in the expanded roles reference, not under the add form. */
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

/** Admin PIN sheet title when the admin sets their own PIN. */
export const ADMIN_PIN_SHEET_TITLE_SELF = 'Your PIN'

export function adminPinSheetTitle(memberName: string, isSelf: boolean): string {
  return isSelf ? ADMIN_PIN_SHEET_TITLE_SELF : `PIN for ${memberName}`
}

/** Explains sign-out behavior when saving (matches set-pin + client sign-out). */
export function adminPinSheetBody(memberName: string, isSelf: boolean): string {
  if (isSelf) {
    return 'Saving signs you out on your other devices. This one stays signed in.'
  }
  return `Saving signs ${memberName} out on every device. They sign in again with this PIN.`
}

export const ADMIN_ADD_MEMBER_LABEL = 'Add member'

/** Screen-reader name for the role tabs in the Add member sheet. */
export const ADMIN_MEMBER_ROLE_TABS_LABEL = 'Role'

/**
 * One quiet line under a member's name: role, then sign-in and kid-account
 * facts, e.g. "Kid · PIN set · No linked account".
 */
export function adminMemberStatusLine(m: {
  role: string
  isAccountOwner: boolean
  pinSet: boolean
  pinLocked: boolean
  failedAttempts: number
  /** Kids only: whether a bank account is assigned to them. */
  kidLinked: boolean | null
}): string {
  const parts = [roleLabel(m.role)]
  if (m.isAccountOwner) parts.push(ACCOUNT_OWNER_LABEL)
  parts.push(m.pinSet ? 'PIN set' : 'No PIN')
  if (m.pinLocked) parts.push('Locked')
  else if (m.failedAttempts > 0) {
    parts.push(
      `${m.failedAttempts} failed attempt${m.failedAttempts === 1 ? '' : 's'}`,
    )
  }
  if (m.kidLinked !== null) {
    parts.push(m.kidLinked ? 'Linked account' : 'No linked account')
  }
  return parts.join(' · ')
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

/** Accessible label for expand/collapse on a money-source group header. */
export function adminMoneySourceGroupExpandLabel(
  expanded: boolean,
  accountCount: number,
): string {
  const n = accountCount === 1 ? '1 account' : `${accountCount} accounts`
  return expanded ? `Collapse ${n}` : `Expand ${n}`
}

export function adminUnlinkInstitutionSheetTitle(
  institutionName: string | null,
): string {
  return `Unlink ${institutionName ?? 'this bank'}?`
}

export function adminUnlinkInstitutionSheetIntro(accountCount: number): string {
  return accountCount === 1
    ? 'Its account leaves Bucket My Money.'
    : `Its ${accountCount} accounts leave Bucket My Money.`
}

export const ADMIN_UNLINK_INSTITUTION_CONFIRM = 'Unlink bank'

export function adminRemoveManualSourceSheetTitle(label: string): string {
  return `Remove ${label}?`
}

/** Removing cash lowers Unbucketed; removing a card raises it — name which. */
export function adminRemoveManualSourceBody(
  kind: 'cash' | 'card',
  balanceLabel: string,
): string {
  return kind === 'card'
    ? `${FLOAT_LABEL} goes up by ${balanceLabel}.`
    : `${FLOAT_LABEL} goes down by ${balanceLabel}.`
}

export const ADMIN_REMOVE_MANUAL_SOURCE_CONFIRM = 'Remove'

export const ADMIN_LOADING_MEMBERS = 'Loading household members…'

export const SETTINGS_PAGE_TITLE = 'Settings'

export const ADMIN_ACCOUNT_TITLE = 'Admin sign-in'

export function adminAccountOAuthLabel(provider: string): string {
  return `Signed in with ${provider}`
}

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

export const MANUAL_SOURCE_DIALOG_TITLE = 'Add a money source'

export const MANUAL_SOURCE_LABEL_PLACEHOLDER = 'Cash on hand'

export const MANUAL_SOURCE_DEFAULT_LABEL = 'Cash on hand'

/** Prefill for new manual sources so admins can tap Add and try buckets immediately. */
export const MANUAL_SOURCE_SUGGESTED_AMOUNT = 1000

// Manual credit cards: self-reported balances for cards the app can't
// link. Debt is entered as what's owed and counts AGAINST the household
// balance (docs/CREDIT_CARDS.md).
export const MANUAL_CARD_DIALOG_TITLE = 'Add a credit card'

export const MANUAL_CARD_EDIT_DIALOG_TITLE = 'Edit credit card'

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

// The Plaid team has 10 LIFETIME production Items (bank connections);
// deleting one never frees its slot. Copy here exists to make every
// slot-consuming action explicit and every slot-free action obvious.

export const ADMIN_ADD_SOURCE_PLAID_OPTION = 'Connect with Plaid'

export function adminLinkedAccountsMemberGate(
  adminName: string | null | undefined,
): string {
  return `Only ${householdAdminLabel(adminName)} can link bank accounts and manage household settings here. Ask them to connect an account if Buckets is not showing balances yet.`
}
