import { test, expect, type Page } from '@playwright/test'
import { JOIN_CODE_LABEL } from '../../src/lib/brand'
import {
  addMember,
  createAdminFamily,
  familyJoinCode,
  serviceClient,
  setMemberPin,
} from '../db/fixtures'

// Biometric (WebAuthn passkey) login. We drive a CDP virtual authenticator so
// there is no real Touch ID prompt: `transport: 'internal'` makes the app see a
// platform authenticator, and `isUserVerified: true` auto-passes verification.
// This exercises the full loop: enroll (register-options/-verify) → sign out →
// unlock on the email/password page (login-options/-verify) → signed in.

async function addVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page)
  await client.send('WebAuthn.enable')
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
}

async function signInAdmin(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Biometric login', () => {
  test('admin enrolls a passkey, then unlocks from the email page with the fingerprint', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => {
      // supabase-js realtime emits a transient non-Error rejection during rapid
      // auth churn (shows as "Object"); it's library-internal, not an app error.
      if (err.message === 'Object' || err.message === '[object Object]') return
      pageErrors.push(err.message)
    })

    await addVirtualAuthenticator(page)
    const family = await createAdminFamily('e2e-biometric')

    // No passkey yet → the email page must not show the fingerprint unlock.
    await page.goto('/login')
    await expect(
      page.getByRole('button', { name: 'Unlock with Face ID or Touch ID' }),
    ).toHaveCount(0)

    // Enroll on this device from Settings.
    await signInAdmin(page, family.adminEmail, family.adminPassword)
    await page.goto('/settings')
    const enableButton = page.getByRole('button', { name: 'Enable on this device' })
    await expect(enableButton).toBeVisible()
    await enableButton.click()
    await expect(
      page.getByRole('button', { name: 'Turn off on this device' }),
    ).toBeVisible()

    // Sign out — the per-device binding survives in localStorage.
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    // The fingerprint now appears on the email/password page; tapping it signs in.
    const unlock = page.getByRole('button', {
      name: 'Unlock with Face ID or Touch ID',
    })
    await expect(unlock).toBeVisible()
    await unlock.click()
    await expect(page).toHaveURL('/')

    expect(pageErrors).toEqual([])
  })

  test('owner can sign in from the email page with their PIN, beside the print', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => {
      // supabase-js realtime emits a transient non-Error rejection during rapid
      // auth churn (shows as "Object"); it's library-internal, not an app error.
      if (err.message === 'Object' || err.message === '[object Object]') return
      pageErrors.push(err.message)
    })

    await addVirtualAuthenticator(page)
    const family = await createAdminFamily('e2e-email-pin')

    await signInAdmin(page, family.adminEmail, family.adminPassword)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Enable on this device' }).click()
    await expect(
      page.getByRole('button', { name: 'Turn off on this device' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Set a PIN' }).click()
    await page.getByLabel('New 4-digit PIN').fill('4321')
    await page.getByRole('button', { name: 'Save PIN' }).click()
    await expect(page.getByText('PIN set.')).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/login')

    // The "PIN" button appears beside the fingerprint; it routes through
    // pin-login (same lockout), no join code needed.
    const pinButton = page.getByRole('button', { name: 'PIN', exact: true })
    await expect(pinButton).toBeVisible()
    await pinButton.click()
    await page.getByLabel('4-digit PIN').fill('4321')
    await expect(page).toHaveURL('/')

    expect(pageErrors).toEqual([])
  })

  test('hides the fingerprint when the server no longer has the passkey', async ({
    page,
  }) => {
    await addVirtualAuthenticator(page)
    const family = await createAdminFamily('e2e-bio-stale')

    await signInAdmin(page, family.adminEmail, family.adminPassword)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Enable on this device' }).click()
    await expect(
      page.getByRole('button', { name: 'Turn off on this device' }),
    ).toBeVisible()

    // Simulate the credential being revoked server-side (admin reset / reseed)
    // while this device still holds its local binding.
    await serviceClient()
      .from('member_passkeys')
      .delete()
      .eq('member_id', family.adminMemberId)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/login')

    // The on-load check finds no passkey, clears the stale binding, and never
    // offers the fingerprint.
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('bucketmymoney_biometric')),
      )
      .toBeNull()
    await expect(
      page.getByRole('button', { name: 'Unlock with Face ID or Touch ID' }),
    ).toHaveCount(0)
  })

  test('a PIN member enrolls, then lands on their PIN screen and unlocks with the fingerprint', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => {
      // supabase-js realtime emits a transient non-Error rejection during rapid
      // auth churn (shows as "Object"); it's library-internal, not an app error.
      if (err.message === 'Object' || err.message === '[object Object]') return
      pageErrors.push(err.message)
    })

    await addVirtualAuthenticator(page)
    const family = await createAdminFamily('e2e-bio-pin')
    const wife = await addMember(family.familyId, 'member', 'Wife')
    await setMemberPin(wife.memberId, '1357')
    const joinCode = await familyJoinCode(family.familyId)

    // Sign in as the PIN member via the family roster (exercises pin-login).
    await page.goto('/login/family')
    await page.getByLabel(JOIN_CODE_LABEL).fill(joinCode)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Wife' }).click()
    await page.getByLabel('4-digit PIN').fill('1357')
    await expect(page).toHaveURL('/')

    // Enroll a passkey on this device.
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Enable on this device' }).click()
    // A member with a PIN must confirm it first; a wrong PIN is refused.
    await page.getByLabel('Your 4-digit PIN').fill('0000')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('alert')).toContainText('Wrong PIN')
    await page.getByLabel('Your 4-digit PIN').fill('1357')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(
      page.getByRole('button', { name: 'Turn off on this device' }),
    ).toBeVisible()

    // Sign out → the enrolled member auto-lands on their PIN screen, which now
    // shows the fingerprint (no separate "tap to unlock" gate). Tapping unlocks.
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/login/family')

    const unlock = page.getByRole('button', {
      name: 'Unlock with Face ID or Touch ID',
    })
    await expect(unlock).toBeVisible()
    await unlock.click()
    await expect(page).toHaveURL('/')

    expect(pageErrors).toEqual([])
  })

  test('a member with biometric but no PIN can still unlock on the roster', async ({
    page,
  }) => {
    await addVirtualAuthenticator(page)
    const family = await createAdminFamily('e2e-bio-nopin')
    const wife = await addMember(family.familyId, 'member', 'Wife')
    await setMemberPin(wife.memberId, '2468')
    const joinCode = await familyJoinCode(family.familyId)

    // Sign in by PIN, then enroll biometric.
    await page.goto('/login/family')
    await page.getByLabel(JOIN_CODE_LABEL).fill(joinCode)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Wife' }).click()
    await page.getByLabel('4-digit PIN').fill('2468')
    await expect(page).toHaveURL('/')
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Enable on this device' }).click()
    await page.getByLabel('Your 4-digit PIN').fill('2468')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(
      page.getByRole('button', { name: 'Turn off on this device' }),
    ).toBeVisible()

    // Remove her PIN entirely — biometric must still get her in.
    await serviceClient()
      .from('family_members')
      .update({ pin_hash: null, pin_set_at: null })
      .eq('id', wife.memberId)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/login/family')

    // She auto-lands on her unlock screen: fingerprint shown, no PIN field.
    const unlock = page.getByRole('button', {
      name: 'Unlock with Face ID or Touch ID',
    })
    await expect(unlock).toBeVisible()
    await expect(page.getByLabel('4-digit PIN')).toHaveCount(0)
    await unlock.click()
    await expect(page).toHaveURL('/')
  })
})
