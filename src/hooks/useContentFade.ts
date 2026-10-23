import { useLayoutEffect, useRef, useState } from 'react'

/** A skeleton shown for less than this was never really seen. */
const SKELETON_SEEN_MS = 50

/**
 * Class for a page's content root: it fades in only when a loading skeleton was
 * on screen for a moment first. A page that opens from cache (even if its first
 * render is empty, filled before paint) stays instant. Call it where `loading`
 * is already known (before the skeleton early-return).
 *
 * Timed in layout effects (they run at commit, before paint) so a busy main
 * thread cannot make a visible skeleton look like a brief one.
 */
export function useContentFade(loading: boolean): string | undefined {
  const shownAt = useRef<number | null>(null)
  const [sawSkeleton, setSawSkeleton] = useState(false)

  useLayoutEffect(() => {
    if (loading) {
      shownAt.current ??= performance.now()
      return
    }
    const wasSeen =
      shownAt.current !== null &&
      performance.now() - shownAt.current >= SKELETON_SEEN_MS
    shownAt.current = null
    if (wasSeen) setSawSkeleton(true)
  }, [loading])

  return !loading && sawSkeleton ? 'content-fade-enter' : undefined
}
