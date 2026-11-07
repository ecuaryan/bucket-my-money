import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  NAV_BUCKETS_LABEL,
  floatOverbucketedHint,
  KIDS_PAGE_TITLE,
} from '../../src/lib/brand'
import {
  applyPwaScreenshotRebalance,
  PWA_SCREENSHOT_REBALANCE_TARGET_FLOAT,
} from '../../scripts/seed/pwaScreenshotRebalance'
import { seedAdminEmail } from '../../scripts/seed/constants'
import {
  PWA_SCREENSHOT_BUCKETS,
  PWA_SCREENSHOT_SCENARIO_ID,
  PWA_SCREENSHOT_VIRTUAL_KIDS,
  PWA_SCREENSHOT_LINKED_KIDS,
} from '../../scripts/seed/pwaScreenshots'
import { captureFeatureShots } from './featureShots'
import {
  signInPwaScreenshotAdmin,
  waitForNavSettled,
} from '../pwa-media/helpers'

const outputDir = join(process.cwd(), 'public/screenshots')
const featuresDir = join(process.cwd(), 'public/features')

test('capture PWA install screenshots', async ({ page, browser }, testInfo) => {
  await mkdir(outputDir, { recursive: true })
  await mkdir(featuresDir, { recursive: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })

  await signInPwaScreenshotAdmin(page)
  const adminEmail = seedAdminEmail(PWA_SCREENSHOT_SCENARIO_ID)
  const bucketsTab = page.getByRole('tab', { name: NAV_BUCKETS_LABEL })
  await expect(bucketsTab).toHaveAttribute('aria-selected', 'true')
  for (const bucket of PWA_SCREENSHOT_BUCKETS) {
    await page.getByRole('button', { name: `${bucket.name} $` }).waitFor()
  }

  await page.screenshot({ path: join(outputDir, 'buckets.png') })

  await page.locator('nav').getByLabel('History').click()
  await expect(page).toHaveURL('/history')
  await waitForNavSettled(page, 'History')
  await page.getByRole('heading', { name: 'History' }).waitFor()
  await page.getByText(/\d+ transactions/).waitFor()
  await page.getByRole('main').getByText(/Bucket move/).first().waitFor()
  await page.screenshot({ path: join(outputDir, 'history.png') })

  await page.locator('nav').getByLabel('Kids').click()
  await expect(page).toHaveURL('/kids')
  await waitForNavSettled(page, 'Kids')
  await page.getByRole('heading', { name: 'Kids', exact: true }).waitFor()
  const kidsList = page.getByRole('region', { name: KIDS_PAGE_TITLE })
  await kidsList.waitFor()
  for (const kid of [...PWA_SCREENSHOT_VIRTUAL_KIDS, ...PWA_SCREENSHOT_LINKED_KIDS]) {
    await kidsList.getByText(kid.name, { exact: true }).waitFor()
  }
  await page.screenshot({ path: join(outputDir, 'kids.png') })

  // Marketing-site feature crops: must run before the rebalance below.
  await captureFeatureShots(browser, {
    baseURL: testInfo.project.use.baseURL ?? 'http://127.0.0.1:5173',
    adminEmail,
    outputDir: featuresDir,
  })

  await applyPwaScreenshotRebalance(adminEmail)
  await page.goto('/')
  await waitForNavSettled(page, NAV_BUCKETS_LABEL)
  await expect(bucketsTab).toHaveAttribute('aria-selected', 'true')
  const overAmountLabel = `$${Math.abs(PWA_SCREENSHOT_REBALANCE_TARGET_FLOAT).toLocaleString('en-US')}`
  await page.getByText(floatOverbucketedHint(overAmountLabel)).waitFor()
  await page.screenshot({ path: join(outputDir, 'buckets-rebalance.png') })
})
