import { forwardRef, type HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLButtonElement> & {
  label?: string
}

/** The 2×3 dots alone, for a grip that isn't a button (Plan rows). */
export function GripDots({ className = 'h-4 w-2.5' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="2.5" cy="2.5" r="1.25" />
      <circle cx="7.5" cy="2.5" r="1.25" />
      <circle cx="2.5" cy="8" r="1.25" />
      <circle cx="7.5" cy="8" r="1.25" />
      <circle cx="2.5" cy="13.5" r="1.25" />
      <circle cx="7.5" cy="13.5" r="1.25" />
    </svg>
  )
}

/**
 * 2×3 dot grip — standard reorder affordance. Spread dnd-kit
 * attributes/listeners onto this button via ref + props.
 */
const DragHandle = forwardRef<HTMLButtonElement, Props>(function DragHandle(
  { label = 'Reorder bucket', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-reorder-grip=""
      aria-label={label}
      className={
        'flex h-8 w-7 shrink-0 touch-none items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800/60 hover:text-zinc-400 focus:outline focus:outline-2 focus:outline-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 active:cursor-grabbing ' +
        className
      }
      {...props}
    >
      <GripDots />
    </button>
  )
})

export default DragHandle
