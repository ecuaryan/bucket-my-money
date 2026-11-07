// Migration service worker. Before the domain cutover, bucketmymoney.com was the
// app, so installed copies still have the old app's service worker serving a
// cached app shell from this origin. Browsers re-check /sw.js, find this file,
// and this worker clears the old caches, unregisters itself, and sends open
// windows to the app's new home. After that this origin runs no service worker.
const APP_ORIGIN = 'https://app.bucketmymoney.com'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      await self.registration.unregister()
      const windows = await self.clients.matchAll({ type: 'window' })
      for (const client of windows) {
        const url = new URL(client.url)
        client.navigate(APP_ORIGIN + url.pathname + url.search + url.hash)
      }
    })(),
  )
})
