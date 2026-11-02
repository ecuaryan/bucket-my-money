/** User-facing copy — Kids tab and Give. Import from `@/lib/brand`. */

import { FLOAT_LABEL, FLOAT_LABEL_LOWER } from './core'

export const KIDS_PAGE_TITLE = 'Kids'

/** Screen-reader / tooltip name for the bank icon on a linked kid's balance. */
export const KIDS_LINKED_BALANCE_LABEL = 'Bank balance'

export const KIDS_GIVE_ACTION = 'Give'

export function kidsGiveSheetTitle(kidName: string): string {
  return `Give to ${kidName}`
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

export function kidsTakeSheetIntro(kidName: string): string {
  return `If it’s in ${kidName}’s buckets, their ${FLOAT_LABEL} goes negative until they choose which bucket covers it.`
}

/**
 * Take sheet intro for a LINKED kid: only their virtual money (net gives)
 * is takeable — typically leftovers from a stretch without a linked bank
 * that would otherwise double-count once the real account is back.
 */
export function kidsTakeLinkedSheetIntro(kidName: string): string {
  return `This is app money on top of ${kidName}’s bank account. Take it back if it’s already in the bank, so it isn’t counted twice.`
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

/** Give "To" option for a sibling with a bank account (disabled: they can't receive app money). */
export function giveLinkedRecipientOption(name: string): string {
  return `${name} · bank account`
}

export const GIVE_LINKED_KID_TITLE = 'Your money is in your bank account'

export const GIVE_LINKED_KID_BODY =
  'Spending comes from your debit card. When you need to move money in or out, use your bank app or ask your household admin to transfer at the bank.'

export const GIVE_DB_NOT_READY_BODY =
  'Give is temporarily unavailable while the server finishes updating. Try again in a few minutes, then refresh.'
