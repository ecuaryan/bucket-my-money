/**
 * Demo data for README / portfolio GIF capture (`npm run pwa:gifs`).
 * Empty buckets + cash in Float — the Playwright script creates buckets live.
 */

export const PWA_DEMO_GIF_SCENARIO_ID = 'pwa-gifs' as const

export const PWA_DEMO_GIF_ADMIN_DISPLAY_NAME = 'Jordan'

/** Linked bank account (not manual) so the demo shows the "Bank" tab in the
 *  Buckets tab row. A single source keeps the Float subtext at "across 1 money
 *  source" and the headline at $5,000. */
export const PWA_DEMO_GIF_BANK_SOURCE = {
  label: 'Checking',
  accountType: 'checking',
  balance: 5000,
} as const

export const PWA_DEMO_GIF_BUCKETS = ['🛒 Groceries', '🏠 Rent', '🎉 Fun'] as const

/** Two set-asides — enough to show the flow without lengthening the GIF. */
export const PWA_DEMO_GIF_MOVES = [
  { bucket: '🛒 Groceries', amount: 450 },
  { bucket: '🏠 Rent', amount: 1800 },
] as const

/** Bucket dragged up in the README demo GIF. */
export const PWA_DEMO_GIF_DRAG_BUCKET = '🏠 Rent' as const

/** Group created in the README demo GIF; the dragged bucket moves into it. */
export const PWA_DEMO_GIF_GROUP = 'Home' as const
