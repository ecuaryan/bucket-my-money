import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { nextSegmentedTabIndex } from '@/lib/segmentedTabsKeyboard'

type SegmentedTabsProps<T extends string> = {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: SegmentedTabsProps<T>) {
  function focusTab(tabValue: T) {
    document.getElementById(`segmented-tab-${tabValue}`)?.focus()
  }

  // One highlight pill slides under the selected tab (a transform, so it stays
  // smooth on low-end phones). It is measured, not guessed, so any number of
  // tabs of any width works; no transition on first paint, and none at all
  // when the user prefers reduced motion.
  const listRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null)
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const el = list.querySelector<HTMLElement>(`[data-tab="${value}"]`)
      if (el) setPill({ x: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [value, options.length])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={
        'relative flex rounded-xl bg-zinc-900/80 p-1 ring-1 ring-zinc-800 ' +
        className
      }
    >
      {pill ? (
        <span
          aria-hidden="true"
          className={
            'pointer-events-none absolute top-1 bottom-1 left-0 rounded-lg bg-zinc-800 shadow-sm ring-1 ring-zinc-700 ' +
            (animate
              ? 'motion-safe:transition-[transform,width] motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]'
              : '')
          }
          style={{ width: pill.width, transform: `translateX(${pill.x}px)` }}
        />
      ) : null}
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={`segmented-tab-${option.value}`}
            data-tab={option.value}
            aria-selected={selected}
            aria-controls={`segmented-panel-${option.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              const nextIndex = nextSegmentedTabIndex(
                event.key,
                index,
                options.length,
              )
              if (nextIndex === null) return
              event.preventDefault()
              const next = options[nextIndex]
              onChange(next.value)
              focusTab(next.value)
            }}
            className={
              'relative z-10 min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ' +
              (selected
                ? 'text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-300')
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
