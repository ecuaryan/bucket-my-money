import { useState } from 'react'
import {
  LOGIN_CONTINUE_APPLE,
  LOGIN_CONTINUE_GOOGLE,
  LOGIN_LAST_USED,
  LOGIN_OAUTH_ERROR,
} from '@/lib/brand'
import {
  enabledOAuthProviders,
  startOAuthSignIn,
  type OAuthProvider,
} from '@/lib/oauth'
import { getLastSignIn, markOAuthPending } from '@/lib/lastSignIn'
import { setSignInPreference } from '@/lib/signInPreference'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const LABELS: Record<OAuthProvider, string> = {
  google: LOGIN_CONTINUE_GOOGLE,
  apple: LOGIN_CONTINUE_APPLE,
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M16.37 1.43c0 1.14-.46 2.22-1.2 3-.8.84-2.1 1.5-3.14 1.41-.13-1.1.42-2.25 1.15-3 .82-.86 2.2-1.5 3.19-1.41ZM20.5 17.1c-.55 1.27-.82 1.84-1.53 2.96-1 1.56-2.4 3.5-4.14 3.51-1.55.02-1.95-1.01-4.05-1-2.1.01-2.54 1.02-4.09 1-1.74-.02-3.07-1.77-4.07-3.33C-.2 15.8-.5 10.9 1.4 8.1c1.35-2 3.48-3.17 5.48-3.17 2.04 0 3.32 1.12 5.01 1.12 1.64 0 2.63-1.12 4.99-1.12 1.78 0 3.67.97 5.02 2.64-4.41 2.42-3.7 8.72.6 9.53Z" />
    </svg>
  )
}

/** Small pill marking the sign-in method used last on this device. */
export function LastUsedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] leading-none font-semibold ${className}`}
    >
      {LOGIN_LAST_USED}
    </span>
  )
}

/**
 * Continue with Google / Apple — one flow for sign-in and sign-up (a first-time
 * account gets its household on return; see bootstrapOAuthHousehold).
 */
export function OAuthButtons({
  disabled,
  providers = enabledOAuthProviders(),
}: {
  disabled?: boolean
  providers?: OAuthProvider[]
}) {
  const [busy, setBusy] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUsed] = useState(getLastSignIn)

  if (providers.length === 0) return null

  async function go(provider: OAuthProvider) {
    setBusy(provider)
    setError(null)
    try {
      // A PIN-bound device returning signed-in should not bounce to PIN login.
      setSignInPreference('email')
      markOAuthPending(provider)
      await startOAuthSignIn(provider)
      // The browser is navigating to the provider; keep the spinner up.
    } catch {
      setBusy(null)
      setError(LOGIN_OAUTH_ERROR)
    }
  }

  return (
    <div className="space-y-2.5">
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          disabled={disabled || busy !== null}
          onClick={() => void go(provider)}
          className={`relative flex h-11 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-semibold shadow-sm transition active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 ${
            provider === 'google'
              ? 'bg-white text-zinc-900 hover:bg-zinc-100'
              : 'bg-zinc-950 text-white ring-1 ring-zinc-600 hover:bg-zinc-800'
          }`}
        >
          {busy === provider ? (
            <LoadingSpinner className="h-5 w-5" />
          ) : provider === 'google' ? (
            <GoogleMark className="h-5 w-5" />
          ) : (
            <AppleMark className="h-5 w-5" />
          )}
          {LABELS[provider]}
          {lastUsed === provider && (
            <LastUsedBadge
              className={`absolute top-1/2 right-3 -translate-y-1/2 ${
                provider === 'google'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}
            />
          )}
        </button>
      ))}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30"
        >
          {error}
        </p>
      )}
    </div>
  )
}
