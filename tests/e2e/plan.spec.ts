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

test('linking a rule to a plan with only income keeps the rule: its buckets are copied into the plan', async ({ page }) => {
  const family = await createAdminFamily('e2e-plan-link-copy')
  const svc = serviceClient()
  const groceries = await insertBucket(svc, family.familyId, 'Groceries', null)
  const gas = await insertBucket(svc, family.familyId, 'Gas', null)
  const { data: rule, error: ruleError } = await svc
    .from('auto_organizes')
    .insert({
      family_id: family.familyId,
      name: 'Payday',
      created_by_member_id: family.adminMemberId,
      auto_organize_type: 'monthly',
      days_of_month: [7, 22],
    } as never)
    .select('id')
    .single()
  expect(ruleError).toBeNull()
  const { error: linesError } = await svc.from('auto_organize_lines').insert([
    { auto_organize_id: rule!.id, bucket_id: groceries, amount: 433.33, sort_order: 0 },
    { auto_organize_id: rule!.id, bucket_id: gas, amount: 60, sort_order: 1 },
  ] as never)
  expect(linesError).toBeNull()

  await signIn(page, family.adminEmail, family.adminPassword)
  const admin = await userClient(family.adminEmail, family.adminPassword)
  await admin.rpc('add_plan_line', { p_section: 'income', p_name: 'Salary', p_unit: 'year', p_amount_cents: 12_000_000 })

  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.getByRole('button', { name: 'Link to Auto-bucket' }).click()
  await page.getByRole('dialog', { name: 'Auto-bucket' }).getByRole('combobox').selectOption({ index: 1 })
  const confirm = page.getByRole('dialog', { name: 'Link Payday?' })
  await expect(confirm).toContainText('Its 2 buckets and their amounts will be copied into your plan.')
  await confirm.getByRole('button', { name: 'Link', exact: true }).click()

  // The rule moves exactly what it did before, now set from the plan.
  const linkSheet = page.getByRole('dialog', { name: 'Auto-bucket' })
  await expect(linkSheet).toContainText('$493.33')
  await linkSheet.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('button', { name: 'Groceries, Twice a month, $433.33' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gas, Monthly, $120.00' })).toBeVisible()
  const { data: lines } = await svc
    .from('auto_organize_lines')
    .select('bucket_id, amount')
    .eq('auto_organize_id', rule!.id)
    .order('sort_order')
  expect((lines ?? []).map((l) => [l.bucket_id, Number(l.amount)])).toEqual([
    [groceries, 433.33],
    [gas, 60],
  ])
})

test('an admin reorders lines: long-press drag, and Move up from the line sheet', async ({ page }) => {
  const family = await createAdminFamily('e2e-plan-reorder')
  await signIn(page, family.adminEmail, family.adminPassword)
  const admin = await userClient(family.adminEmail, family.adminPassword)
  await admin.rpc('add_plan_line', { p_section: 'income', p_name: 'Salary', p_unit: 'year', p_amount_cents: 12_000_000 })
  for (const name of ['Mortgage', 'Electric', 'Phone']) {
    await admin.rpc('add_plan_line', { p_section: 'bills', p_name: name, p_unit: 'month', p_amount_cents: 10_000 })
  }
  const billOrder = async () => {
    const { data } = await serviceClient()
      .from('plan_lines')
      .select('name')
      .eq('family_id', family.familyId)
      .eq('section', 'bills')
      .order('sort_order')
    return (data ?? []).map((l) => l.name)
  }

  await page.getByRole('tab', { name: 'Plan' }).click()
  const phone = page.getByRole('button', { name: 'Phone, details' })
  const mortgage = page.getByRole('button', { name: 'Mortgage, details' })
  await expect(phone).toBeVisible()

  // Hold Phone's name, then drag it above Mortgage.
  await phone.scrollIntoViewIfNeeded()
  const from = (await phone.boundingBox())!
  const to = (await mortgage.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(550)
  await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 12 })
  await page.mouse.up()
  await expect.poll(billOrder).toEqual(['Phone', 'Mortgage', 'Electric'])
  await expect(page.getByRole('dialog')).toHaveCount(0) // a drag never opens the line

  // A tap still opens the line; Move up applies right away and the sheet stays open.
  await page.getByRole('button', { name: 'Electric, details' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit line' })
  await sheet.getByRole('button', { name: 'Move up' }).click()
  await expect.poll(billOrder).toEqual(['Phone', 'Electric', 'Mortgage'])
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Move up' }).click()
  await expect.poll(billOrder).toEqual(['Electric', 'Phone', 'Mortgage'])
  await expect(sheet.getByRole('button', { name: 'Move up' })).toBeDisabled()

  // Keyboard: Enter on a line's name opens it.
  await sheet.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Mortgage, details' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Edit line' })).toBeVisible()
})
