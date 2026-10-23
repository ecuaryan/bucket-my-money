import { setLastPinMemberId } from '@/lib/lastPinMember'
import { setSignInPreference } from '@/lib/signInPreference'
import { normalizeJoinCode } from '@/lib/joinCode'

const FAMILY_ID_KEY = 'bucketmymoney_family_id'
const JOIN_CODE_KEY = 'bucketmymoney_join_code'
const BIOMETRIC_KEY = 'bucketmymoney_biometric'

/** Which member enrolled a passkey on THIS device, their family, and that credential id. */
export type BiometricBinding = {
  memberId: string
  familyId: string
  credentialId: string
}

export function getBiometricBinding(): BiometricBinding | null {
  try {
    const raw = localStorage.getItem(BIOMETRIC_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BiometricBinding>
    if (!parsed.memberId || !parsed.familyId || !parsed.credentialId) return null
    return {
      memberId: parsed.memberId,
      familyId: parsed.familyId,
      credentialId: parsed.credentialId,
    }
  } catch {
    return null
  }
}

export function setBiometricBinding(binding: BiometricBinding): void {
  try {
    localStorage.setItem(BIOMETRIC_KEY, JSON.stringify(binding))
  } catch {
    // private mode / restricted storage
  }
}

export function clearBiometricBinding(): void {
  try {
    localStorage.removeItem(BIOMETRIC_KEY)
  } catch {
    // private mode / restricted storage
  }
}

const DEVICE_MEMBER_KEY = 'bucketmymoney_device_member'

/**
 * The member who last signed in on THIS device (set on any sign-in method).
 * Lets the email/password page offer that member's fast options (e.g. PIN)
 * even when they never enrolled biometric. Non-secret pointer; the PIN itself
 * stays the secret and pin-login enforces lockout.
 */
export type DeviceMember = { memberId: string; familyId: string }

export function getDeviceMember(): DeviceMember | null {
  try {
    const raw = localStorage.getItem(DEVICE_MEMBER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DeviceMember>
    if (!parsed.memberId || !parsed.familyId) return null
    return { memberId: parsed.memberId, familyId: parsed.familyId }
  } catch {
    return null
  }
}

export function setDeviceMember(member: DeviceMember): void {
  try {
    localStorage.setItem(DEVICE_MEMBER_KEY, JSON.stringify(member))
  } catch {
    // private mode / restricted storage
  }
}

export function getBoundFamilyId(): string | null {
  try {
    return localStorage.getItem(FAMILY_ID_KEY)
  } catch {
    return null
  }
}

export function getBoundJoinCode(): string | null {
  try {
    return localStorage.getItem(JOIN_CODE_KEY)
  } catch {
    return null
  }
}

/** True after this device completed join / family PIN setup (not email-only admin). */
export function isPinBoundDevice(): boolean {
  return Boolean(getBoundJoinCode()?.trim())
}

export function bindFamily(familyId: string, joinCode: string): void {
  localStorage.setItem(FAMILY_ID_KEY, familyId)
  localStorage.setItem(JOIN_CODE_KEY, normalizeJoinCode(joinCode))
}

/** Persist household link + PIN sign-in prefs for this device (admin self-PIN, code rotation). */
export function bindDeviceForPinSignIn(
  familyId: string,
  joinCode: string,
  memberId: string,
): void {
  bindFamily(familyId, joinCode)
  setSignInPreference('pin')
  setLastPinMemberId(memberId)
}

export function clearBoundFamily(): void {
  localStorage.removeItem(FAMILY_ID_KEY)
  localStorage.removeItem(JOIN_CODE_KEY)
  // Biometric binding is intentionally independent of the join-code link: an
  // admin who signs in by email + passkey may never have a join code, and
  // unlinking the household device should not silently remove their passkey.
  // Biometric is removed only via Settings → Turn off, or when the credential
  // is found revoked at login.
}
