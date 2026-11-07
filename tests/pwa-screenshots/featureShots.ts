import { join } from 'node:path'
import { expect, type Browser } from '@playwright/test'
import { NAV_BUCKETS_LABEL } from '../../src/lib/brand'
import { PWA_SCREENSHOT_VIEWPORT } from '../../scripts/seed/pwaScreenshots'
import { seedPwaFeatureAutoBucketRules } from '../../scripts/seed/pwaFeatureShots'
import { signInPwaScreenshotAdmin, waitForNavSettled } from '../pwa-media/helpers'

/**
 * Detail crops for the marketing site's feature cards (`site/src/pages/index.astro`),
 * written to `public/features/`. Captured at 2x so they stay sharp in a card.
 * Crop rectangles are CSS pixels on the 412×915 demo layout — adjust them if the
 * Buckets / Auto-bucket / History layout shifts. Run BEFORE the rebalance step
 * (it turns Unbucketed red and adds a History row).
 */
const CARD = { x: 14, width: 384 } as const

const CROPS = {
  autoBucket: { ...CARD, y: 392, height: 362 },
  history: { ...CARD, y: 236, height: 372 },
  groups: { ...CARD, y: 374, height: 418 },
  hideAmounts: { ...CARD, y: 72, height: 418 },
} as const

export async function captureFeatureShots(
  browser: Browser,
  options: { baseURL: string; adminEmail: string; outputDir: string },
): Promise<void> {
  await seedPwaFeatureAutoBucketRules(options.adminEmail)

  const context = await browser.newContext({
    baseURL: options.baseURL,
    viewport: PWA_SCREENSHOT_VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  const shot = (name: string, clip: { x: number; y: number; width: number; height: number }) =>
    page.screenshot({ path: join(options.outputDir, `${name}.png`), clip })

  try {
    await signInPwaScreenshotAdmin(page)
    await page.getByRole('button', { name: /Rent \$/ }).waitFor()
    await shot('feature-groups', CROPS.groups)
    await shot('feature-hide-before', CROPS.hideAmounts)

    await page.getByRole('tab', { name: 'Auto-bucket', exact: true }).click()
    await page.getByText('Payday', { exact: true }).waitFor()
    await page.getByText('Fun money', { exact: true }).waitFor()
    await shot('feature-auto-bucket', CROPS.autoBucket)

    await page.locator('nav').getByLabel('History').click()
    await waitForNavSettled(page, 'History')
    await page.getByText('“Allowance”').first().waitFor()
    await shot('feature-history', CROPS.history)

    await page.locator('nav').getByLabel('Settings').click()
    await waitForNavSettled(page, 'Settings')
    await page.getByRole('switch', { name: 'Hide amounts' }).click()
    await page.locator('nav').getByLabel(NAV_BUCKETS_LABEL).click()
    await waitForNavSettled(page, NAV_BUCKETS_LABEL)
    await expect(page.getByRole('button', { name: /Rent \$/ })).toBeVisible()
    await shot('feature-hide-after', CROPS.hideAmounts)
  } finally {
    await context.close()
  }
}
