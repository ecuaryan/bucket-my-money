// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

// Static marketing site for bucketmymoney.com. Pure HTML output — no client JS
// framework. The app itself lives in the repo root (Vite + React).
export default defineConfig({
  site: 'https://bucketmymoney.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
})
