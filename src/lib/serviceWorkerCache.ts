/**
 * Service-worker cache hygiene. The worker never caches authenticated
 * Supabase responses (see src/sw.ts), but entries written by older app
 * versions could linger in Cache Storage — readable via DevTools on a
 * shared device — so we drop the API cache whenever the session ends.
 */
const SUPABASE_API_CACHE = 'supabase-api'

export function clearSupabaseApiCache(): void {
  try {
    if (typeof caches === 'undefined') return
    void caches.delete(SUPABASE_API_CACHE).catch(() => {
      // Best effort — a missing cache is not an error.
    })
  } catch {
    // Cache Storage unavailable (private mode, old browser) — nothing to clear.
  }
}
