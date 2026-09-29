/// <reference lib="webworker" />
/**
 * Service worker entry point. Built by `vite-plugin-pwa` in `injectManifest`
 * mode: workbox injects the precache manifest at the `self.__WB_MANIFEST`
 * placeholder during the build, and the rest of this file ships as-is.
 *
 * Strategy:
 *   - Precache the built assets so the shell loads offline.
 *   - SPA navigations always serve the precached index.html (never a stale
 *     per-route NetworkFirst copy that can reference deleted JS chunks).
 *   - Supabase auth is network-only — never cache tokens or session checks.
 *   - Authenticated Supabase traffic is network-only — never cache
 *     financial data in Cache Storage.
 *   - Other Supabase calls are network-first with a short timeout for offline.
 *   - Images/fonts only in runtime cache-first (JS/CSS come from precache).
 *
 * Keep this file small and avoid importing app code — it runs in the
 * Service Worker global scope, not in a window.
 */
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA shell: one precached index.html for every in-app route. Avoids stale
// /give or /history navigation cache entries after a deploy changes chunk hashes.
const navigationHandler = createHandlerBoundToURL('/index.html')
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api/, /^\/auth/, /^\/offline\.html$/],
  }),
)

// Auth endpoints must never be cached — stale responses look like sign-out.
registerRoute(
  ({ url }) =>
    url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/auth/'),
  new NetworkOnly(),
)

// Authenticated Supabase traffic must never hit the cache. supabase-js sends
// an Authorization header on every API call, and responses to authenticated
// requests carry the signed-in member's financial data — Cache Storage is
// readable by any same-origin script (XSS) and by DevTools on a shared
// device, so those responses go straight to the network.
registerRoute(
  ({ url, request }) =>
    url.hostname.endsWith('.supabase.co') &&
    request.headers.has('authorization'),
  new NetworkOnly(),
)

// Remaining Supabase calls carry no Authorization header, so no user data can
// come back — network-first with a short timeout for brief offline blips.
registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

// Hashed build assets are precached above. Cache only long-lived media here —
// never script/style (stale chunks after deploy) or auth/API responses.
registerRoute(
  ({ request }) => ['image', 'font'].includes(request.destination),
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

// Do NOT skipWaiting on install. A new version installs and waits so it never
// reloads a foreground tab mid-login; the app activates it only when backgrounded
// (see setupPwaUpdates) by posting SKIP_WAITING.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
