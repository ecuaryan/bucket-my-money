import { beforeEach, describe, expect, it } from 'vitest'
import {
  getLastSignIn,
  markOAuthPending,
  promotePendingOAuth,
  recordLastSignIn,
} from '@/lib/lastSignIn'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('lastSignIn', () => {
  it('is empty until a sign-in succeeds', () => {
    expect(getLastSignIn()).toBeNull()
  })

  it('remembers PIN as the last method so no stale pill shows', () => {
    recordLastSignIn('google')
    recordLastSignIn('pin')
    expect(getLastSignIn()).toBe('pin')
  })

  it('records the method and ignores junk values', () => {
    recordLastSignIn('email')
    expect(getLastSignIn()).toBe('email')
    localStorage.setItem('bucketmymoney_last_sign_in', 'github')
    expect(getLastSignIn()).toBeNull()
  })

  it('promotes a provider only once a session returns', () => {
    markOAuthPending('google', 1_000)
    expect(getLastSignIn()).toBeNull()
    promotePendingOAuth(2_000)
    expect(getLastSignIn()).toBe('google')
  })

  it('drops an abandoned provider attempt', () => {
    recordLastSignIn('email')
    markOAuthPending('google', 0)
    promotePendingOAuth(11 * 60 * 1000)
    expect(getLastSignIn()).toBe('email')
  })

  it('a later email sign-in clears a stale pending attempt', () => {
    markOAuthPending('google', 1_000)
    recordLastSignIn('email')
    promotePendingOAuth(2_000)
    expect(getLastSignIn()).toBe('email')
  })
})
