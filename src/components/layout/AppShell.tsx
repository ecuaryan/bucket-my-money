import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import BottomNav from '@/components/layout/BottomNav'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import SignOutIcon from '@/components/ui/SignOutIcon'
import {
  HEADER_SIGN_OUT_LABEL,
  HEADER_SIGNING_OUT_LABEL,
  NAV_BUCKETS_LABEL,
} from '@/lib/brand'
import { useAuth } from '@/lib/auth'
import { TOAST_GAP_PX } from '@/lib/toastDismiss'
import { useScrollToTopOnPathname } from '@/hooks/useScrollToTopOnPathname'
import {
  GiveRecipientsProvider,
  useGiveRecipients,
} from '@/hooks/GiveRecipientsProvider'
import { FeatureFlagsProvider } from '@/hooks/FeatureFlagsProvider'
import { HeaderGlowProvider } from '@/hooks/HeaderGlowProvider'
import { NAV_CENTER_MAIN_PB, APP_CHROME_Z_INDEX } from '@/components/layout/navLayout'
import {
  buildNavTabs,
  nextHeldNavFlags,
  stableNavFlags,
  type BuildNavTabsArgs,
} from '@/components/layout/navTabs'

/**
 * Hold the last resolved nav flags while the member is briefly revalidating, so
 * a session refresh doesn't collapse the tab set and reshuffle the bottom bar.
 */
function useStableNavFlags(
  current: BuildNavTabsArgs,
  revalidating: boolean,
): BuildNavTabsArgs {
  const { showGiveNav, showKidsNav, isAdmin } = current
  const [held, setHeld] = useState(current)
  useEffect(() => {
    setHeld((prev) =>
      nextHeldNavFlags(prev, { showGiveNav, showKidsNav, isAdmin }, revalidating),
    )
  }, [revalidating, showGiveNav, showKidsNav, isAdmin])
  return stableNavFlags(current, held, revalidating)
}

export default function AppShell() {
  // Provider hoists the give-recipient roster so the nav here and the History
  // give/take filter share one fetch + Realtime subscription instead of each
  // hook instance loading its own copy.
  return (
    <GiveRecipientsProvider>
      <FeatureFlagsProvider>
        <HeaderGlowProvider>
          <AppShellLayout />
        </HeaderGlowProvider>
      </FeatureFlagsProvider>
    </GiveRecipientsProvider>
  )
}

function AppShellLayout() {
  useScrollToTopOnPathname()
  const auth = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const headerRef = useRef<HTMLElement | null>(null)

  // Publish the header height: toasts sit right under it and sticky page
  // headings (e.g. History's day labels) pin just below it.
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const root = document.documentElement
    const apply = () => {
      root.style.setProperty('--app-header-h', `${header.offsetHeight}px`)
      root.style.setProperty(
        '--toast-top',
        `${header.offsetHeight + TOAST_GAP_PX}px`,
      )
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--toast-top')
      root.style.removeProperty('--app-header-h')
    }
  }, [])

  const member = auth.status === 'signedIn' ? auth.member : null
  const memberDisplayName =
    member?.name ??
    (auth.status === 'signedIn' && auth.memberLoading
      ? '…'
      : auth.status === 'signedIn'
        ? auth.session.user.email
        : null) ??
    'You'
  const isAdmin = member?.role === 'admin'
  const { showGiveNav, showKidsNav } = useGiveRecipients()
  // Any blink where the signed-in member is briefly unresolved — revalidation
  // (memberLoading), a transient lookup failure (memberError), or an absent
  // beat between the two — must not collapse the tab set. Gate on the member
  // being null rather than memberLoading alone so every unresolved state
  // freezes the tabs, whichever flags accompany it.
  const revalidating = auth.status === 'signedIn' && member === null
  const navFlags = useStableNavFlags(
    { showGiveNav, showKidsNav, isAdmin },
    revalidating,
  )
  const navTabs = buildNavTabs(navFlags)

  // The incoming page fades in (opacity only, no sliding) — but only after the
  // user has navigated, never when the app first opens.
  const { pathname } = useLocation()
  const [prevPathname, setPrevPathname] = useState(pathname)
  const [navigated, setNavigated] = useState(false)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setNavigated(true)
  }

  async function onSignOut() {
    setSigningOut(true)
    try {
      await auth.signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-black text-zinc-300">
      <header
        ref={headerRef}
        className="app-header-glow sticky top-0 bg-black/85 backdrop-blur-xl"
        style={{ zIndex: APP_CHROME_Z_INDEX }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2.5">
          <NavLink
            to="/"
            end
            aria-label={NAV_BUCKETS_LABEL}
            className={({ isActive }) =>
              [
                '-ml-1 flex min-w-0 max-w-[70%] items-center gap-2 rounded-lg py-0.5 pr-2 pl-1 transition',
                isActive ? 'text-zinc-200' : 'text-zinc-300 hover:bg-zinc-800/60',
              ].join(' ')
            }
          >
            <BrandLogo size={34} className="shrink-0 rounded-[9px] ring-1 ring-white/10" />
            <span className="truncate text-sm font-medium">{memberDisplayName}</span>
          </NavLink>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            aria-label={signingOut ? HEADER_SIGNING_OUT_LABEL : HEADER_SIGN_OUT_LABEL}
            title={HEADER_SIGN_OUT_LABEL}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-zinc-300 ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signingOut ? (
              <LoadingSpinner className="h-5 w-5" />
            ) : (
              <SignOutIcon className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>

      {/* Soft edge under the header. Its own layer (below sticky page bars such as
          History's date row, above page content) so it never dims those bars. Same
          height as main's top padding, so at rest it only covers empty black. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 z-[5] h-4 bg-gradient-to-b from-black/80 to-transparent"
        style={{ top: 'var(--app-header-h, 3.5rem)' }}
      />

      <main
        key={pathname}
        className={
          'toast-push-target mx-auto w-full max-w-md flex-1 px-4 pt-4 ' +
          NAV_CENTER_MAIN_PB +
          (navigated ? ' page-fade-enter' : '')
        }
      >
        <Outlet />
      </main>

      <BottomNav tabs={navTabs} />
    </div>
  )
}
