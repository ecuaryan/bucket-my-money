import { test, expect, type Page } from '@playwright/test'
import { JOIN_CODE_LABEL } from '../../src/lib/brand'
import {
  addMember,
  createAdminFamily,
  familyJoinCode,
  setMemberPin,
} from '../db/fixtures'

// Small motion details: content that fades in when it replaces a loading
// skeleton (but not when it opens instantly from cache), buttons that dip when
// pressed, and a field that shakes on a wrong PIN. All off for reduced motion.

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')
}

/** Slow every data request so loading skeletons are on screen long enough to see. */
function slowData(page: Page) {
  const control = { slow: true }
  void page.route('**/rest/v1/**', async (route) => {
    if (control.slow) await new Promise((r) => setTimeout(r, 500))
    await route.continue().catch(() => {})
  })
  return control
}

const fadeTargets = (page: Page) => page.locator('main .content-fade-enter')

test.describe('Skeleton to content fade', () => {
  test('content fades in after a skeleton, but not when History returns from cache', async ({ page }) => {
    const family = await createAdminFamily('e2e-micro-fade')
    await signIn(page, family.adminEmail, family.adminPassword)
    const nav = page.getByRole('navigation')

    const data = slowData(page)
    await nav.getByRole('link', { name: 'History' }).click()
    await expect(page).toHaveURL(/\/history/)
    await expect(fadeTargets(page)).toHaveCount(1)
    data.slow = false
    // Leave only once History has saved its cache (it does so after the slow
    // first load settles); a slow CI machine can otherwise navigate away first.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(sessionStorage).some((k) => k.startsWith('bucketmymoney:history:')),
        ),
      )
      .toBe(true)

    // Away and back: History opens from its cache, no skeleton, so no fade.
    await nav.getByRole('link', { name: 'Buckets' }).click()
    await nav.getByRole('link', { name: 'History' }).click()
    await expect(page).toHaveURL(/\/history/)
    await expect(page.getByText('Nothing here yet')).toBeVisible()
    await expect(fadeTargets(page)).toHaveCount(0)
  })

  test('with reduced motion nothing animates', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const family = await createAdminFamily('e2e-micro-fade-reduced')
    await signIn(page, family.adminEmail, family.adminPassword)
    slowData(page)
    await page.getByRole('navigation').getByRole('link', { name: 'History' }).click()
    await expect(fadeTargets(page)).toHaveCount(1)
    expect(
      await page.evaluate(() => document.querySelector('.content-fade-enter')!.getAnimations().length),
    ).toBe(0)
  })
})

test.describe('Button press feedback', () => {
  const pressedScale = async (page: Page, selector: string) => {
    const target = page.locator(selector).first()
    await target.hover()
    await page.mouse.down()
    // The dip is eased over ~150ms, so wait for it to settle.
    await page.waitForTimeout(400)
    const scale = await target.evaluate((el) => getComputedStyle(el).scale)
    await page.mouse.up()
    return scale
  }

  test('buttons dip while pressed; tabs and disabled buttons do not', async ({ page }) => {
    const family = await createAdminFamily('e2e-micro-press')
    await signIn(page, family.adminEmail, family.adminPassword)
    await expect(page.getByRole('tab', { name: 'Buckets', exact: true })).toBeVisible()

    expect(await pressedScale(page, 'main button:enabled:not([role="tab"])')).toBe('0.97')
    expect(await pressedScale(page, '[role="tab"][aria-selected="false"]')).toBe('none')
    expect(
      await page.evaluate(() => {
        const b = document.createElement('button')
        b.disabled = true
        b.textContent = 'x'
        document.body.append(b)
        const style = getComputedStyle(b)
        const idle = style.scale
        b.remove()
        return idle
      }),
    ).toBe('none')
  })

  test('with reduced motion buttons do not scale', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const family = await createAdminFamily('e2e-micro-press-reduced')
    await signIn(page, family.adminEmail, family.adminPassword)
    await expect(page.getByRole('tab', { name: 'Buckets', exact: true })).toBeVisible()
    expect(await pressedScale(page, 'main button:enabled:not([role="tab"])')).toBe('none')
  })
})

test.describe('Wrong PIN shake', () => {
  async function attemptPin(page: Page, pin: string) {
    const family = await createAdminFamily('e2e-micro-shake')
    const wife = await addMember(family.familyId, 'member', 'Wife')
    await setMemberPin(wife.memberId, '1111')
    const joinCode = await familyJoinCode(family.familyId)

    // Count shake animations started on the PIN field.
    await page.addInitScript(() => {
      const w = window as unknown as { __shakes: number }
      w.__shakes = 0
      const original = Element.prototype.animate
      Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
        if ((this as HTMLElement).classList.contains('pin-mask')) w.__shakes += 1
        return original.apply(this, args)
      }
    })
    await page.goto('/login/family')
    await page.getByLabel(JOIN_CODE_LABEL).fill(joinCode)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Wife' }).click()
    await page.getByLabel('4-digit PIN').fill(pin)
  }
  const shakes = (page: Page) =>
    page.evaluate(() => (window as unknown as { __shakes: number }).__shakes)

  test('a wrong PIN shakes the field, every time', async ({ page }) => {
    await attemptPin(page, '9999')
    // (Dev mode double-runs effects, so count "more than before", not exact.)
    await expect.poll(() => shakes(page)).toBeGreaterThan(0)
    await expect(page.getByLabel('4-digit PIN')).toHaveValue('')
    const afterFirst = await shakes(page)
    await page.getByLabel('4-digit PIN').fill('8888')
    await expect.poll(() => shakes(page)).toBeGreaterThan(afterFirst)
  })

  test('with reduced motion the field does not shake', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await attemptPin(page, '9999')
    await expect(page.getByRole('alert').or(page.getByText(/incorrect|wrong|invalid/i)).first()).toBeVisible()
    expect(await shakes(page)).toBe(0)
  })
})
