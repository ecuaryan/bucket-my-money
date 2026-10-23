import { resolveSupabasePublishableKey } from '@/lib/supabaseKeys'
import { notifyHouseholdRosterChanged } from '@/lib/householdRosterRefresh'
import { getFreshAccessToken, refreshAccessToken } from '@/lib/sessionToken'
import { supabase, supabaseUrl } from '@/lib/supabase'
import { withTimeout } from '@/lib/timeout'
import { normalizeJoinCode } from '@/lib/joinCode'

const publishableKey = resolveSupabasePublishableKey(import.meta.env)

const PIN_LOGIN_TIMEOUT_MS = 25_000

export type JoinMember = {
  id: string
  name: string
  role: string
  avatarUrl: string | null
  hasPin: boolean
  pinLocked: boolean
  isAccountOwner: boolean
}

export type ValidateJoinResult = {
  familyId: string
  familyName: string
  members: JoinMember[]
}

/**
 * A dropped/blocked request surfaces as the browser's raw "TypeError: Failed to
 * fetch" (or a "network" error). Detect it from a message string so both the
 * Edge Function path (Error instances) and the supabase-js RPC path (a
 * PostgrestError whose message is the stringified fetch failure) can share the
 * same friendly copy instead of leaking the raw browser text to users.
 */
function isNetworkFailureMessage(message: string): boolean {
  const msg = message.toLowerCase()
  return msg.includes('failed to fetch') || msg.includes('network')
}

function networkFailureMessage(authenticated: boolean): string {
  const hint = authenticated
    ? ' If you were idle a long time, sign out and sign in again, then retry.'
    : ''
  return `Could not reach the server. Check your connection.${hint}`
}

function mapPostFunctionNetworkError(
  err: unknown,
  name: string,
  authenticated: boolean,
): Error {
  if (err instanceof Error) {
    if (err.message.includes('timed out')) return err
    if (isNetworkFailureMessage(err.message)) {
      return new Error(networkFailureMessage(authenticated))
    }
  }
  return err instanceof Error ? err : new Error(`${name} failed`)
}

async function requireAdminAccessToken(): Promise<string> {
  const token = await getFreshAccessToken()
  if (!token) throw new Error('Not signed in')
  return token
}

async function postFunction<T>(
  name: string,
  body: unknown,
  accessToken?: string,
  timeoutMs = PIN_LOGIN_TIMEOUT_MS,
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    apikey: publishableKey,
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const send = (token?: string) => {
    const h = { ...headers }
    if (token) h.Authorization = `Bearer ${token}`
    return withTimeout(
      fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      }),
      timeoutMs,
      'Request timed out. Check your connection and try again.',
    )
  }

  let res: Response
  try {
    res = await send(accessToken)
  } catch (err) {
    throw mapPostFunctionNetworkError(err, name, Boolean(accessToken))
  }

  if (res.status === 401 && accessToken) {
    const retryToken = await refreshAccessToken()
    if (retryToken) {
      try {
        res = await send(retryToken)
      } catch (err) {
        throw mapPostFunctionNetworkError(err, name, true)
      }
    }
  }

  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    // A 401 on an authenticated call means the admin's session is no longer
    // valid. Unauthenticated calls (e.g. pin-login) use 401 for domain errors
    // like "Wrong PIN", so keep the server's message there.
    if (res.status === 401 && accessToken) {
      throw new Error('Session expired. Sign out and sign in again, then retry.')
    }
    const detail = data.error ?? `${name} failed: ${res.status}`
    if (res.status === 503) {
      throw new Error(
        `${detail}. For local dev, run \`npm run functions:serve\` in a second terminal (needs \`supabase/functions/.env\`).`,
      )
    }
    throw new Error(detail)
  }
  return data
}

/**
 * The roster read is a safe, idempotent lookup, and a dropped request on mobile
 * is usually a momentary blip (backgrounded tab, spotty signal). Retry a few
 * times with short backoff so a transient failure self-heals before the user
 * ever sees an error. Only network failures retry — an invalid/stale code or any
 * other domain error fails fast so feedback stays immediate.
 */
