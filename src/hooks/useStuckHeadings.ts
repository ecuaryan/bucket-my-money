import { useEffect, type RefObject } from 'react'

/**
 * Marks sticky headings that are currently pinned with `data-stuck="true"`, so
 * they can wear a shadow/edge only while rows scroll underneath (a shadow on a
 * heading at rest would look like a stray border). Updates the DOM directly —
 * no React state, so scrolling never re-renders the list.
 *
 * `selector` matches the headings; each must sit inside a container whose
 * extent bounds the pinned range (the day's <section>).
 */
export function useStuckHeadings(
  rootRef: RefObject<HTMLElement | null>,
  selector: string,
  deps: readonly unknown[],
) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let frame = 0

    const update = () => {
      frame = 0
      for (const heading of root.querySelectorAll<HTMLElement>(selector)) {
        const pinnedTop = parseFloat(getComputedStyle(heading).top) || 0
        const rect = heading.getBoundingClientRect()
        const sectionBottom =
          heading.parentElement?.getBoundingClientRect().bottom ?? Infinity
        // Pinned (or being pushed off by the next day) and still on screen.
        const stuck = rect.top <= pinnedTop + 0.5 && sectionBottom > pinnedTop + 1
        if (stuck) heading.dataset.stuck = 'true'
        else delete heading.dataset.stuck
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef, selector, ...deps])
}
