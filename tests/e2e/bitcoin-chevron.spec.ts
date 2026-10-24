import { test, expect } from '@playwright/test'
import { addMember, createAdminFamily, serviceClient } from '../db/fixtures'

// The Kids page's Bitcoin section rows use the same chevron as every other expandable row
// in the app (a down chevron that flips when open), not a ▶ text glyph.

test('Bitcoin section rows use the app-wide chevron', async ({ page }) => {
  const family = await createAdminFamily('e2e-btc-chevron')
  await addMember(family.familyId, 'child', 'Sam')
  const { error } = await serviceClient()
    .from('feature_flags')
    .insert({ family_id: family.familyId, key: 'bitcoin', enabled: true })
  if (error) throw error

  await page.goto('/login')
  await page.locator('#login-email').fill(family.adminEmail)
  await page.locator('#login-password').fill(family.adminPassword)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')
  await page.goto('/kids')

  const row = page.getByRole('button', { name: /Sam/ }).filter({ has: page.locator('svg') }).first()
  await expect(row).toBeVisible()
  await expect(row).not.toContainText('▶')
  const chevron = row.locator('svg').first()
  await expect(chevron).not.toHaveClass(/rotate-180/)
  await row.click()
  await expect(chevron).toHaveClass(/rotate-180/)
})
