import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type OAuthProvider = 'google' | 'apple'

const ALL_PROVIDERS: readonly OAuthProvider[] = ['google', 'apple']

/**
 * Providers to offer on the login screen. Defaults to Google only — Apple needs
 * a paid Developer Program membership, so its button stays hidden until
 * `VITE_OAUTH_PROVIDERS=google,apple` is set (after enabling it in Supabase).
 */
export function enabledOAuthProviders(
  raw: string | undefined = import.meta.env.VITE_OAUTH_PROVIDERS,
): OAuthProvider[] {
  const wanted = (raw ?? 'google')
    .split(',')
    .map((s) => s.trim().toLowerCase())
  return ALL_PROVIDERS.filter((p) => wanted.includes(p))
}

/** Where the provider sends the browser back to; Supabase finishes the session there. */
export function oauthRedirectUrl(): string {
  return `${window.location.origin}/login`
}

export async function startOAuthSignIn(provider: OAuthProvider): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: oauthRedirectUrl() },
  })
  if (error) throw error
}

/**
 * True when Google/Apple is linked to this user. `app_metadata.providers` is
 * written by Supabase Auth only (clients cannot change it).
 */
export function hasOAuthIdentity(user: Pick<User, 'app_metadata'>): boolean {
  return linkedProviders(user).some((p) =>
    (ALL_PROVIDERS as readonly string[]).includes(p),
  )
}

/** True when the user can also sign in with an email + password. */
export function hasPasswordIdentity(user: Pick<User, 'app_metadata'>): boolean {
  return linkedProviders(user).includes('email')
}

export function linkedProviders(user: Pick<User, 'app_metadata'>): string[] {
  const providers = user.app_metadata?.providers
  if (Array.isArray(providers)) return providers.filter((p) => typeof p === 'string')
  const single = user.app_metadata?.provider
  return typeof single === 'string' ? [single] : []
}

export function oauthProviderLabel(provider: string): string {
  return provider === 'apple' ? 'Apple' : provider === 'google' ? 'Google' : provider
}

/**
 * First-time Google/Apple sign-in has no household yet (OAuth can't carry the
 * `bootstrap_family` metadata email sign-up uses). Creates one server-side and
 * returns true when a membership now exists.
 */
export async function bootstrapOAuthHousehold(session: Session): Promise<boolean> {
  if (!hasOAuthIdentity(session.user)) return false
  const { error } = await supabase.rpc('bootstrap_oauth_household')
  if (error) {
    console.error('bootstrap_oauth_household failed', error)
    return false
  }
  return true
}

/** Message from a failed/cancelled provider round trip (`?error_description=` or hash). */
export function oauthReturnError(search: string, hash: string): string | null {
  const read = (s: string) => {
    const params = new URLSearchParams(s.replace(/^[?#]/, ''))
    return params.get('error_description') ?? params.get('error')
  }
  const raw = read(search) ?? read(hash)
  if (!raw) return null
  if (/access_denied|cancel/i.test(raw)) return null
  return 'Sign-in with that provider didn’t finish. Try again or use email.'
}
