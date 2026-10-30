/** Placeholder layout while Buckets tab data loads (matches Buckets tab structure). */
export default function BucketsPageSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading home">
      <div className="rounded-[22px] bg-zinc-900 px-4 py-4 ring-1 ring-zinc-800">
        <div className="h-3 w-24 rounded bg-zinc-800" />
        <div className="mt-3 h-8 w-40 rounded bg-zinc-800" />
        <div className="mt-2 h-3 w-56 rounded bg-zinc-800/80" />
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="h-5 w-20 rounded bg-zinc-800" />
          <div className="h-4 w-16 rounded bg-zinc-800/80" />
        </div>
        <ul className="rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className={
                'flex items-center gap-2 px-2 py-2 ' +
                // Same inset hairline as the real list (SortableBucketList).
                (i === 0
                  ? ''
                  : 'relative before:absolute before:top-0 before:right-3 before:left-11 before:h-px before:bg-zinc-800')
              }
            >
              <div className="h-8 w-7 shrink-0" aria-hidden="true" />
              <div className="h-8 w-8 shrink-0 rounded-[10px] bg-zinc-800" />
              <div className="h-4 w-32 rounded bg-zinc-800" />
              <div className="ml-auto h-4 w-16 rounded bg-zinc-800" />
              <div className="h-8 w-8 shrink-0" aria-hidden="true" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
