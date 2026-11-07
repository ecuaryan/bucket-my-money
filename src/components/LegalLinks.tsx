import {
  CONTACT_URL,
  LEGAL_HELP,
  LEGAL_PRIVACY,
  LEGAL_TERMS,
  PRIVACY_URL,
  TERMS_URL,
} from '@/lib/brand'

const LINKS = [
  { label: LEGAL_PRIVACY, href: PRIVACY_URL },
  { label: LEGAL_TERMS, href: TERMS_URL },
  { label: LEGAL_HELP, href: CONTACT_URL },
]

/** Privacy · Terms · Help — the public pages on the marketing site. */
export default function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav
      aria-label="Legal and help"
      className={`flex items-center justify-center gap-4 text-xs ${className}`}
    >
      {LINKS.map(({ label, href }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 hover:text-zinc-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          {label}
        </a>
      ))}
    </nav>
  )
}
