// Shared session minting for credential-less logins (PIN and WebAuthn).
// Factored out of pin-login so the biometric login path issues sessions the
// exact same way.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { publishableKey, secretKey } from './keys.ts'
import { isPinOnlyAuthEmail } from './pin.ts'

/**
 * A stable, secret password for a PIN-only member's internal auth user, derived
 * (HMAC-SHA256) from the service key + user id. It's never shown to anyone and
 * is only derivable by something that already holds the root secret — so it adds
 * no exposure, but lets us mint a session with ONE GoTrue call (sign-in) instead
 * of two (rotate + sign-in). If the key ever rotates, the next login simply
 * re-sets it via the lazy fallback below.
 */
async function derivePinPassword(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`pin-pw:v1:${userId}`),
  )
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export type MemberSession = {
  access_token: string
  refresh_token: string
  expires_at: number | undefined
}

/**
 * Mint a Supabase session for a member WITHOUT their password.
 *   * PIN-only members (internal email): rotate the internal password, then
 *     sign in with it. (Kept over magic-link OTP on purpose: the password
 *     endpoint isn't subject to email-subsystem rate limits, which matters for
 *     frequent PIN sign-ins at scale.)
 *   * Admin (real email): never rotate the email password -- issue a session
 *     via a magic-link OTP instead.
 * The caller passes the member's auth email (read alongside the member row via
 * member_session_lookup), so this no longer makes a separate getUserById hop.
 * Throws on any failure; callers map to a generic "Login failed".
 */
export async function issueSessionForMember(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<MemberSession> {
  if (!email) {
    throw new Error('user lookup failed')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = createClient(supabaseUrl, publishableKey())

  let sessionData: Awaited<ReturnType<typeof anon.auth.signInWithPassword>>

  if (isPinOnlyAuthEmail(email)) {
    // Common case: one GoTrue call. The internal password is the stable derived
    // value, so we can sign in directly. Lazy heal on failure (first login since
    // this shipped, or a rotated key): set it once, then retry.
    const password = await derivePinPassword(userId)
    sessionData = await anon.auth.signInWithPassword({ email, password })
    if (sessionData.error) {
      // PIN-only passwords can only change with a one-time server ticket
      // (migration 113) — a session holder can't set one with updateUser.
      const { error: ticketError } = await admin.rpc('allow_pin_password_set', {
        p_user_id: userId,
      })
      if (ticketError) {
        throw new Error('password ticket failed')
      }
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        password,
      })
      if (updateError) {
        throw new Error('password set failed')
      }
      sessionData = await anon.auth.signInWithPassword({ email, password })
    }
  } else {
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = linkData?.properties?.hashed_token
    if (linkError || !tokenHash) {
      throw new Error('generateLink failed')
    }
    sessionData = await anon.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    })
  }

  if (sessionData.error || !sessionData.data.session) {
    throw new Error('session issue failed')
  }

  const session = sessionData.data.session
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  }
}
