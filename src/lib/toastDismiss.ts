/** Success toasts longer than this require manual dismiss (no auto-hide). */
export const TOAST_AUTO_SUCCESS_MAX_CHARS = 72

export function toastDismissMode(
  type: 'success' | 'error',
  message: string,
): 'auto' | 'manual' {
  if (type === 'error') return 'manual'
  if (message.length > TOAST_AUTO_SUCCESS_MAX_CHARS) return 'manual'
  return 'auto'
}

export const TOAST_AUTO_DISMISS_MS = 7000

/** Keep in sync with the `toast-out` animation and `.toast-push-target` transition in index.css. */
export const TOAST_EXIT_MS = 200

/** Space above the toast (under the header) and below it (before the content) (px). */
export const TOAST_GAP_PX = 12

/** The page's own top padding (`pt-6` on AppShell's <main>) — counted in the gap below. */
export const TOAST_MAIN_TOP_PAD_PX = 24

/** How far the page slides down for a toast of this height: equal space above and below. */
export function toastPushPx(panelHeight: number): number {
  return Math.max(0, panelHeight + 2 * TOAST_GAP_PX - TOAST_MAIN_TOP_PAD_PX)
}
