import { test, expect, type Page } from '@playwright/test'
import { addMember, createAdminFamily, insertBucket, serviceClient, userClient } from '../db/fixtures'

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')
}

test('an admin builds a plan; a shared member sees it read-only', async ({ browser }) => {
  const family = await createAdminFamily('e2e-plan')
  const pageErrors: string[] = []

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  admin.on('pageerror', (err) => pageErrors.push(err.message))
  await signIn(admin, family.adminEmail, family.adminPassword)

  // First visit: one line and one action.
  await admin.getByRole('tab', { name: 'Plan' }).click()
  await expect(admin.getByText('Start your plan with your pay.')).toBeVisible()
  await admin.getByRole('button', { name: 'Add income' }).click()

  const addIncome = admin.getByRole('dialog', { name: 'Add income' })
  const addButton = addIncome.getByRole('button', { name: 'Add', exact: true })
  await expect(addButton).toBeDisabled()
  await addIncome.getByLabel('Name').fill('Salary')
  await addIncome.getByLabel('Gross amount').fill('120000')
  await addIncome.getByRole('button', { name: 'Yearly' }).click()
  await addButton.click()
  await expect(addIncome).toBeHidden()

  // The income converts into every column, and the starter Withheld lines arrive.
  await expect(admin.getByRole('button', { name: 'Salary, Monthly, $10,000.00' })).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Medicare, details' })).toBeVisible()

  // Tap a cell, type, Enter: that column becomes the line's input.
  await admin.getByRole('button', { name: /^Medicare, Twice a month,/ }).click()
  const cell = admin.getByRole('textbox', { name: 'Medicare, Twice a month' })
  await cell.fill('100')
  await cell.press('Enter')
  await expect(admin.getByRole('button', { name: 'Medicare, Monthly, $200.00' })).toBeVisible()

  // Invalid text keeps the cell open and marked; Escape cancels and returns focus.
  await admin.getByRole('button', { name: /^Dental insurance, Monthly,/ }).click()
  const dental = admin.getByRole('textbox', { name: 'Dental insurance, Monthly' })
  await dental.fill('abc')
  await dental.press('Enter')
  await expect(dental).toHaveAttribute('aria-invalid', 'true')
  await dental.press('Escape')
  await expect(dental).toBeHidden()
  await expect(admin.getByRole('button', { name: /^Dental insurance, Monthly,/ })).toBeFocused()

  // Clearing a cell and leaving it cancels instead of erroring.
  await admin.getByRole('button', { name: /^Dental insurance, Monthly,/ }).click()
  await dental.fill('')
  await dental.press('Enter')
  await expect(dental).toBeHidden()
  await expect(admin.getByRole('button', { name: 'Dental insurance, Monthly, $0.00' })).toBeVisible()

  // Unplanned = $10,000 − $200 a month.
  const unplanned = admin.getByRole('row').filter({ hasText: 'Unplanned' })
  await expect(unplanned).toContainText('$9,800.00')

  // A shared member sees the same plan, with nothing editable.
  const member = await addMember(family.familyId, 'member', 'Partner')
  const memberContext = await browser.newContext()
  const shared = await memberContext.newPage()
  shared.on('pageerror', (err) => pageErrors.push(err.message))
  await signIn(shared, member.email, member.password)
  await shared.getByRole('tab', { name: 'Plan' }).click()
  await expect(shared.getByRole('row').filter({ hasText: 'Unplanned' })).toContainText('$9,800.00')
  await expect(shared.getByRole('button', { name: /^Add line to/ })).toHaveCount(0)
  await expect(shared.getByRole('button', { name: /^Medicare, Monthly/ })).toHaveCount(0)

  expect(pageErrors).toEqual([])
  await adminContext.close()
  await memberContext.close()
})

test('a child never gets the Plan tab', async ({ page }) => {
  const family = await createAdminFamily('e2e-plan-child')
  const child = await addMember(family.familyId, 'child', 'Kid')
  await signIn(page, child.email, child.password)
  await expect(page.getByRole('tab', { name: 'Plan' })).toHaveCount(0)
  await page.goto('/?tab=plan')
  await expect(page.getByRole('table', { name: 'Plan' })).toHaveCount(0)
})

test('linking an Auto-bucket rule: the plan sets its amounts and the editor locks them', async ({ page }) => {
  const family = await createAdminFamily('e2e-plan-link')
  const svc = serviceClient()
  const groceries = await insertBucket(svc, family.familyId, 'Groceries', null)
  const { error: ruleError } = await svc.from('auto_organizes').insert({
    family_id: family.familyId,
    name: 'Payday',
    created_by_member_id: family.adminMemberId,
    auto_organize_type: 'monthly',
    days_of_month: [5, 20],
  } as never)
  expect(ruleError).toBeNull()

  await signIn(page, family.adminEmail, family.adminPassword)
  const admin = await userClient(family.adminEmail, family.adminPassword)
  await admin.rpc('add_plan_line', { p_section: 'income', p_name: 'Salary', p_unit: 'year', p_amount_cents: 12_000_000 })
  await admin.rpc('add_plan_line', { p_section: 'buckets', p_unit: 'two_weeks', p_amount_cents: 40_000, p_bucket_id: groceries })

  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.getByRole('button', { name: 'Link to Auto-bucket' }).click()
  await page.getByRole('dialog', { name: 'Auto-bucket' }).getByRole('combobox').selectOption({ index: 1 }) // the only linkable rule
  const confirm = page.getByRole('dialog', { name: 'Link Payday?' })
  await expect(confirm).toContainText('Its buckets and amounts will come from your plan.')
  await confirm.getByRole('button', { name: 'Link', exact: true }).click()

  // $400 every 2 weeks → $433.33 per twice-a-month run, shown in the ⚡ column.
  const linkSheet = page.getByRole('dialog', { name: 'Auto-bucket' })
  await expect(linkSheet).toContainText('$433.33')
  await linkSheet.getByRole('button', { name: 'Open in Auto-bucket' }).click()

  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toBeVisible() // the PLAN chip
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const editor = page.getByRole('dialog').last()
  await expect(editor.getByRole('button', { name: 'Set in Plan' })).toBeVisible()
  await expect(editor).toContainText('$433.33')
  await expect(editor.locator('input[inputmode="decimal"]')).toHaveCount(0)
})
