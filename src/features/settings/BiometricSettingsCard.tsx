import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth'
import {
  clearBiometricBinding,
  getBiometricBinding,
  setBiometricBinding,
} from '@/lib/familyDevice'
import {
  isPasskeyCancellation,
  isPlatformAuthenticatorAvailable,
  passkeySetupErrorMessage,
  registerPasskey,
} from '@/lib/passkey'
import { supabase } from '@/lib/supabase'
import FingerprintIcon from '@/components/ui/FingerprintIcon'
import PinInput from '@/components/ui/PinInput'
import { Sheet } from '@/components/ui/Sheet'
import { SheetHeader } from '@/components/ui/SheetHeader'

/**
 * Enroll / remove a biometric passkey for the current member on THIS device.
 * Only rendered when the device exposes a platform authenticator. The binding
 * is per-device: enabling here lets this member open the app with Face ID /
 * Touch ID and skip the PIN. Other members on this device still use their PIN.
 */
export default function BiometricSettingsCard() {
  const auth = useAuth()
  const member = auth.status === 'signedIn' ? auth.member : null

  const [available, setAvailable] = useState<boolean | null>(null)
  const [enrolledCredentialId, setEnrolledCredentialId] = useState<string | null>(
    () => getBiometricBinding()?.credentialId ?? null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void isPlatformAuthenticatorAvailable().then((ok) => {
      if (active) setAvailable(ok)
    })
    return () => {
      active = false
    }
  }, [])

  if (!member || available !== true) return null

  const binding = getBiometricBinding()
  const enrolledHere = binding?.memberId === member.id

  // Members with a PIN confirm it first, so a stolen session alone can't plant
  // a passkey that outlives it. Members without one go straight through.
  const needsPin = Boolean(member.pin_set_at)

  function startEnable() {
    if (!needsPin) {
      void enable()
      return
    }
    setPin('')
    setPinError(null)
    setPinOpen(true)
  }

  function closePinSheet() {
    if (busy) return
    setPinOpen(false)
    setPin('')
    setPinError(null)
  }

  async function enable(confirmedPin?: string) {
    setBusy(true)
    setError(null)
    setPinError(null)
    try {
      const credentialId = await registerPasskey(undefined, confirmedPin)
      setBiometricBinding({
        memberId: member!.id,
        familyId: member!.family_id,
        credentialId,
      })
      setEnrolledCredentialId(credentialId)
      setPinOpen(false)
      setPin('')
    } catch (err) {
      // Silent on cancel; friendly setup message otherwise (not the raw W3C text).
      if (isPasskeyCancellation(err)) {
        setPinOpen(false)
        setPin('')
      } else if (confirmedPin !== undefined && !(err instanceof DOMException)) {
        // Server rejection (wrong PIN, locked): keep the sheet open to retry.
        setPinError(err instanceof Error ? err.message : 'Could not check your PIN.')
        setPin('')
      } else {
        setPinOpen(false)
        setError(passkeySetupErrorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  async function onPinSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || pin.length !== 4) return
    await enable(pin)
  }

  async function disable() {
    setBusy(true)
    setError(null)
    try {
      if (enrolledCredentialId) {
        await supabase
          .from('member_passkeys')
          .delete()
          .eq('credential_id', enrolledCredentialId)
      }
      clearBiometricBinding()
      setEnrolledCredentialId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn off biometric unlock.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
        <FingerprintIcon className="h-5 w-5 text-emerald-400" />
        Biometric unlock
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        {enrolledHere
          ? 'Face ID / Touch ID is on for this device. Open the app and unlock without typing your PIN or password.'
          : 'Use Face ID / Touch ID to open the app on this device without typing your PIN or password. Only turn this on for your own device.'}
      </p>
      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void (enrolledHere ? disable() : startEnable())}
        className={
          enrolledHere
            ? 'mt-3 w-full rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-60'
            : 'mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60'
        }
      >
        {busy
          ? 'Working…'
          : enrolledHere
            ? 'Turn off on this device'
            : 'Enable on this device'}
      </button>
      <Sheet open={pinOpen} onClose={closePinSheet} aria-label="Confirm your PIN">
        <form onSubmit={onPinSubmit} autoComplete="off">
          <SheetHeader onClose={closePinSheet}>
            <h2 className="text-lg font-semibold text-zinc-300">Confirm your PIN</h2>
          </SheetHeader>
          {pinError && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30"
            >
              {pinError}
            </p>
          )}
          <PinInput
            autoFocus
            aria-label="Your 4-digit PIN"
            value={pin}
            onChange={(v) => {
              setPin(v)
              if (pinError) setPinError(null)
            }}
            disabled={busy}
            className="mt-4 block w-full rounded-lg bg-zinc-950 px-3 py-3 text-center text-2xl tracking-[0.5em] text-zinc-300 ring-1 ring-zinc-700"
          />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={closePinSheet}
              disabled={busy}
              className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || pin.length !== 4}
              className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Continue'}
            </button>
          </div>
        </form>
      </Sheet>
    </section>
  )
}
