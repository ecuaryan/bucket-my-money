import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import {
  enabledOAuthProviders,
  hasOAuthIdentity,
  hasPasswordIdentity,
  oauthProviderLabel,
  oauthReturnError,
} from '@/lib/oauth'

describe('enabledOAuthProviders', () => {
  it('defaults to Google only (Apple is a paid add-on)', () => {
    expect(enabledOAuthProviders(undefined)).toEqual(['google'])
    expect(enabledOAuthProviders('')).toEqual([])
  })

  it('parses the env list, ignoring unknown and mis-cased entries', () => {
    expect(enabledOAuthProviders('google, Apple')).toEqual(['google', 'apple'])
    expect(enabledOAuthProviders('apple,github')).toEqual(['apple'])
  })
})

describe('provider identity helpers', () => {
  it('detects OAuth vs password accounts from app_metadata.providers', () => {
    const google = { app_metadata: { provider: 'google', providers: ['google'] } }
    const both = { app_metadata: { provider: 'email', providers: ['email', 'apple'] } }
    const email = { app_metadata: { provider: 'email', providers: ['email'] } }

    expect(hasOAuthIdentity(google)).toBe(true)
    expect(hasPasswordIdentity(google)).toBe(false)
    expect(hasOAuthIdentity(both)).toBe(true)
    expect(hasPasswordIdentity(both)).toBe(true)
    expect(hasOAuthIdentity(email)).toBe(false)
  })

  it('falls back to the single provider field', () => {
    expect(hasOAuthIdentity({ app_metadata: { provider: 'apple' } })).toBe(true)
    expect(hasOAuthIdentity({ app_metadata: {} })).toBe(false)
  })

  it('labels providers', () => {
    expect(oauthProviderLabel('google')).toBe('Google')
    expect(oauthProviderLabel('apple')).toBe('Apple')
  })
})

describe('oauthReturnError', () => {
  it('is silent when nothing went wrong or the user cancelled', () => {
    expect(oauthReturnError('', '')).toBeNull()
    expect(oauthReturnError('?error=access_denied', '')).toBeNull()
  })

  it('reads query and hash errors without echoing provider text', () => {
    const q = oauthReturnError('?error=server_error&error_description=boom', '')
    const h = oauthReturnError('', '#error=server_error&error_description=boom')
    expect(q).toMatch(/didn’t finish/)
    expect(h).toBe(q)
    expect(q).not.toContain('boom')
  })
})
