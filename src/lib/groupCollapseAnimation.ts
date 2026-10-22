/**
 * Height/opacity animation for the rows of a bucket group as it collapses or
 * expands. The list is a flat <ul> (drag math depends on that), so each row of
 * the group animates itself rather than a wrapper.
 */
export const GROUP_COLLAPSE_MS = 200

export type GroupAnimation = { key: string; dir: 'open' | 'close' }

export function animateGroupRows(
  list: HTMLElement,
  key: string,
  dir: GroupAnimation['dir'],
): void {
  const rows = list.querySelectorAll<HTMLElement>(':scope > li[data-section-key]')
  rows.forEach((el) => {
    if (el.dataset.sectionKey !== key) return
    // A fast re-toggle can leave a fill-forwards close animation behind.
    el.getAnimations().forEach((a) => a.cancel())

    const cs = getComputedStyle(el)
    const full = {
      height: `${el.getBoundingClientRect().height}px`,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      borderTopWidth: cs.borderTopWidth,
      borderBottomWidth: cs.borderBottomWidth,
      opacity: 1,
    }
    const none = {
      height: '0px',
      paddingTop: '0px',
      paddingBottom: '0px',
      borderTopWidth: '0px',
      borderBottomWidth: '0px',
      opacity: 0,
    }

    el.style.overflow = 'hidden'
    const animation = el.animate(dir === 'open' ? [none, full] : [full, none], {
      duration: GROUP_COLLAPSE_MS,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: dir === 'close' ? 'forwards' : 'none',
    })
    animation.onfinish = () => {
      if (dir === 'open') el.style.overflow = ''
    }
    animation.oncancel = () => {
      el.style.overflow = ''
    }
  })
}