const JOIN_ROSTER_MAX_ATTEMPTS = 3
const JOIN_ROSTER_RETRY_BASE_MS = 400

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function validateJoinCode(code: string): Promise<ValidateJoinResult> {
  const p_code = normalizeJoinCode(code)
  for (let attempt = 1; ; attempt++) {
    // Reads only — runs on the always-on RPC layer instead of the
    // validate-join-code Edge Function. Same data, same anon exposure.
    const { data, error } = await supabase.rpc('login_roster', { p_code })
    if (!error) {
      // NULL means no family matched — keep the exact message
      // isStaleJoinCodeError looks for so a rotated/removed code still clears
      // the device link.
      if (!data) throw new Error('Invalid join code')
      return data as unknown as ValidateJoinResult
    }
    // supabase-js reports a dropped request as a PostgrestError whose message is
    // the stringified fetch failure ("TypeError: Failed to fetch").
    if (isNetworkFailureMessage(error.message)) {
      if (attempt < JOIN_ROSTER_MAX_ATTEMPTS) {
        await delay(JOIN_ROSTER_RETRY_BASE_MS * attempt)
        continue
      }
      // Out of retries — show the friendly copy the Edge Function path uses
      // instead of leaking raw browser text.
      throw new Error(networkFailureMessage(false))
    }
    throw new Error(error.message)
  }
}

export type PinSessionTokens = {
  access_token: string
  refresh_token: string
}

/** Validates PIN via Edge Function; caller applies tokens with `signInWithSession`. */
export async function exchangePinForSession(input: {
  familyId: string
  memberId: string
  pin: string
}): Promise<PinSessionTokens> {
  return postFunction<PinSessionTokens>('pin-login', input)
}

export async function removeMember(memberId: string): Promise<void> {
  const token = await requireAdminAccessToken()
  await postFunction<{ ok: boolean }>('remove-member', { memberId }, token)
  notifyHouseholdRosterChanged()
}

export async function createMember(input: {
  name: string
  role: 'admin' | 'member' | 'child'
}): Promise<{ id: string; name: string; role: string }> {
  const token = await requireAdminAccessToken()
  const data = await postFunction<{ member: { id: string; name: string; role: string } }>(
    'create-member',
    input,
    token,
  )
  notifyHouseholdRosterChanged()
  return data.member
}

/**
 * Revoke refresh tokens for every session except this device.
 * Must run in the browser that just saved the admin's own PIN — GoTrue needs
 * the local refresh token to identify the current session (`scope: 'others'`).
 */
export async function signOutOtherAuthSessions(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'others' })
  if (error) {
    throw new Error(`Could not sign out other devices: ${error.message}`)
  }
  // GoTrue may rotate tokens after revoking other sessions; refresh so the next
  // admin Edge call (e.g. updating a child's PIN right after) does not fail.
  const token = await refreshAccessToken()
  if (!token) {
    throw new Error(
      'Other devices were signed out, but this device lost its session. Sign in again with your new PIN.',
    )
  }
}

export async function setMemberPin(
  memberId: string,
  pin: string,
  options?: { signOutOtherDevices?: boolean },
): Promise<void> {
  const token = await requireAdminAccessToken()
  await postFunction('set-pin', { memberId, pin }, token)

  if (options?.signOutOtherDevices) {
    await signOutOtherAuthSessions()
  }

  notifyHouseholdRosterChanged()
}

export async function clearPinLockout(memberId: string): Promise<void> {
  const token = await requireAdminAccessToken()
  await postFunction('clear-pin-lockout', { memberId }, token)
}

/**
 * Set or update the signed-in member's OWN PIN (any role). Then sign out their
 * other devices, matching the admin self-reset — the device that saved stays in.
 */
export async function setOwnPin(pin: string): Promise<void> {
  const token = await getFreshAccessToken()
  if (!token) throw new Error('Not signed in')
  await postFunction('set-own-pin', { pin }, token)
  await signOutOtherAuthSessions()
  notifyHouseholdRosterChanged()
}

/** Remove the signed-in member's own PIN. Server allows this for the owner only. */
export async function clearOwnPin(): Promise<void> {
  const token = await getFreshAccessToken()
  if (!token) throw new Error('Not signed in')
  await postFunction('clear-own-pin', {}, token)
  notifyHouseholdRosterChanged()
}
