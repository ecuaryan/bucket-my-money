import { hasSessionAuthToken } from '@/lib/authPersistence'
import { clearLocalAuthSession } from '@/lib/authStorage'
import { markAutoSignOut } from '@/lib/autoSignOut'
import {
  BACKGROUND_SIGN_OUT_MS,
  clearAppHiddenAt,
  clearSessionGateActive,
  isAppBackgroundExpired,
} from '@/lib/backgroundSignOut'
import { clearSupabaseApiCache } from '@/lib/serviceWorkerCache'

/**
 * The 60s background policy's own clock. While the app is visible it stamps
 * "last active" every few seconds and on every hide; nothing else ever clears
 * or rewrites it. hidden-at (backgroundSignOut.ts) is cleared by auth events —
 * a token refresh landing just after the app was hidden used to erase it, and
 * a reload after that walked straight back in. This stamp can't be erased that
 * way, so a session is only trusted when the app was visibly in use within the
 * last minute.
 */
export const ACTIVITY_HEARTBEAT_MS = 10_000

const LAST_ACTIVE_KEY = 'bucketmymoney:last-active-at'

export function readLastActiveAt(): number | null {
  try {
    const raw = sessionStorage.getItem(LAST_ACTIVE_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function recordLastActiveAt(atMs: number = Date.now()): void {
  try {
    sessionStorage.setItem(LAST_ACTIVE_KEY, String(atMs))
  } catch {
    // private mode
  }
}

/** Never stamped counts as stale: a stored session with no proof of recent use needs a PIN. */
export function isActivityStale(
  lastActiveAtMs: number | null,
  nowMs: number,
  thresholdMs: number = BACKGROUND_SIGN_OUT_MS,
): boolean {
  if (lastActiveAtMs === null) return true
  return nowMs - lastActiveAtMs >= thresholdMs
}

/**
 * Page load: a session found in storage belongs to an app that was reloaded
 * (OS purge, tab discard, manual refresh). Keep it only if the app was in use
 * under a minute ago; otherwise drop the tokens before the Supabase client can
 * read them, so nothing — no membership lookup, no retry, no token refresh —
 * can sign back in. Runs before createClient (see supabase.ts).
 */
export function dropStaleRestoredSession(nowMs: number = Date.now()): boolean {
  if (!hasSessionAuthToken()) return false
  if (!isActivityStale(readLastActiveAt(), nowMs) && !isAppBackgroundExpired(nowMs)) {
    return false
  }
  clearLocalAuthSession()
  clearAppHiddenAt()
  clearSessionGateActive()
  clearSupabaseApiCache()
  // Send the login page straight to the last PIN member, as for any policy sign-out.
  markAutoSignOut()
  return true
}

/**
 * Live page: stamp while visible, and if the app comes back (or its frozen
 * timers resume) after a minute or more away with a session still stored, call
 * `onStale` to sign out — whatever state the auth provider is in.
 */
export function registerActivityClock(onStale: () => void): () => void {
  function check(nowMs: number): void {
    if (hasSessionAuthToken() && isActivityStale(readLastActiveAt(), nowMs)) {
      onStale()
    }
  }

  function tickVisible(): void {
    if (document.visibilityState !== 'visible') return
    const now = Date.now()
    check(now)
    recordLastActiveAt(now)
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      // Visible → hidden: the app was in use up to now (unless its timers were
      // suspended for a minute while "visible", which check() catches first).
      const now = Date.now()
      check(now)
      recordLastActiveAt(now)
      return
    }
    tickVisible()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', tickVisible)
  const interval = setInterval(tickVisible, ACTIVITY_HEARTBEAT_MS)
  tickVisible()

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pageshow', tickVisible)
    clearInterval(interval)
  }
}
