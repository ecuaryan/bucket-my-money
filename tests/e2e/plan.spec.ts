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

test('a note can be written while adding a line; a Buckets line’s note is its bucket’s', async ({ page }) => {
  const family = await createAdminFamily('e2e-plan-add-note')
  const svc = serviceClient()
  const groceries = await insertBucket(svc, family.familyId, 'Groceries', null)
  await svc.from('buckets').update({ notes: 'Costco runs count here' } as never).eq('id', groceries)
  await insertBucket(svc, family.familyId, 'Gas', null)
  await signIn(page, family.adminEmail, family.adminPassword)
  const admin = await userClient(family.adminEmail, family.adminPassword)
  await admin.rpc('add_plan_line', { p_section: 'income', p_name: 'Salary', p_unit: 'year', p_amount_cents: 12_000_000 })
  await page.getByRole('tab', { name: 'Plan' }).click()

  // A bill: the note is saved with the line.
  await page.getByRole('button', { name: 'Add line to Bills' }).click()
  const addBill = page.getByRole('dialog', { name: 'Add bill' })
  await addBill.getByLabel('Name').fill('Electric')
  await addBill.getByLabel('Amount').fill('120')
  await addBill.getByLabel('Note').fill('Due the 3rd')
  await addBill.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(addBill).toBeHidden()
  await page.getByRole('button', { name: 'Electric, details' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit line' }).getByLabel('Note')).toHaveValue('Due the 3rd')
  await page.getByRole('dialog', { name: 'Edit line' }).getByRole('button', { name: 'Close' }).click()

  // An existing bucket shows its note; editing it here updates the bucket.
  await page.getByRole('button', { name: 'Add line to Buckets' }).click()
  const addBucket = page.getByRole('dialog', { name: 'Add bucket' })
  const bucketSelect = addBucket.getByRole('combobox', { name: 'Bucket' })
  await bucketSelect.selectOption({ label: 'Groceries' })
  await expect(addBucket.getByLabel('Bucket note')).toHaveValue('Costco runs count here')
  await addBucket.getByLabel('Bucket note').fill('Costco and farmers market')
  await addBucket.getByLabel('Amount').fill('400')
  await addBucket.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(addBucket).toBeHidden()

  // A new bucket is created with the note.
  await page.getByRole('button', { name: 'Add line to Buckets' }).click()
  await bucketSelect.selectOption({ label: 'New bucket' })
  await expect(addBucket.getByLabel('Bucket note')).toHaveValue('')
  await addBucket.getByLabel('New bucket name').fill('Vacation')
  await addBucket.getByLabel('Amount').fill('50')
  await addBucket.getByLabel('Bucket note').fill('Beach in June')
  await addBucket.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(addBucket).toBeHidden()

  await expect
    .poll(async () => {
      const { data } = await svc.from('buckets').select('name, notes').eq('family_id', family.familyId).order('name')
      return data
    })
    .toEqual([
      { name: 'Gas', notes: null },
      { name: 'Groceries', notes: 'Costco and farmers market' },
      { name: 'Vacation', notes: 'Beach in June' },
    ])
  const { data: bucketLines } = await svc.from('plan_lines').select('notes').eq('family_id', family.familyId).eq('section', 'buckets')
  expect(bucketLines?.map((l) => l.notes)).toEqual([null, null]) // the note lives on the bucket
})

test('an admin can lock editing on this device, and unlock it', async ({ page }) => {
  const family = await createAdminFamily('e2e-plan-lock')
  await signIn(page, family.adminEmail, family.adminPassword)
  const admin = await userClient(family.adminEmail, family.adminPassword)
  await admin.rpc('add_plan_line', { p_section: 'income', p_name: 'Salary', p_unit: 'year', p_amount_cents: 12_000_000 })
  await page.getByRole('tab', { name: 'Plan' }).click()
  await expect(page.getByRole('button', { name: 'Salary, Monthly, $10,000.00' })).toBeVisible()

  const lock = async (on: boolean) => {
    await page.getByRole('button', { name: /^View/ }).click()
    const sheet = page.getByRole('dialog', { name: 'View' })
    const toggle = sheet.getByRole('switch', { name: 'Lock editing' })
    if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click()
    await sheet.getByRole('button', { name: 'Close' }).click()
  }

  await lock(true)
  await expect(page.getByRole('button', { name: 'View, editing locked' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add line to/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Salary, Monthly/ })).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: 'Salary' })).toContainText('$10,000.00')

  // It stays locked after a reload (a per-device preference).
  await page.reload()
  await expect(page.getByRole('button', { name: 'View, editing locked' })).toBeVisible()

  await lock(false)
  await expect(page.getByRole('button', { name: 'Salary, Monthly, $10,000.00' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add line to Bills' })).toBeVisible()
})

test('leaving an open cell untouched never undoes the other person’s change', async ({ page }) => {
  const family = await createAdminFamily('e2e-plan-stale-cell')
  await signIn(page, family.adminEmail, family.adminPassword)
  const admin = await userClient(family.adminEmail, family.adminPassword)
  await admin.rpc('add_plan_line', { p_section: 'income', p_name: 'Salary', p_unit: 'year', p_amount_cents: 12_000_000 })
  const { data: groceries } = await admin.rpc('add_plan_line', {
    p_section: 'bills', p_name: 'Groceries', p_unit: 'month', p_amount_cents: 80_000,
  })
  await page.getByRole('tab', { name: 'Plan' }).click()

  // Open the cell, then the other person changes the same line.
  await page.getByRole('button', { name: 'Groceries, Monthly, $800.00' }).click()
  const cell = page.getByRole('textbox', { name: 'Groceries, Monthly' })
  await expect(cell).toBeFocused()
  await admin.rpc('set_plan_line_amount', { p_line_id: groceries as string, p_unit: 'month', p_amount_cents: 90_000 })
  await page.waitForTimeout(1500) // realtime brings the new value in underneath

  // Leaving without typing stores nothing: their $900 stays.
  await cell.press('Tab')
  await expect(cell).toBeHidden()
  await expect(page.getByRole('button', { name: 'Groceries, Monthly, $900.00' })).toBeVisible()
  const { data } = await serviceClient().from('plan_lines').select('amount_cents').eq('id', groceries as string).single()
  expect(Number(data?.amount_cents)).toBe(90_000)
})

test('household notes under the plan: admins write, shared members read', async ({ browser }) => {
  const family = await createAdminFamily('e2e-plan-notes')
  const adminCtx = await browser.newContext()
  const page = await adminCtx.newPage()
  await signIn(page, family.adminEmail, family.adminPassword)
  const admin = await userClient(family.adminEmail, family.adminPassword)
  await admin.rpc('add_plan_line', { p_section: 'income', p_name: 'Salary', p_unit: 'year', p_amount_cents: 12_000_000 })
  await page.getByRole('tab', { name: 'Plan' }).click()

  const notes = page.getByRole('region', { name: 'Notes' })
  await notes.getByRole('button', { name: 'Add notes' }).click()
  const sheet = page.getByRole('dialog', { name: 'Notes' })
  await sheet.getByRole('textbox', { name: 'Notes' }).fill('Mortgage autopays from checking on the 1st.\nLife insurance policy is in the safe.')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await expect(notes).toContainText('Life insurance policy is in the safe.')
  await expect(notes.getByRole('button', { name: 'Edit' })).toBeVisible()

  const member = await addMember(family.familyId, 'member', 'Partner')
  const memberCtx = await browser.newContext()
  const shared = await memberCtx.newPage()
  await signIn(shared, member.email, member.password)
  await shared.getByRole('tab', { name: 'Plan' }).click()
  const sharedNotes = shared.getByRole('region', { name: 'Notes' })
  await expect(sharedNotes).toContainText('Mortgage autopays from checking on the 1st.')
  await expect(sharedNotes.getByRole('button')).toHaveCount(0)
  await adminCtx.close()
  await memberCtx.close()
})

test('tapping a number while editing is locked says why, once per burst', async ({ page }) => {
  const family = await createAdminFamily('e2e-plan-locked-tap')
  await signIn(page, family.adminEmail, family.adminPassword)
  const admin = await userClient(family.adminEmail, family.adminPassword)
  await admin.rpc('add_plan_line', { p_section: 'income', p_name: 'Salary', p_unit: 'year', p_amount_cents: 12_000_000 })
  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.getByRole('button', { name: 'View' }).click()
  await page.getByRole('dialog', { name: 'View' }).getByRole('switch', { name: 'Lock editing' }).click()
  await page.getByRole('dialog', { name: 'View' }).getByRole('button', { name: 'Close' }).click()

  const salaryMonthly = page.getByRole('row').filter({ hasText: 'Salary' }).getByRole('cell').filter({ hasText: '$10,000.00' }).first()
  await salaryMonthly.click()
  await expect(page.getByRole('status').filter({ hasText: 'Editing is locked. Turn it off in View.' })).toBeVisible()
  await salaryMonthly.click()
  await salaryMonthly.click()
  await expect(page.getByRole('status').filter({ hasText: 'Editing is locked' })).toHaveCount(1)
  await expect(page.getByRole('textbox')).toHaveCount(0)
})
