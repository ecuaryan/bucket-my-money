import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'
import { isMissingDbFunctionError } from '@/lib/availableBalance'
import { getFreshAccessToken } from '@/lib/sessionToken'
import { resolveSupabasePublishableKey } from '@/lib/supabaseKeys'
import { supabase, supabaseUrl } from '@/lib/supabase'

const publishableKey = resolveSupabasePublishableKey(import.meta.env)

const WEBAUTHN_TIMEOUT_MS = 25_000

async function postFunction<T>(
  name: string,
  body: unknown,
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    apikey: publishableKey,
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(WEBAUTHN_TIMEOUT_MS),
  })

  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string
    noPasskey?: boolean
  }
  if (!res.ok) {
    const err = new Error(data.error ?? `${name} failed: ${res.status}`)
    if (data.noPasskey) (err as PasskeyError).noPasskey = true
    throw err
  }
  return data
}

export type PasskeyError = Error & { noPasskey?: boolean }

/** True when this device exposes a platform authenticator (Face ID / Touch ID / Windows Hello). */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  try {
    if (
      typeof window === 'undefined' ||
      typeof window.PublicKeyCredential === 'undefined'
    ) {
      return false
    }
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/**
 * Enroll a passkey for the currently signed-in member on THIS device.
 * Returns the new credential id so the caller can remember this device's binding.
 */
export async function registerPasskey(
  label?: string,
  pin?: string,
): Promise<string> {
  const token = await getFreshAccessToken()
  if (!token) throw new Error('Not signed in')

  const options = await postFunction<Record<string, unknown>>(
    'webauthn-register-options',
    pin ? { pin } : {},
    token,
  )
  // @ts-expect-error options is a PublicKeyCredentialCreationOptionsJSON
  const attResp = await startRegistration({ optionsJSON: options })
  const verify = await postFunction<{ ok: boolean; credentialId: string }>(
    'webauthn-register-verify',
    { response: attResp, label },
    token,
  )
  return verify.credentialId
}

export type LoginMethods = { hasPasskey: boolean; hasPin: boolean }

/**
 * Which fast sign-in methods exist for this member on the server. Returns the
 * flags, or `null` when the server could not be reached — callers stay
 * optimistic about a passkey on `null` (a transient blip should not hide a
 * working fingerprint; a bad tap self-heals) but hide on a definitive absence.
 */
export async function fetchLoginMethods(input: {
  familyId: string
  memberId: string
}): Promise<LoginMethods | null> {
  try {
    // Reads only — RPC layer instead of the webauthn-has-passkey Edge Function.
    // Same anon existence flags, no session involved.
    const { data, error } = await supabase.rpc('member_login_methods', {
      p_family_id: input.familyId,
      p_member_id: input.memberId,
    })
    if (error) throw new Error(error.message)
    const flags = (data ?? {}) as { exists?: boolean; hasPin?: boolean }
    return { hasPasskey: Boolean(flags.exists), hasPin: Boolean(flags.hasPin) }
  } catch {
    return null
  }
}

export type PasskeySessionTokens = {
  access_token: string
  refresh_token: string
}

/** Authenticate the chosen member with their device passkey; returns session tokens. */
export async function loginWithPasskey(input: {
  familyId: string
  memberId: string
}): Promise<PasskeySessionTokens> {
  // Reads creds + writes the single-use challenge on the RPC layer instead of
  // the webauthn-login-options Edge Function, so the Face ID / Touch ID prompt
  // appears sooner. rpId is derived server-side from the request Origin, matching
  // what webauthn-login-verify (still edge) re-checks. Falls back to the Edge
  // Function if the RPC isn't deployed (deploy window / rollback).
  const { data: optionsData, error: optionsError } = await supabase.rpc(
    'login_webauthn_options',
    { p_family_id: input.familyId, p_member_id: input.memberId },
  )
  let options: Record<string, unknown>
  if (optionsError) {
    if (!isMissingDbFunctionError(optionsError.message)) {
      throw new Error(optionsError.message)
    }
    options = await postFunction<Record<string, unknown>>(
      'webauthn-login-options',
      input,
    )
  } else {
    const opts = optionsData as
      | (Record<string, unknown> & { error?: string; noPasskey?: boolean })
      | null
    if (!opts || opts.error) {
      const err = new Error(
        opts?.error ?? 'Could not start biometric sign-in',
      ) as PasskeyError
      if (opts?.noPasskey) err.noPasskey = true
      throw err
    }
    options = opts
  }
  // @ts-expect-error options is a PublicKeyCredentialRequestOptionsJSON
  const asseResp = await startAuthentication({ optionsJSON: options })
  const data = await postFunction<PasskeySessionTokens>('webauthn-login-verify', {
    ...input,
    response: asseResp,
  })
  return { access_token: data.access_token, refresh_token: data.refresh_token }
}

/**
 * The underlying DOMException name, unwrapping @simplewebauthn/browser's
 * WebAuthnError (which stores the original on `.cause`).
 */
function domExceptionName(err: unknown): string | undefined {
  if (err instanceof DOMException) return err.name
  const cause = (err as { cause?: unknown } | null)?.cause
  if (cause instanceof DOMException) return cause.name
  return undefined
}

/**
 * True when the ceremony was aborted — user cancelled, used an unrecognized
 * finger/face, or it timed out. WebAuthn returns one ambiguous NotAllowedError
 * for all of these (privacy by design), so we cannot tell them apart.
 */
export function isPasskeyCancellation(err: unknown): boolean {
  const name = domExceptionName(err)
  return name === 'NotAllowedError' || name === 'AbortError'
}

/**
 * A short, non-technical message for a passkey UNLOCK failure. Never the raw
 * W3C text. `fallback` names the other way in on the current screen ('pin' on
 * the family roster, 'password' on the email/password page).
 */
export function passkeyErrorMessage(
  err: unknown,
  fallback: 'pin' | 'password' = 'pin',
): string {
  const alt = fallback === 'password' ? 'your email and password' : 'your PIN'
  if ((err as PasskeyError | null)?.noPasskey) {
    return `No passkey on this device yet. Use ${alt}.`
  }
  const name = domExceptionName(err)
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return `That didn't work. Try again, or use ${alt}.`
  }
  if (name === 'SecurityError') {
    return 'Biometric unlock needs a secure (https) connection.'
  }
  return `Could not unlock with biometrics. Use ${alt}.`
}

/** A short, non-technical message for a passkey ENROLLMENT (setup) failure. */
export function passkeySetupErrorMessage(err: unknown): string {
  const name = domExceptionName(err)
  if (name === 'SecurityError') {
    return 'Biometric setup needs a secure (https) connection.'
  }
  return 'Could not set up biometric unlock. Please try again.'
}
