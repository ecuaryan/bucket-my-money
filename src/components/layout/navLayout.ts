/** Bottom nav layout tokens (sliding bubble chrome). */

/**
 * App shell z-index scale (low → high):
 * - In-page {@link BusyOverlay}: z-1 / z-2 inside page content
 * - {@link APP_CHROME_Z_INDEX}: sticky header + fixed bottom nav
 * - {@link SHEET_Z_INDEX}: modal sheets (portaled to `document.body`)
 * - Toasts: z-60 in {@link ToastProvider}
 */

/** Sticky header + fixed bottom nav — above in-page {@link BusyOverlay}. */
export const APP_CHROME_Z_INDEX = 30

/** In-page menus/popovers — above app chrome, below sheets. */
export const APP_POPOVER_Z_INDEX = 35

/** Full-screen sheet backdrop — above app chrome, below toasts. */
export const SHEET_Z_INDEX = 40

export const NAV_BUBBLE_SIZE_PX = 48

/** Half the bubble diameter — circle center sits on the bar top border. */
export const NAV_BUBBLE_RADIUS_PX = NAV_BUBBLE_SIZE_PX / 2

/** Inactive icon center below the border (px). Tighter = closer to label. */
export const NAV_ICON_REST_OFFSET_PX = 17

/** In-flow space below the border before the label row (px). */
export const NAV_BAR_BODY_PX = 8

/** SVG tabs at rest; bucket PNG has inset padding so scale up a touch more when active. */
export const NAV_ICON_ACTIVE_SCALE = 1.2
export const NAV_BUCKET_ACTIVE_SCALE = 1.32

export const NAV_LABEL_ROW_PX = 12

/** Extra main padding when bubble protrudes above the bar. */
export const NAV_CENTER_MAIN_PB =
  'pb-[calc(10.25rem+max(0.5rem,env(safe-area-inset-bottom,0px))+var(--keyboard-inset,0px))]'

/** Fixed peek FAB: above bottom nav only (not `--keyboard-inset` — it flickers on iOS overscroll). */
export const PEEK_FAB_FIXED_CLASS =
  'bottom-[calc(4.75rem+max(0.5rem,env(safe-area-inset-bottom,0px)))]'

/** Where Plan's sticky edit pill rests: a little higher than Peek, so it clears the nav's center bubble. */
export const PLAN_EDIT_BAR_STICKY_BOTTOM_CLASS =
  'bottom-[calc(5.25rem+max(0.5rem,env(safe-area-inset-bottom,0px)))]'

export function navIconTransform(isActive: boolean, activeScale = NAV_ICON_ACTIVE_SCALE): string {
  return isActive
    ? `translateY(0) scale(${activeScale})`
    : `translateY(${NAV_ICON_REST_OFFSET_PX}px) scale(1)`
}
