type Props = {
  /** Screen-reader label (also what the old text loader said). */
  label: string
  rows?: number
  className?: string
}

/** Quiet placeholder for a list of rows while a section loads (same look as the page skeletons). */
export function ListSkeleton({ label, rows = 3, className = '' }: Props) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={
        'animate-pulse divide-y divide-zinc-800 overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 ' +
        className
      }
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3 py-3">
          <div className="min-w-0 space-y-2">
            <div className="h-4 w-36 rounded bg-zinc-800" />
            <div className="h-3 w-24 rounded bg-zinc-800/80" />
          </div>
          <div className="h-7 w-16 rounded-lg bg-zinc-800" />
        </div>
      ))}
    </div>
  )
}
