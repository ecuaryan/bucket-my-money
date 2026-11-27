import {
  clearSessionGateOverlay,
  showSessionGateOverlay,
} from '@/lib/backgroundPrivacyShield'
import {
  clearAppHiddenAt,
  clearSessionGateActive,
  setSessionGateActive,
} from '@/lib/backgroundSignOut'
import { clearLocalAuthSession } from '@/lib/authStorage'
import { clearAllBucketsPageCaches } from '@/lib/bucketsPageCache'
import { clearPlanUndoHistories } from '@/lib/planUndo'
import { clearSupabaseApiCache } from '@/lib/serviceWorkerCache'

/** Sync cleanup when the 60s background policy expires (tokens + caches; keep gate visible). */
export function runExpiredBackgroundCleanup(): void {
  clearLocalAuthSession()
  clearAllBucketsPageCaches()
  clearPlanUndoHistories()
  clearSupabaseApiCache()
  setSessionGateActive()
  showSessionGateOverlay()
}

/** Full reset after sign-out or short visible return. */
export function clearBackgroundPrivacyState(): void {
  clearAppHiddenAt()
  clearSessionGateActive()
  clearSessionGateOverlay()
}
