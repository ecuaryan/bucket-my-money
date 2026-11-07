// Shared WebAuthn config + challenge storage for the biometric login path.
// Verification logic lives in the @simplewebauthn/server library (industry
// standard); this module owns the relying-party config and the single-use
// challenge store.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@13'
export { isoBase64URL, isoUint8Array } from 'npm:@simplewebauthn/server@13/helpers'

export const RP_NAME = 'Bucket My Money'

// Hosts we trust as relying parties. Production origins are listed exactly
// (never "any *.bucketmymoney.com": an unrelated or taken-over subdomain must
// not be able to ask for passkey assertions scoped to the apex RP ID). Local dev
// is localhost / 127.0.0.1. Extra comma-separated hosts may be added via env for
// preview/staging without a code change.
const RP_ID = 'bucketmymoney.com'
const PROD_ORIGIN_HOSTS = [RP_ID, `www.${RP_ID}`, `app.${RP_ID}`]
const DEFAULT_RP_HOSTS = ['localhost', '127.0.0.1']

function allowedHosts(): string[] {
  const extra = (Deno.env.get('WEBAUTHN_RP_HOSTS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...DEFAULT_RP_HOSTS, ...extra]
}

export type RelyingParty = { rpID: string; origin: string }

/**
 * Derive the relying party from the request's Origin header instead of static
 * env, so the same code works on localhost and prod with no per-environment
 * config. The Origin is browser-controlled (not page-forgeable) and validated
 * against an allowlist; the assertion's own origin/rpID are re-checked by
 * @simplewebauthn against what we return here.
 */
export function relyingParty(req: Request): RelyingParty | null {
  const origin = req.headers.get('origin')
  if (!origin) return null
  let host: string
  let protocol: string
  try {
    const u = new URL(origin)
    host = u.hostname
    protocol = u.protocol
  } catch {
    return null
  }
  if (PROD_ORIGIN_HOSTS.includes(host)) {
    // Registered passkeys are scoped to the apex so they work on apex + www + app.
    return protocol === 'https:' ? { rpID: RP_ID, origin } : null
  }
  const hosts = allowedHosts()
  const apex = hosts.find((h) => host === h || host.endsWith(`.${h}`))
  if (!apex) return null
  return { rpID: apex, origin }
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000

type ChallengeKind = 'register' | 'login'

/** Persist a single-use challenge, replacing any prior one of the same kind. */
export async function storeChallenge(
  admin: SupabaseClient,
  input: {
    memberId: string
    familyId: string | null
    challenge: string
    kind: ChallengeKind
  },
): Promise<void> {
  await admin
    .from('webauthn_challenges')
    .delete()
    .eq('member_id', input.memberId)
    .eq('kind', input.kind)

  const { error } = await admin.from('webauthn_challenges').insert({
    member_id: input.memberId,
    family_id: input.familyId,
    challenge: input.challenge,
    kind: input.kind,
    expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  })
  if (error) {
    throw new Error('challenge store failed')
  }
}

/**
 * Fetch + consume (delete) the latest challenge for a member. Returns null if
 * none exists or it has expired -- single-use, so it is always deleted.
 */
export async function takeChallenge(
  admin: SupabaseClient,
  input: { memberId: string; kind: ChallengeKind },
): Promise<string | null> {
  const { data } = await admin
    .from('webauthn_challenges')
    .select('id, challenge, expires_at')
    .eq('member_id', input.memberId)
    .eq('kind', input.kind)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  await admin.from('webauthn_challenges').delete().eq('id', data.id)

  if (new Date(data.expires_at).getTime() < Date.now()) return null
  return data.challenge
}
