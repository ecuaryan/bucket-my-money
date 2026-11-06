import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '@playwright/test'
import { FLOAT_LABEL, NAV_BUCKETS_LABEL, ONBOARDING_COACH_TITLE } from '../../src/lib/brand'
import { assertFfmpegInstalled, webmToGif } from '../../scripts/pwaGifExport.mjs'
import {
  PWA_DEMO_GIF_BUCKETS,
  PWA_DEMO_GIF_DRAG_BUCKET,
  PWA_DEMO_GIF_GROUP,
  PWA_DEMO_GIF_MOVES,
} from '../../scripts/seed/pwaDemoGifs'
import { PWA_SCREENSHOT_VIEWPORT } from '../../scripts/seed/pwaScreenshots'
import {
  DEMO_HOLD_MS,
  createBucketInUi,
  createGroupInUi,
  demoPause,
  dismissOnboardingCoachIfVisible,
  dragBucketIntoGroup,
  dragBucketUp,
  setAsideFromFloat,
  signInPwaDemoGifAdmin,
} from '../pwa-media/helpers'
import { buildStorageStateWithSession } from '../pwa-media/storageState'

const outputDir = join(process.cwd(), 'public/demos')
const tmpDir = join(process.cwd(), 'tmp/pwa-gifs')
const authFile = join(tmpDir, 'auth.json')
const baseURL = process.env.PWA_SCREENSHOTS_BASE_URL ?? 'http://127.0.0.1:5173'

const contextOptions = {
  baseURL,
  viewport: PWA_SCREENSHOT_VIEWPORT,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
} as const

test.beforeAll(async () => {
  assertFfmpegInstalled()
  await mkdir(outputDir, { recursive: true })
  await mkdir(tmpDir, { recursive: true })
})

async function exportDemoGif(
  page: import('@playwright/test').Page,
  baseName: string,
  trimStartSeconds: number,
) {
  const video = page.video()
  await page.close()
  if (!video) throw new Error('Expected Playwright to record video for demo GIF capture.')

  const webmPath = join(tmpDir, `${baseName}.webm`)
  const gifPath = join(outputDir, `${baseName}.gif`)
  await video.saveAs(webmPath)
  webmToGif(webmPath, gifPath, {
    fps: 7,
    width: 280,
    trimStartSeconds,
  })
  await unlink(webmPath).catch(() => undefined)
}

async function openDemoContext(
  browser: import('@playwright/test').Browser,
  storageState: Awaited<ReturnType<typeof refreshDemoAuth>>,
  options?: { recordVideo?: boolean },
) {
  const normalizedOrigin = baseURL.replace(/\/$/, '')
  const sessionEntries =
    storageState.origins.find((o) => o.origin === normalizedOrigin)
      ?.sessionStorage ?? []

  const context = await browser.newContext({
    ...contextOptions,
    storageState,
    ...(options?.recordVideo
      ? {
          recordVideo: {
            dir: tmpDir,
            size: PWA_SCREENSHOT_VIEWPORT,
          },
        }
      : {}),
  })
  await context.addInitScript((entries) => {
    for (const { name, value } of entries) {
      sessionStorage.setItem(name, value)
    }
  }, sessionEntries)
  return context
}

/** Load Buckets off-camera; dismiss coach and return storage with that preference saved. */
async function warmUpDemoShell(
  browser: import('@playwright/test').Browser,
  storageState: Awaited<ReturnType<typeof refreshDemoAuth>>,
) {
  const context = await openDemoContext(browser, storageState)
  const page = await context.newPage()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.getByRole('tab', { name: NAV_BUCKETS_LABEL }).waitFor()
  await page.getByLabel(`${FLOAT_LABEL} balance`).waitFor()
  await dismissOnboardingCoachIfVisible(page)
  const readyState = await buildStorageStateWithSession(context, page, baseURL)
  await context.close()
  return readyState
}

async function waitForDemoShell(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: NAV_BUCKETS_LABEL }).waitFor()
  await page.getByLabel(`${FLOAT_LABEL} balance`).waitFor()
  await page
    .getByRole('region', { name: ONBOARDING_COACH_TITLE })
    .waitFor({ state: 'hidden' })
    .catch(() => undefined)
  await demoPause(page, 150)
}

/** Sign in off-camera so the GIF starts on Buckets, not login. */
async function refreshDemoAuth(browser: import('@playwright/test').Browser) {
  const setupContext = await browser.newContext(contextOptions)
  const setupPage = await setupContext.newPage()
  await signInPwaDemoGifAdmin(setupPage, baseURL)
  const state = await buildStorageStateWithSession(setupContext, setupPage, baseURL)
  await setupContext.close()
  await writeFile(authFile, JSON.stringify(state, null, 2))
  return state
}

test('organize money demo gif', async ({ browser }) => {
  const authState = await refreshDemoAuth(browser)
  const storageState = await warmUpDemoShell(browser, authState)

  const context = await openDemoContext(browser, storageState, {
    recordVideo: true,
  })
  const recordingStartedAt = Date.now()
  const page = await context.newPage()

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await waitForDemoShell(page)
  const trimStartSeconds = (Date.now() - recordingStartedAt) / 1000
  await demoPause(page, DEMO_HOLD_MS)

  for (const bucketName of PWA_DEMO_GIF_BUCKETS) {
    await createBucketInUi(page, bucketName)
  }

  for (const move of PWA_DEMO_GIF_MOVES) {
    await setAsideFromFloat(page, move.bucket, move.amount)
  }

  await dragBucketUp(page, PWA_DEMO_GIF_DRAG_BUCKET)
  await demoPause(page, DEMO_HOLD_MS)

  await createGroupInUi(page, PWA_DEMO_GIF_GROUP)
  await dragBucketIntoGroup(page, PWA_DEMO_GIF_DRAG_BUCKET, PWA_DEMO_GIF_GROUP)

  await exportDemoGif(page, 'organize-money', trimStartSeconds)
  await context.close()
})
