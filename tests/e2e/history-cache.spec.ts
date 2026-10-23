import { test, expect, type Page } from '@playwright/test'
import {
  addMember,
  createAdminFamily,
  giveMoney,
  insertBucket,
  moveMoney,
  serviceClient,
  setBucketAllocation,
  userClient,
} from '../db/fixtures'

// History remembers the first page per filter so coming back is instant. These
// guard the ways that can go wrong: one filter's rows saved under another
// filter's key (it once showed 15 rows instead of 10 after All → Gives → All),
// and a transfer made while you were away not showing up on return.

const rows = (page: Page) =>
  page.locator('main li').filter({ hasText: /\$\d/ })

/** In-app filter change (no reload), like picking an option in the filter. */
async function switchFilter(page: Page, search: string) {
  await page.evaluate((qs) => {
    history.pushState({}, '', `/history${qs}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, search)
}

test.describe('History cache', () => {
  test('filters never show each other\'s rows, and a transfer made while away shows up', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    // 12 bucket moves + 3 gives = 15 rows: more than one page (10), and the
    // Gives filter holds different rows than All.
    const family = await createAdminFamily('e2e-history-cache')
    const kid = await addMember(family.familyId, 'child', 'Sam')
    const svc = serviceClient()
    await svc.from('accounts').insert({
      family_id: family.familyId,
      owner_member_id: null,
      teller_account_id: `test-${crypto.randomUUID()}`,
      account_type: 'checking',
      current_balance: 500,
    })
    const a = await insertBucket(svc, family.familyId, 'Alpha', null)
    const b = await insertBucket(svc, family.familyId, 'Beta', null)
    await setBucketAllocation(svc, a, 100)
    await setBucketAllocation(svc, b, 100)
    const admin = await userClient(family.adminEmail, family.adminPassword)
    for (let i = 0; i < 12; i++) {
      await moveMoney(admin, i % 2 === 0
        ? { fromBucketId: a, toBucketId: b, amount: 1 }
        : { fromBucketId: b, toBucketId: a, amount: 1 })
    }
    for (let i = 0; i < 3; i++) {
      await giveMoney(admin, { toMemberId: kid.memberId, amount: 2 })
    }

    await page.goto('/login')
    await page.locator('#login-email').fill(family.adminEmail)
    await page.locator('#login-password').fill(family.adminPassword)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL('/')

    const nav = page.getByRole('navigation')
    await nav.getByRole('link', { name: 'History' }).click()
    await expect(page.getByText('15 transactions')).toBeVisible()
    await expect(rows(page)).toHaveCount(10)

    // All → Gives → All, twice: each list is exactly its own rows every time.
    for (let cycle = 0; cycle < 2; cycle++) {
      await switchFilter(page, '?type=give')
      await expect(page.getByText('3 gives & takes')).toBeVisible()
      await expect(rows(page)).toHaveCount(3)

      await switchFilter(page, '')
      await expect(page.getByText('15 transactions')).toBeVisible()
      await expect(rows(page)).toHaveCount(10)
    }

    // A transfer made while you are away appears when you come back.
    await nav.getByRole('link', { name: 'Buckets' }).click()
    await giveMoney(admin, { toMemberId: kid.memberId, amount: 7.77 })
    await nav.getByRole('link', { name: 'History' }).click()
    await expect(page.getByText('16 transactions')).toBeVisible()
    await expect(rows(page).first()).toContainText('7.77')
    // Everything you had seen stays, plus the new row on top (as with live updates).
    await expect(rows(page)).toHaveCount(11)

    expect(pageErrors).toEqual([])
  })
})
