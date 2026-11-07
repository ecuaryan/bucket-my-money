import type { OAuthProvider } from '@/lib/oauth'

const LAST_KEY = 'bucketmymoney_last_sign_in'
const PENDING_KEY = 'bucketmymoney_pending_oauth'
/** A provider round trip that takes longer than this is treated as abandoned. */
const PENDING_TTL_MS = 10 * 60 * 1000

/** `pin` covers PIN and fingerprint/Face ID unlock; it shows no pill (that screen is the default). */
export type LastSignIn = OAuthProvider | 'email' | 'pin'

const METHODS: readonly LastSignIn[] = ['google', 'apple', 'email', 'pin']

export function getLastSignIn(): LastSignIn | null {
  try {
    const v = localStorage.getItem(LAST_KEY)
    return METHODS.includes(v as LastSignIn) ? (v as LastSignIn) : null
  } catch {
    return null
  }
}

/** Call only once a sign-in has actually succeeded. */
export function recordLastSignIn(method: LastSignIn): void {
  try {
    localStorage.setItem(LAST_KEY, method)
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // private mode
  }
}

/**
 * Remember which provider the browser is about to leave for. It only becomes
 * the "last used" method if a session comes back (see promotePendingOAuth), so
 * cancelling at Google never marks it.
 */
export function markOAuthPending(provider: OAuthProvider, now = Date.now()): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ provider, at: now }))
  } catch {
    // private mode
  }
}

/** A session now exists: if it followed a provider round trip, record that provider. */
export function promotePendingOAuth(now = Date.now()): void {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return
    sessionStorage.removeItem(PENDING_KEY)
    const { provider, at } = JSON.parse(raw) as { provider?: string; at?: number }
    if (
      (provider === 'google' || provider === 'apple') &&
      typeof at === 'number' &&
      now - at <= PENDING_TTL_MS
    ) {
      localStorage.setItem(LAST_KEY, provider)
    }
  } catch {
    // private mode or corrupt value
  }
}
