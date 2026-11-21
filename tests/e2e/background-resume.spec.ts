import { test, expect } from '@playwright/test'
import { JOIN_CODE_LABEL, NAV_BUCKETS_LABEL } from '../../src/lib/brand'
import {
  addMember,
  createAdminFamily,
  familyJoinCode,
  setMemberPin,
} from '../db/fixtures'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

test.describe('Background sign-out', () => {
  test('a reload after a long background never lands back in the app without a PIN', async ({
    page,
  }) => {
    const family = await createAdminFamily('e2e-bgresume')
    const wife = await addMember(family.familyId, 'member', 'Wife')
    await setMemberPin(wife.memberId, '1111')
    const joinCode = await familyJoinCode(family.familyId)

    await page.goto('/login/family')
    await page.getByLabel(JOIN_CODE_LABEL).fill(joinCode)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Wife' }).click()
    await page.getByLabel('4-digit PIN').fill('1111')
    await expect(page.locator('nav').getByLabel(NAV_BUCKETS_LABEL)).toBeVisible()

    // Mobile OSes reload a purged background app with sessionStorage intact;
    // nothing runs while it is gone, so hidden-at is still the original hide
    // time. Recreate that on the next load (the reload itself fires a hide event,
    // so it must be set from an init script), and record if the app shell ever
    // paints afterwards.
    await page.addInitScript((hiddenAt) => {
      sessionStorage.setItem('bucketmymoney:app-hidden-at', String(hiddenAt))
      sessionStorage.setItem('bucketmymoney:session-gate-active', '1')
      const w = window as unknown as { __appShellSeen?: boolean }
      const watch = () => {
        if (document.querySelector('nav a[aria-label]')) w.__appShellSeen = true
        requestAnimationFrame(watch)
      }
      requestAnimationFrame(watch)
    }, Date.now() - TWO_HOURS_MS)

    // A slow network keeps the membership lookup in flight past the policy
    // sign-out — the window where a stale result used to sign back in.
    await page.route('**/rest/v1/rpc/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })

    await page.reload()
    await expect(page).toHaveURL(/\/login\/family/)
    await expect(page.getByRole('button', { name: 'Wife' })).toBeVisible()
    // Outlast the delayed lookup so a stale result would have landed by now.
    await page.waitForTimeout(3000)

    await expect(page).toHaveURL(/\/login\/family/)
    expect(
      await page.evaluate(
        () => (window as unknown as { __appShellSeen?: boolean }).__appShellSeen ?? false,
      ),
    ).toBe(false)
    expect(
      await page.evaluate(() =>
        Object.keys(sessionStorage).some((k) => k.endsWith('-auth-token')),
      ),
    ).toBe(false)
  })

  test('a reload after a long background lands on PIN even when hidden-at was erased', async ({
    page,
  }) => {
    const family = await createAdminFamily('e2e-bgerased')
    const wife = await addMember(family.familyId, 'member', 'Wife')
    await setMemberPin(wife.memberId, '1111')
    const joinCode = await familyJoinCode(family.familyId)

    await page.goto('/login/family')
    await page.getByLabel(JOIN_CODE_LABEL).fill(joinCode)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Wife' }).click()
    await page.getByLabel('4-digit PIN').fill('1111')
    await expect(page.locator('nav').getByLabel(NAV_BUCKETS_LABEL)).toBeVisible()

    // A token refresh landing just after the app was hidden used to clear
    // hidden-at and the gate flag, so a purged app reloaded an hour later had
    // tokens and nothing saying it had been away — and walked straight in. Only
    // the activity stamp (last visible use) is left to go on.
    await page.addInitScript((lastActiveAt) => {
      sessionStorage.removeItem('bucketmymoney:app-hidden-at')
      sessionStorage.removeItem('bucketmymoney:session-gate-active')
      sessionStorage.setItem('bucketmymoney:last-active-at', String(lastActiveAt))
      const w = window as unknown as { __appShellSeen?: boolean }
      const watch = () => {
        if (document.querySelector('nav a[aria-label]')) w.__appShellSeen = true
        requestAnimationFrame(watch)
      }
      requestAnimationFrame(watch)
    }, Date.now() - TWO_HOURS_MS)

    await page.reload()
    await expect(page).toHaveURL(/\/login\/family/)
    await expect(page.getByRole('button', { name: 'Wife' })).toBeVisible()
    await page.waitForTimeout(2000)

    await expect(page).toHaveURL(/\/login\/family/)
    expect(
      await page.evaluate(
        () => (window as unknown as { __appShellSeen?: boolean }).__appShellSeen ?? false,
      ),
    ).toBe(false)
    expect(
      await page.evaluate(() =>
        Object.keys(sessionStorage).some((k) => k.endsWith('-auth-token')),
      ),
    ).toBe(false)
  })
})
