import type { ReactNode } from 'react'

// Outline icons on the same 24px, 1.5-stroke grid as the bottom nav, so the
// tabs read as part of the same family. Decorative: the label names the tab.

const svgProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  className: 'h-[15px] w-[15px] shrink-0 min-[380px]:h-4 min-[380px]:w-4',
} as const

function BucketIcon() {
  return (
    <svg {...svgProps}>
      <ellipse cx="12" cy="6.5" rx="8" ry="2.5" />
      <path d="M4 6.5 6 19.2c.2 1.2 2.9 2.3 6 2.3s5.8-1.1 6-2.3L20 6.5" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg {...svgProps}>
      <path d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  )
}

function BankIcon() {
  return (
    <svg {...svgProps}>
      <path d="M12 3 3 8.25h18L12 3Z" />
      <path d="M5.25 11.25v6M9.75 11.25v6M14.25 11.25v6M18.75 11.25v6M3.75 20.25h16.5" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg {...svgProps}>
      <path d="M21 12V7.5a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 7.5v9a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 16.5V15" />
      <path d="M3 7.5c0-1.24 1-2.25 2.25-2.25h11.25" />
      <path d="M16.5 12h4.5v3h-4.5a1.5 1.5 0 0 1 0-3Z" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg {...svgProps}>
      <path d="m3 11.25 9-8.25 9 8.25" />
      <path d="M5.25 9.75V20.25h13.5V9.75" />
      <path d="M9.75 20.25v-5.25h4.5v5.25" />
    </svg>
  )
}

function BitcoinIcon() {
  return (
    <svg {...svgProps}>
      <path d="M9 5v11.5" />
      <path d="M9 5h4.75a2.75 2.75 0 0 1 0 5.5H9" />
      <path d="M9 10.5h5.75a3 3 0 0 1 0 6H9" />
      <path d="M11.5 3v2M14.5 3v2M11.5 16.5v2M14.5 16.5v2" />
    </svg>
  )
}

const ICONS: Record<string, () => ReactNode> = {
  buckets: BucketIcon,
  'auto-bucket': BoltIcon,
  bank: BankIcon,
  bitcoin: BitcoinIcon,
  'money-sources': WalletIcon,
  household: HomeIcon,
}

/** The icon for a tab value (nothing for one without an icon). */
export function SegmentedTabIcon({ tab }: { tab: string }) {
  const Icon = ICONS[tab]
  return Icon ? <Icon /> : null
}
