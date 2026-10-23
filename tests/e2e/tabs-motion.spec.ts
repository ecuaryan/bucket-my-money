import { test, expect, type Page } from '@playwright/test'
import { AUTO_ORGANIZE_LOADING_ARIA_LABEL } from '../../src/lib/brand'
import { createAdminFamily, insertBucket, serviceClient, userClient } from '../db/fixtures'

// Tab motion: a sliding selection pill, content that eases in, the Auto-bucket
// content built quietly in the background (so its first switch is smooth), and a
// page fade when navigating between the app's tabs. Everything must also be OFF
// for people who prefer reduced motion.

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')
}

/** Distance between the sliding pill and the selected tab (0 once it has settled). */
const pillGap = (page: Page) =>
  page.evaluate(() => {
    const list = document.querySelector('[role="tablist"]')!
    const pill = list.querySelector('span[aria-hidden="true"]')
    const selected = list.querySelector('[aria-selected="true"]')
    if (!pill || !selected) return Infinity
    return Math.abs(pill.getBoundingClientRect().left - selected.getBoundingClientRect().left)
  })

/** An admin household with one Auto-bucket rule ("Payday") over one bucket. */
async function householdWithRule() {
  const family = await createAdminFamily('e2e-tabs-motion')
  const bucketId = await insertBucket(serviceClient(), family.familyId, 'Groceries', null)
  const admin = await userClient(family.adminEmail, family.adminPassword)
  const { data: rule, error } = await admin
    .from('auto_organizes')
    .insert({
      family_id: family.familyId,
      owner_member_id: null,
      created_by_member_id: family.adminMemberId,
      name: 'Payday',
      paused: false,
      auto_organize_kind: 'organize',
      auto_organize_type: 'monthly',
      days_of_month: [1, 15],
    })
    .select('id')
    .single()
  if (error) throw error
  const { error: lineError } = await admin
    .from('auto_organize_lines')
    .insert({ auto_organize_id: rule.id, bucket_id: bucketId, amount: 50, sort_order: 0 })
  if (lineError) throw lineError
  return family
}

test.describe('Tab motion', () => {
  test('Buckets tabs: pill follows, Auto-bucket is ready on first switch, keyboard and refresh work', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    const family = await householdWithRule()
    await signIn(page, family.adminEmail, family.adminPassword)

    const buckets = page.getByRole('tab', { name: 'Buckets', exact: true })
    const auto = page.getByRole('tab', { name: 'Auto-bucket', exact: true })
    await expect(buckets).toHaveAttribute('aria-selected', 'true')
    await expect.poll(() => pillGap(page)).toBeLessThan(3)

    // Built quietly while hidden, with its rules already loaded: nothing mounts
    // or loads during the first switch, so there is no loading-cards jump.
    const autoPanel = page.locator('#segmented-panel-auto-bucket')
    await expect(autoPanel).toBeAttached({ timeout: 10_000 })
    await expect(autoPanel).toBeHidden()
    await expect(autoPanel.getByText('Payday')).toBeAttached()

    await auto.click()
    await expect(autoPanel).toBeVisible()
    await expect(autoPanel.getByText('Payday')).toBeVisible()
    await expect(page.getByLabel(AUTO_ORGANIZE_LOADING_ARIA_LABEL)).toHaveCount(0)
    await expect.poll(() => pillGap(page)).toBeLessThan(3)

    // Keyboard: arrows move selection and focus, and the pill follows.
    await auto.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(buckets).toHaveAttribute('aria-selected', 'true')
    await expect(buckets).toBeFocused()
    await expect.poll(() => pillGap(page)).toBeLessThan(3)

    // A refresh on the Auto-bucket tab lands on it, pill included.
    await page.goto('/?tab=auto-bucket')
    await expect(auto).toHaveAttribute('aria-selected', 'true')
    await expect(autoPanel).toBeVisible()
    await expect.poll(() => pillGap(page)).toBeLessThan(3)

    expect(pageErrors).toEqual([])
  })

  test('Admin tabs switch panels with the pill following', async ({ page }) => {
    const family = await createAdminFamily('e2e-tabs-admin')
    await signIn(page, family.adminEmail, family.adminPassword)
    await page.goto('/admin')

    await expect(page.locator('#segmented-panel-money-sources')).toBeVisible()
    await page.getByRole('tab', { name: 'Household' }).click()
    await expect(page.locator('#segmented-panel-household')).toBeVisible()
    await expect(page.locator('#segmented-panel-money-sources')).toBeHidden()
    await expect.poll(() => pillGap(page)).toBeLessThan(3)
  })

  test('the page fades in only after navigating, never on first load', async ({ page }) => {
    const family = await createAdminFamily('e2e-tabs-fade')
    await signIn(page, family.adminEmail, family.adminPassword)

    const main = page.locator('main')
    await expect(main).not.toHaveClass(/page-fade-enter/)
    await page.getByRole('navigation').getByRole('link', { name: 'History' }).click()
    await expect(page).toHaveURL(/\/history/)
    await expect(main).toHaveClass(/page-fade-enter/)
  })

  test('with reduced motion, no tab or page animation runs', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const family = await householdWithRule()
    await signIn(page, family.adminEmail, family.adminPassword)

    const animationCounts = (selector: string) =>
      page.evaluate((sel) => document.querySelector(sel)?.getAnimations().length ?? 0, selector)

    await page.getByRole('tab', { name: 'Auto-bucket', exact: true }).click()
    await expect(page.locator('#segmented-panel-auto-bucket')).toBeVisible()
    expect(await animationCounts('#segmented-panel-auto-bucket')).toBe(0)
    expect(await animationCounts('[role="tablist"] span[aria-hidden="true"]')).toBe(0)

    await page.getByRole('navigation').getByRole('link', { name: 'History' }).click()
    await expect(page).toHaveURL(/\/history/)
    expect(await animationCounts('main')).toBe(0)
  })
})
