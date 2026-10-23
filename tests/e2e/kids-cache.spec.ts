import { test, expect } from '@playwright/test'
import { addMember, createAdminFamily, giveMoney, serviceClient, userClient } from '../db/fixtures'

// The Kids tab remembers what it showed so coming back is instant, with a fresh
// copy loading behind it. This proves both halves with every data request
// delayed by 1.5 s: the kid is on screen almost immediately (from the
// remembered view), and a change made while away shows up once the fresh load
// lands.

test.describe('Kids tab cache', () => {
  test('coming back is instant, and a change made while away appears after the refresh', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    const family = await createAdminFamily('e2e-kids-cache')
    const kid = await addMember(family.familyId, 'child', 'Sam')
    await serviceClient().from('accounts').insert({
      family_id: family.familyId,
      owner_member_id: null,
      teller_account_id: `test-${crypto.randomUUID()}`,
      account_type: 'checking',
      current_balance: 500,
    })
    const admin = await userClient(family.adminEmail, family.adminPassword)

    await page.goto('/login')
    await page.locator('#login-email').fill(family.adminEmail)
    await page.locator('#login-password').fill(family.adminPassword)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL('/')

    const nav = page.getByRole('navigation')
    const samRow = page.getByRole('listitem').filter({ hasText: 'Sam' })

    // First visit: loads normally and fills the cache.
    await nav.getByRole('link', { name: 'Kids' }).click()
    await expect(samRow).toContainText('$0')

    // Away: slow every data request down, and change something meanwhile.
    await nav.getByRole('link', { name: 'Buckets' }).click()
    await page.route(/\/(rest|functions)\/v1\//, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await giveMoney(admin, { toMemberId: kid.memberId, amount: 10 })

    // Back: Sam is on screen well before the delayed requests can have returned…
    await nav.getByRole('link', { name: 'Kids' }).click()
    await expect(samRow).toBeVisible({ timeout: 700 })
    // …and the change made while away appears once the fresh load lands.
    await expect(samRow).toContainText('$10', { timeout: 10_000 })

    expect(pageErrors).toEqual([])
  })
})
