import { useMemo } from 'react'
import { emojiHue } from '@/lib/emojiTint'

type Props = {
  emoji: string | null
}

/**
 * Leading tile for a bucket row: the name's emoji on a faint tint of its own
 * color, or a quiet bucket glyph when the name has no emoji (so rows line up
 * and adding an emoji later only changes this one tile).
 */
export default function BucketTile({ emoji }: Props) {
  const hue = useMemo(() => (emoji ? emojiHue(emoji) : null), [emoji])

  const style =
    hue === null
      ? undefined
      : {
          backgroundImage: `linear-gradient(145deg, hsl(${hue} 70% 55% / 0.24), hsl(${hue} 70% 55% / 0.08))`,
          boxShadow: `inset 0 0 0 1px hsl(${hue} 70% 55% / 0.22)`,
        }

  return (
    <span
      aria-hidden={emoji ? undefined : true}
      style={style}
      className={
        'grid h-7 w-7 shrink-0 place-items-center rounded-[9px] text-sm leading-none min-[360px]:h-8 min-[360px]:w-8 min-[360px]:rounded-[10px] min-[360px]:text-base ' +
        (hue === null
          ? 'bg-gradient-to-br from-zinc-800 to-zinc-900 ring-1 ring-inset ring-white/5'
          : '')
      }
    >
      {emoji ?? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-3.5 w-3.5 text-zinc-600 min-[360px]:h-4 min-[360px]:w-4"
        >
          <path d="M4 6.5 6 19.2c.2 1.2 2.9 2.3 6 2.3s5.8-1.1 6-2.3L20 6.5" />
          <ellipse cx="12" cy="6.5" rx="8" ry="2.5" />
        </svg>
      )}
    </span>
  )
}
