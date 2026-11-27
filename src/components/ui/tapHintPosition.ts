const GAP_PX = 6
const MARGIN_PX = 8

/**
 * Where a hint goes: centered over its anchor, kept on screen, and below the
 * anchor instead when above would reach under the app header.
 */
export function tapHintPosition(
  anchor: { top: number; bottom: number; left: number; width: number },
  hint: { width: number; height: number },
  viewportWidth: number,
  headerBottom: number,
): { left: number; top: number } {
  const above = anchor.top - GAP_PX - hint.height
  const top = above >= headerBottom + MARGIN_PX ? above : anchor.bottom + GAP_PX
  const centered = anchor.left + anchor.width / 2 - hint.width / 2
  const left = Math.max(MARGIN_PX, Math.min(centered, viewportWidth - MARGIN_PX - hint.width))
  return { left, top }
}
