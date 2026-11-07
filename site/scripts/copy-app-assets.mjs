#!/usr/bin/env node
/**
 * Copy the app's README/PWA marketing assets (screenshots, demo GIF, icons)
 * into site/public/app-assets so the site always shows what
 * `npm run pwa:screenshots` / `npm run pwa:gifs` last generated. The copy is
 * gitignored — the repo-root `public/` folder stays the single source.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const appPublic = join(siteRoot, '..', 'public')
const dest = join(siteRoot, 'public', 'app-assets')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
for (const dir of ['screenshots', 'features', 'demos', 'icons']) {
  cpSync(join(appPublic, dir), join(dest, dir), { recursive: true })
}
for (const file of ['favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png']) {
  cpSync(join(appPublic, file), join(dest, file))
}
console.log(`Copied app assets to ${dest}`)
