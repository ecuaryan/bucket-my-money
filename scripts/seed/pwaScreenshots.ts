/**
 * Demo data for the `pwa-screenshots` seed scenario and Chrome Richer Install UI
 * manifest screenshots. Keep bucket names, amounts, and PNG paths in sync —
 * refresh assets with `npm run pwa:screenshots` after UI changes.
 */

export const PWA_SCREENSHOT_SCENARIO_ID = 'pwa-screenshots' as const

/** Header name on Buckets — photogenic, not “Seed Admin”. */
export const PWA_SCREENSHOT_ADMIN_DISPLAY_NAME = 'Jordan'

export const PWA_SCREENSHOT_MANUAL_SOURCE = {
  label: 'Checking',
  amount: 8420,
} as const

/** Emoji-first bucket labels for install screenshots and local demos. */
export const PWA_SCREENSHOT_BUCKETS = [
  { name: '🛒 Groceries', amount: 450 },
  { name: '🏠 Rent', amount: 1800 },
  { name: '⚡ Utilities', amount: 180 },
  { name: '🎉 Fun', amount: 120 },
  { name: '✈️ Travel', amount: 350 },
  { name: '🎁 Gifts', amount: 75 },
  { name: '🚗 Transportation', amount: 200 },
] as const

/** Display groups for the Buckets tab screenshot (names must match above). */
export const PWA_SCREENSHOT_BUCKET_GROUPS = [
  { name: 'Home', buckets: ['🏠 Rent', '⚡ Utilities', '🛒 Groceries', '🚗 Transportation'] },
  { name: 'Fun', buckets: ['🎉 Fun', '✈️ Travel', '🎁 Gifts'] },
] as const

/** Kids with no linked bank account — funded from Float via Give, shown in the
 *  "No linked account" section. */
export const PWA_SCREENSHOT_VIRTUAL_KIDS = [
  { name: 'Sam', allowance: 40 },
  { name: 'Mia', allowance: 25 },
] as const

/** Kids whose money lives in a linked bank account — shown in the "Linked
 *  accounts" section. Teller accounts are owner-scoped, so they do not touch
 *  the shared Float. */
export const PWA_SCREENSHOT_LINKED_KIDS = [
  { name: 'Ava', accountLabel: 'Ava checking', accountType: 'checking', balance: 320 },
  { name: 'Noah', accountLabel: 'Noah savings', accountType: 'savings', balance: 1280 },
] as const

/** Total given to virtual kids — affects Float before rebalance capture. */
export const PWA_SCREENSHOT_GIVE_AMOUNT = PWA_SCREENSHOT_VIRTUAL_KIDS.reduce(
  (sum, kid) => sum + kid.allowance,
  0,
)

/** Playwright device viewport — sizes must match manifest `sizes` and PNG pixels. */
export const PWA_SCREENSHOT_VIEWPORT = { width: 412, height: 915 } as const

const screenshotSize = `${PWA_SCREENSHOT_VIEWPORT.width}x${PWA_SCREENSHOT_VIEWPORT.height}`

/** Files under `public/screenshots/` referenced by the web app manifest. */
export const PWA_MANIFEST_SCREENSHOTS = [
  {
    src: '/screenshots/buckets.png',
    sizes: screenshotSize,
    type: 'image/png',
    form_factor: 'narrow',
  },
  {
    src: '/screenshots/buckets-rebalance.png',
    sizes: screenshotSize,
    type: 'image/png',
    form_factor: 'narrow',
  },
  {
    src: '/screenshots/history.png',
    sizes: screenshotSize,
    type: 'image/png',
    form_factor: 'narrow',
  },
  {
    src: '/screenshots/kids.png',
    sizes: screenshotSize,
    type: 'image/png',
    form_factor: 'narrow',
  },
] as const
