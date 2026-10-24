import { test, expect, type Page } from '@playwright/test'
import { FLOAT_CARD_PAYMENT_LAG_NOTE } from '../../src/lib/brand'
import { createAdminFamily, insertBucket, serviceClient, setBucketAllocation } from '../db/fixtures'

// Paying a card can dip Unbucketed for a day or two (cash updates before the
// card does). The red hero adds a hedged note, but only when a card is counted
// and the shortfall is no bigger than what the cards owe.

async function household(name: string, opts: { cash: number; cardOwed: number | null; allocated: number }) {
  const family = await createAdminFamily(name)
  const svc = serviceClient()
  const account = (account_type: string, current_balance: number) =>
    svc.from('accounts').insert({
      family_id: family.familyId,
      owner_member_id: null,
      teller_account_id: `test-${crypto.randomUUID()}`,
      account_type,
      current_balance,
    })
  await account('checking', opts.cash)
  if (opts.cardOwed !== null) await account('credit_card', opts.cardOwed)
  const bucketId = await insertBucket(svc, family.familyId, 'Groceries', null)
  await setBucketAllocation(svc, bucketId, opts.allocated)
  return family
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')
}

const note = (page: Page) => page.getByText(FLOAT_CARD_PAYMENT_LAG_NOTE)

test.describe('Card payment lag note', () => {
  test('shows when red with a card and the shortfall fits within the card debt', async ({ page }) => {
    // 500 cash - 400 owed - 450 in buckets = -350 Unbucketed.
    const family = await household('e2e-cardnote-yes', { cash: 500, cardOwed: 400, allocated: 450 })
    await signIn(page, family.adminEmail, family.adminPassword)
    await expect(page.getByText(/more than your cash/)).toBeVisible()
    await expect(note(page)).toBeVisible()
  })

  test('is hidden when the shortfall is bigger than the card debt', async ({ page }) => {
    // 500 - 400 - 1000 = -900: over-bucketed, not a payment in flight.
    const family = await household('e2e-cardnote-big', { cash: 500, cardOwed: 400, allocated: 1000 })
    await signIn(page, family.adminEmail, family.adminPassword)
    await expect(page.getByText(/more than your cash/)).toBeVisible()
    await expect(note(page)).toHaveCount(0)
  })

  test('is hidden without a card', async ({ page }) => {
    const family = await household('e2e-cardnote-nocard', { cash: 500, cardOwed: null, allocated: 700 })
    await signIn(page, family.adminEmail, family.adminPassword)
    await expect(page.getByText(/more than you have/)).toBeVisible()
    await expect(note(page)).toHaveCount(0)
  })

  test('is hidden when Unbucketed is not negative', async ({ page }) => {
    const family = await household('e2e-cardnote-ok', { cash: 500, cardOwed: 100, allocated: 50 })
    await signIn(page, family.adminEmail, family.adminPassword)
    await expect(page.getByRole('tab', { name: 'Buckets', exact: true })).toBeVisible()
    await expect(note(page)).toHaveCount(0)
  })
})
