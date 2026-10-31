import { test, expect, type Page } from '@playwright/test'
import { REFRESH_BALANCES_THROTTLED } from '../../src/lib/brand'
import { createAdminFamily, serviceClient } from '../db/fixtures'

// The server refreshes a bank at most every 30 minutes. A Refresh tap sooner
// used to look like the button did nothing; now it says why.

async function signedInWithLinkedBank(page: Page, name: string) {
  const family = await createAdminFamily(name)
  await serviceClient().from('accounts').insert({
    family_id: family.familyId,
    owner_member_id: null,
    teller_account_id: `test-${crypto.randomUUID()}`,
    account_type: 'checking',
    current_balance: 500,
  })
  await page.goto('/login')
  await page.locator('#login-email').fill(family.adminEmail)
  await page.locator('#login-password').fill(family.adminPassword)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')
}

/** Make the refresh endpoint answer like the server does when throttled (or not). */
async function mockRefresh(page: Page, body: Record<string, unknown>, delayMs = 0) {
  await page.route('**/functions/v1/simplefin-refresh', async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ok: true, errors: [], accountsUpdated: 0, ...body }),
    })
  })
}

test.describe('Refresh throttle feedback', () => {
  test('tapping Refresh right after a sync explains why nothing changed', async ({ page }) => {
    await signedInWithLinkedBank(page, 'e2e-throttle')
    await mockRefresh(page, { refreshed: false, bankLastSyncedAt: new Date(Date.now() - 6 * 60_000).toISOString() })
    await page.getByRole('button', { name: 'Refresh balances' }).first().click()
    await expect(page.getByText(REFRESH_BALANCES_THROTTLED)).toBeVisible()
  })

  test('a real refresh says nothing extra', async ({ page }) => {
    await signedInWithLinkedBank(page, 'e2e-throttle-real')
    await mockRefresh(page, { refreshed: true, accountsUpdated: 1, bankLastSyncedAt: new Date().toISOString() })
    await page.getByRole('button', { name: 'Refresh balances' }).first().click()
    await page.waitForTimeout(800)
    await expect(page.getByText(REFRESH_BALANCES_THROTTLED)).toHaveCount(0)
  })

  test('a slow refresh spins the button without dimming the page', async ({ page }) => {
    await signedInWithLinkedBank(page, 'e2e-no-overlay')
    await mockRefresh(page, { refreshed: true, accountsUpdated: 1, bankLastSyncedAt: new Date().toISOString() }, 2500)
    const refresh = page.getByRole('button', { name: 'Refresh balances' }).first()
    await refresh.click()
    await expect(refresh).toBeDisabled()
    await expect(page.getByText('Updating…')).toHaveCount(0)
    await expect(refresh).toBeEnabled({ timeout: 10_000 })
  })
})
