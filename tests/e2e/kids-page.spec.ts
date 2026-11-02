import { test, expect } from '@playwright/test'
import { FLOAT_LABEL, KIDS_PAGE_TITLE } from '../../src/lib/brand'
import { addMember, createAdminFamily, serviceClient } from '../db/fixtures'

async function signInAdmin(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Kids tab', () => {
  test('admin sees Kids nav, Give and Take on a kid without a linked account', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    const family = await createAdminFamily('e2e-kids')
    await addMember(family.familyId, 'child', 'Sam')
    const svc = serviceClient()
    await svc.from('accounts').insert({
      family_id: family.familyId,
      owner_member_id: null,
      teller_account_id: `test-${crypto.randomUUID()}`,
      account_type: 'checking',
      current_balance: 500,
    })

    await signInAdmin(page, family.adminEmail, family.adminPassword)

    await expect(page.getByRole('link', { name: 'Kids' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Give' })).not.toBeVisible()

    await page.goto('/give')
    await expect(page).toHaveURL('/kids')

    await expect(page.getByRole('heading', { name: 'Kids', exact: true })).toBeVisible()
    await expect(
      page.getByRole('region', { name: KIDS_PAGE_TITLE }),
    ).toBeVisible()

    const samRow = page.getByRole('listitem').filter({ hasText: 'Sam' })
    await expect(samRow).toContainText('$0')

    await samRow.getByRole('button', { name: 'Give to Sam' }).click()
    const giveSheet = page.getByRole('dialog', { name: 'Give to Sam' })
    await expect(giveSheet).toBeVisible()
    await giveSheet.locator('input').first().fill('10')
    await giveSheet.getByRole('button', { name: 'Give', exact: true }).click()
    await expect(giveSheet).not.toBeVisible()
    await expect(page.getByText('Gave $10 to Sam.')).toBeVisible()
    await expect(samRow).toContainText('$10')

    await samRow.getByRole('button', { name: 'Take from Sam' }).click()
    const takeSheet = page.getByRole('dialog', { name: 'Take from Sam' })
    await expect(takeSheet).toBeVisible()
    await takeSheet.locator('input').first().fill('5')
    await takeSheet
      .getByRole('button', { name: `Take back to ${FLOAT_LABEL}`, exact: true })
      .click()
    await expect(takeSheet).not.toBeVisible()
    await expect(
      page.getByText(`Took $5 from Sam back to shared unbucketed cash.`),
    ).toBeVisible()
    await expect(samRow).toContainText('$5')

    expect(pageErrors).toEqual([])
  })
})
