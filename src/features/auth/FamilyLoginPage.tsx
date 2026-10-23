import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthShell } from '@/components/AuthShell'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { LoadErrorPanel } from '@/components/ui/LoadErrorPanel'
import { LoadingStatus } from '@/components/ui/LoadingStatus'
import { Sheet } from '@/components/ui/Sheet'
import {
  APP_FORM_DATA_ATTR,
  APP_NAME,
  JOIN_CODE_ENTER_PROMPT,
  JOIN_CODE_LABEL,
  PIN_HOUSEHOLD_LOAD_ERROR_TITLE,
  PIN_JOIN_PAGE_SUBTITLE,
  PIN_JOIN_PAGE_TITLE,
  PIN_UNBIND_JOIN_CODE_CONFIRM,
  PIN_UNBIND_JOIN_CODE_EFFECT_FORGET,
  PIN_UNBIND_JOIN_CODE_EFFECT_REENTER,
  PIN_UNBIND_JOIN_CODE_LINK,
  PIN_UNBIND_JOIN_CODE_SHEET_INTRO,
  PIN_UNBIND_JOIN_CODE_SHEET_TITLE,
  PIN_UNBIND_JOIN_CODE_WHAT_HAPPENS,
  PIN_MEMBER_NOT_SET_LABEL,
  PIN_PICKER_AUTO_UPDATE_NOTE,
  pinNoMembersYet,
  pinPickerPendingLead,
} from '@/lib/brand'
import { formatLoadErrorMessage } from '@/lib/authLockError'
import { pickHouseholdAdminName } from '@/lib/householdAdmin'
import { useAuth } from '@/lib/auth'
import {
  bindFamily,
  clearBiometricBinding,
  clearBoundFamily,
  getBiometricBinding,
  getBoundFamilyId,
  getBoundJoinCode,
} from '@/lib/familyDevice'
import {
  fetchLoginMethods,
  isPlatformAuthenticatorAvailable,
  loginWithPasskey,
  passkeyErrorMessage,
} from '@/lib/passkey'
import FingerprintIcon from '@/components/ui/FingerprintIcon'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import PinInput from '@/components/ui/PinInput'
import {
  exchangePinForSession,
  validateJoinCode,
  type JoinMember,
  type ValidateJoinResult,
} from '@/lib/memberAuth'
import {
  pinPickerItemClass,
  pinPickerListClass,
  pinPickerStatusLine,
  pinPickerTileClass,
  rosterHasPendingPin,
  sortJoinMembers,
} from '@/features/auth/familyLoginMembers'
import { PinPickerPollIndicator } from '@/features/auth/PinPickerPollIndicator'
import { usePinRosterPoll } from '@/hooks/usePinRosterPoll'
import { clearPasswordRecoveryFlow } from '@/lib/passwordRecoveryFlow'
import { takeOrphanMemberNotice } from '@/lib/pinAuth'
import type { AuthLocationState } from '@/lib/authNavigation'
import { postSignInPath } from '@/lib/authNavigation'
import { isStaleJoinCodeError } from '@/lib/joinCodeError'
import { normalizeJoinCode } from '@/lib/joinCode'
import { setSignInPreference } from '@/lib/signInPreference'

type LocationState = AuthLocationState

/** How often the PIN picker re-fetches the household roster while waiting. */
const PIN_ROSTER_POLL_MS = 8_000

export default function FamilyLoginPage() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const loginState = location.state as LocationState
  const from = loginState?.from ?? '/'

  const [roster, setRoster] = useState<ValidateJoinResult | null>(null)
  /** Shown only after the user submits a code (not on silent stale-device cleanup). */
  const [bindError, setBindError] = useState<string | null>(null)
  const [rosterLoadError, setRosterLoadError] = useState<string | null>(null)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [unbindConfirmOpen, setUnbindConfirmOpen] = useState(false)

  const [codeInput, setCodeInput] = useState('')
  const [binding, setBinding] = useState(false)

  const [selected, setSelected] = useState<JoinMember | null>(null)
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const pinInputRef = useRef<HTMLInputElement>(null)
  const pinSubmitInFlight = useRef(false)
  /** Auto-resume after policy sign-out runs once; dismissing must not re-open PIN entry. */
  const skipAutoResume = useRef(false)

  /** Biometric "fast path": this device's enrolled member, if any. */
  const [biometricBinding, setBiometricBinding] = useState(() => getBiometricBinding())
  const [platformAuthAvailable, setPlatformAuthAvailable] = useState(false)
  // 'checking' while we confirm the server still has the passkey; 'ready' shows
  // the fingerprint; 'none' means no biometric here (unavailable or revoked).
  const [biometricStatus, setBiometricStatus] = useState<
    'checking' | 'ready' | 'none'
  >(() => (getBiometricBinding() ? 'checking' : 'none'))
  const [biometricBusy, setBiometricBusy] = useState(false)
  const [biometricError, setBiometricError] = useState<string | null>(null)
  /** Auto-land the enrolled member on their PIN screen once (it has the print). */
  const biometricAutoSelected = useRef(false)

  useEffect(() => {
    if (!biometricBinding) {
      setPlatformAuthAvailable(false)
      setBiometricStatus('none')
      return
    }
    let active = true
    setBiometricStatus('checking')
    void (async () => {
      const available = await isPlatformAuthenticatorAvailable()
      if (!active) return
      setPlatformAuthAvailable(available)
      if (!available) {
        setBiometricStatus('none')
        return
      }
      const methods = await fetchLoginMethods({
        familyId: biometricBinding.familyId,
        memberId: biometricBinding.memberId,
      })
      if (!active) return
      if (methods && !methods.hasPasskey) {
        clearBiometricBinding()
        setBiometricBinding(null)
        setBiometricStatus('none')
        return
      }
      setBiometricStatus('ready')
    })()
    return () => {
      active = false
    }
  }, [biometricBinding])

  const runBiometric = useCallback(
    async (memberId: string) => {
      const familyId = getBoundFamilyId()
      if (!familyId) return
      setBiometricBusy(true)
      setBiometricError(null)
      try {
        const tokens = await loginWithPasskey({ familyId, memberId })
        clearPasswordRecoveryFlow()
        await auth.signInWithSession(tokens)
        setSignInPreference('pin')
      } catch (err) {
        setBiometricBusy(false)
        if ((err as { noPasskey?: boolean }).noPasskey) {
          // The stored credential is gone (admin reset / removed). Forget it so
          // the fingerprint disappears and only PIN entry remains.
          clearBiometricBinding()
          setBiometricBinding(null)
          return
        }
        // Cancel, wrong finger, and timeout all surface as one ambiguous
        // WebAuthn error — show a friendly retry hint, never the raw W3C text.
        setBiometricError(passkeyErrorMessage(err))
      }
    },
    [auth],
  )

  function selectMember(member: JoinMember) {
    setPin('')
    setPinError(null)
    pinSubmitInFlight.current = false
    flushSync(() => setSelected(member))
    // iOS only opens the keyboard when focus runs in the same user-gesture
    // turn as the tap that revealed the field (autoFocus alone is unreliable).
    pinInputRef.current?.focus()
  }

  const refreshRoster = useCallback(async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) throw new Error(JOIN_CODE_ENTER_PROMPT)
    const result = await validateJoinCode(trimmed)
    bindFamily(result.familyId, trimmed)
    setRoster(result)
    setRestoreNotice(null)
    return result
  }, [])

  useEffect(() => {
    const notice = loginState?.info ?? takeOrphanMemberNotice()
    if (notice) setRestoreNotice(notice)
  }, [loginState?.info])

  useEffect(() => {
    if (!roster || selected || loginState?.info || skipAutoResume.current) return
    const resumeId = loginState?.resumeMemberId
    if (!resumeId) return
    skipAutoResume.current = true
    const member = roster.members.find((m) => m.id === resumeId)
    if (!member?.hasPin || member.pinLocked) return
    setPin('')
    setPinError(null)
    pinSubmitInFlight.current = false
    flushSync(() => setSelected(member))
    pinInputRef.current?.focus()
  }, [roster, selected, loginState?.info, loginState?.resumeMemberId])

  // Enrolled member opens the app → land straight on their PIN screen (which
  // shows the fingerprint), skipping a separate "tap to unlock" gate. We do not
  // focus the PIN field, so the keyboard stays down and biometric reads first.
  useEffect(() => {
    if (!roster || selected || biometricAutoSelected.current) return
    if (loginState?.info || skipAutoResume.current) return
    if (!platformAuthAvailable || !biometricBinding) return
    // Biometric is a sign-in method on its own — land the enrolled member here
    // even if they have no PIN (e.g. an owner who removed theirs).
    const member = roster.members.find((m) => m.id === biometricBinding.memberId)
    if (!member) return
    biometricAutoSelected.current = true
    setPin('')
    setPinError(null)
    pinSubmitInFlight.current = false
    setSelected(member)
  }, [roster, selected, platformAuthAvailable, biometricBinding, loginState?.info])

  const loadBoundRoster = useCallback(async () => {
    const storedCode = getBoundJoinCode()?.trim()
    if (!storedCode) return

    setRosterLoadError(null)
    try {
      await refreshRoster(storedCode)
    } catch (err) {
      if (isStaleJoinCodeError(err)) {
        // Rotated or revoked code — clear so the user can enter a new one.
        clearBoundFamily()
        setRoster(null)
        setRestoreNotice(
          'This device needs to be linked again. Enter your household join code from Admin.',
        )
        return
      }
      setRosterLoadError(
        formatLoadErrorMessage(err, 'Could not load household. Try again.'),
      )
    }
  }, [refreshRoster])

  useEffect(() => {
    let cancelled = false
    const storedCode = getBoundJoinCode()?.trim()
    if (!storedCode) {
      setLoading(false)
      return
    }

    void loadBoundRoster().finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [loadBoundRoster])

  const silentRefreshRoster = useCallback(async () => {
    const storedCode = getBoundJoinCode()?.trim()
    if (!storedCode) return
    try {
      await refreshRoster(storedCode)
    } catch {
      // Background refresh — keep the last good roster on transient errors.
    }
  }, [refreshRoster])

  const rosterPollActive = Boolean(
    roster && !selected && rosterHasPendingPin(roster.members),
  )
  const { isRefreshing: rosterPollRefreshing, cycleKey: rosterPollCycleKey } =
    usePinRosterPoll(rosterPollActive, silentRefreshRoster, PIN_ROSTER_POLL_MS)

  const submitPin = useCallback(
    async (pinValue: string) => {
      if (!selected || !roster || pinSubmitInFlight.current) return
      const familyId = getBoundFamilyId()
      if (!familyId) return

      if (!/^\d{4}$/.test(pinValue)) {
        setPinError('Enter your 4-digit PIN.')
        return
      }

      pinSubmitInFlight.current = true
      setSubmitting(true)
      setPinError(null)
      try {
        const tokens = await exchangePinForSession({
          familyId,
          memberId: selected.id,
          pin: pinValue,
        })
        clearPasswordRecoveryFlow()
        await auth.signInWithSession(tokens)
        setSignInPreference('pin')
      } catch (err) {
        pinSubmitInFlight.current = false
        setPinError(err instanceof Error ? err.message : 'Sign-in failed')
        setPin('')
        setSubmitting(false)
      }
    },
    [auth, roster, selected],
  )

  if (auth.status === 'signedIn') {
    if (auth.memberLoading) {
      return (
        <AuthShell title={APP_NAME} subtitle="Signing you in…">
          <LoadingStatus className="py-4" />
        </AuthShell>
      )
    }
    return (
      <Navigate to={postSignInPath()} replace />
    )
  }

  async function onBindCode(e: FormEvent) {
    e.preventDefault()
    setBindError(null)
    setRestoreNotice(null)
    setBinding(true)
    try {
      await refreshRoster(codeInput)
      setCodeInput('')
    } catch (err) {
      setBindError(
        err instanceof Error ? err.message : 'That code did not work.',
      )
    } finally {
      setBinding(false)
    }
  }

  async function onPinSubmit(e: FormEvent) {
    e.preventDefault()
    await submitPin(pin)
  }

  function onPinChange(next: string) {
    setPin(next)
    if (biometricError) setBiometricError(null)
    if (next.length === 4) {
      void submitPin(next)
    }
  }

  function openUnbindConfirm() {
    setUnbindConfirmOpen(true)
  }

  function closeUnbindConfirm() {
    setUnbindConfirmOpen(false)
  }

  function confirmUnbind() {
    clearBoundFamily()
    setRoster(null)
    setSelected(null)
    setPin('')
    pinSubmitInFlight.current = false
    setBindError(null)
    setRosterLoadError(null)
    setRestoreNotice(null)
    setUnbindConfirmOpen(false)
  }

  async function retryLoadBoundRoster() {
    setLoading(true)
    try {
      await loadBoundRoster()
    } finally {
      setLoading(false)
    }
  }

  if (selected && (submitting || biometricBusy)) {
    return (
      <AuthShell title={selected.name} subtitle="Signing you in…">
        <LoadingStatus className="py-4" />
      </AuthShell>
    )
  }

  if (selected) {
    const matchesBinding = biometricBinding?.memberId === selected.id
    // While 'checking' a spinner holds the print's spot (Ally-style); 'ready'
    // shows the fingerprint; 'none' hides it and lets the PIN field autofocus.
    const biometricSlot = Boolean(matchesBinding) && biometricStatus !== 'none'
    const printReady = Boolean(matchesBinding) && biometricStatus === 'ready'
    // A member can sign in by PIN and/or biometric. Only show the PIN field if
    // they have a PIN — an enrolled member who removed theirs uses biometric.
    const hasPinForSelected = selected.hasPin
    const subtitle = hasPinForSelected
      ? printReady
        ? 'Use Face ID / Touch ID, or enter your PIN'
        : 'Enter your 4-digit PIN'
      : biometricSlot
        ? 'Unlock with Face ID / Touch ID'
        : 'Ask your admin to set your PIN'
    return (
      <AuthShell title={selected.name} subtitle={subtitle}>
        <form
          onSubmit={onPinSubmit}
          className="fade-in-enter space-y-4"
          autoComplete="off"
          {...{ [APP_FORM_DATA_ATTR]: 'family-pin' }}
        >
          {biometricSlot && (
            <div className="flex flex-col items-center pb-1">
              {printReady ? (
                // A labeled button, not a bare fingerprint in a circle: the round
                // "sensor" look invited a press-and-hold (as if it scanned in
                // app), when a single tap is what launches the OS Face ID /
                // Touch ID prompt. The pill shape + label reads unmistakably as a
                // tap target; the fingerprint stays as the recognizable cue.
                <button
                  type="button"
                  onClick={() => void runBiometric(selected.id)}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label="Unlock with Face ID or Touch ID"
                  className="flex w-full cursor-pointer touch-manipulation select-none items-center justify-center gap-2.5 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-500/40 transition [-webkit-touch-callout:none] hover:bg-emerald-500/20 hover:text-emerald-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                >
                  <FingerprintIcon className="pointer-events-none h-5 w-5" />
                  Unlock with Face ID / Touch ID
                </button>
              ) : (
                <span className="flex h-12 items-center justify-center">
                  <LoadingSpinner className="h-6 w-6" />
                </span>
              )}
            </div>
          )}
          {hasPinForSelected && (
            <PinInput
              ref={pinInputRef}
              // Don't steal focus when biometric is offered — keep the keyboard
              // down so the print reads first. (Auto-focusing here wouldn't help:
              // mobile browsers, Android and iOS alike, won't raise the on-screen
              // keyboard from a programmatic focus without a user gesture, so it'd
              // just place a cursor with no keyboard. A PIN-only member taps their
              // avatar, which focuses in that gesture and opens the keyboard.)
              autoFocus={!biometricSlot}
              aria-label="4-digit PIN"
              value={pin}
              onChange={onPinChange}
              placeholder="····"
              className="block w-full rounded-xl border-0 bg-zinc-950 px-4 py-4 text-center text-2xl tracking-[0.5em] text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-600 focus:outline focus:outline-2 focus:outline-emerald-400"
            />
          )}
          {(pinError || biometricError) && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
              {pinError ?? biometricError}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              skipAutoResume.current = true
              setSelected(null)
              setPin('')
              setPinError(null)
              setBiometricError(null)
              pinSubmitInFlight.current = false
            }}
            className="w-full text-sm text-zinc-400 hover:text-zinc-300"
          >
            Choose someone else
          </button>
        </form>
      </AuthShell>
    )
  }

  if (loading) {
    return (
      <AuthShell title={APP_NAME} subtitle="Loading household…">
        <LoadingStatus label="Loading household…" className="py-4" />
      </AuthShell>
    )
  }

  if (rosterLoadError && getBoundJoinCode()?.trim()) {
    return (
      <AuthShell title={APP_NAME} subtitle="PIN sign-in">
        <LoadErrorPanel
          title={PIN_HOUSEHOLD_LOAD_ERROR_TITLE}
          message={rosterLoadError}
          onRetry={() => void retryLoadBoundRoster()}
        />
        <FooterLinks from={from} />
      </AuthShell>
    )
  }

  if (!roster) {
    return (
      <AuthShell title={PIN_JOIN_PAGE_TITLE} subtitle={PIN_JOIN_PAGE_SUBTITLE}>
        <form onSubmit={onBindCode} className="space-y-4">
          <label htmlFor="join-code" className="block text-left">
            <FieldLabel spacing="tight">{JOIN_CODE_LABEL}</FieldLabel>
            <input
              id="join-code"
              value={codeInput}
              onChange={(e) => setCodeInput(normalizeJoinCode(e.target.value))}
              placeholder="XXXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label={JOIN_CODE_LABEL}
              className="mt-1 block w-full rounded-lg border-0 bg-zinc-950 px-3 py-3 text-center text-lg font-mono tracking-widest text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-600 focus:outline focus:outline-2 focus:outline-emerald-400"
            />
          </label>
          {restoreNotice && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200 ring-1 ring-amber-500/30">
              {restoreNotice}
            </p>
          )}
          {bindError && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
              {bindError}
            </p>
          )}
          <button
            type="submit"
            disabled={binding || codeInput.length < 6}
            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {binding ? 'Checking…' : 'Continue'}
          </button>
        </form>
        <FooterLinks from={from} />
      </AuthShell>
    )
  }

  const rosterMembers = sortJoinMembers(roster.members)
  // Biometric is per-device: on THIS device the enrolled member can sign in even
  // without a PIN. (On another device they'd have no binding → PIN still needed,
  // so the "PIN not set yet" copy is correct there.)
  const canBiometric = (m: JoinMember) =>
    biometricBinding?.memberId === m.id && biometricStatus === 'ready'
  const pinReadyMembers = rosterMembers.filter(
    (m) => m.hasPin || canBiometric(m),
  )
  // The account owner always has email sign-in, so they're never "waiting" for
  // a PIN even with none set.
  const pinPendingMembers = rosterMembers.filter(
    (m) => !m.hasPin && !canBiometric(m) && !m.isAccountOwner,
  )
  const householdAdminName = pickHouseholdAdminName(roster.members)

  function goToEmailSignIn() {
    setSignInPreference('email')
    navigate('/login', { state: { preferEmailSignIn: true, from } })
  }

  return (
    <AuthShell title={APP_NAME} subtitle="Who's signing in?">
      {rosterMembers.length === 0 ? (
        <p className="text-sm text-zinc-400">
          {pinNoMembersYet(householdAdminName)}
        </p>
      ) : (
        <div className="space-y-4">
          {pinPendingMembers.length > 0 ? (
            <div className="flex flex-col items-center gap-2.5 text-center text-sm leading-snug text-zinc-400">
              <p>
                {pinPickerPendingLead(
                  householdAdminName,
                  pinReadyMembers.length === 0,
                )}
                <br />
                {PIN_PICKER_AUTO_UPDATE_NOTE}
              </p>
              <PinPickerPollIndicator
                intervalMs={PIN_ROSTER_POLL_MS}
                refreshing={rosterPollRefreshing}
                cycleKey={rosterPollCycleKey}
              />
            </div>
          ) : null}
          <ul className={pinPickerListClass()}>
            {rosterMembers.map((m, index) => {
              const biometricReady = canBiometric(m)
              const pinUnavailable = !m.hasPin || m.pinLocked
              // The owner can always fall back to email sign-in when this device
              // has no PIN/biometric for them.
              const ownerEmailFallback =
                m.isAccountOwner && pinUnavailable && !biometricReady
              // Show the method that actually works instead of "PIN not set yet".
              const statusLine =
                biometricReady && pinUnavailable
                  ? ({
                      text: 'Face ID / Touch ID',
                      visible: true,
                      tone: 'ready',
                    } as const)
                  : ownerEmailFallback
                    ? ({
                        text: 'Sign in with email',
                        visible: true,
                        tone: 'ready',
                      } as const)
                    : pinPickerStatusLine(
                        m,
                        rosterMembers,
                        index,
                        PIN_MEMBER_NOT_SET_LABEL,
                      )
              return (
              <li
                key={m.id}
                className={pinPickerItemClass(rosterMembers.length, index)}
              >
                <button
                  type="button"
                  disabled={pinUnavailable && !biometricReady && !ownerEmailFallback}
                  onClick={() =>
                    ownerEmailFallback ? goToEmailSignIn() : selectMember(m)
                  }
                  className={pinPickerTileClass(rosterMembers.length, index)}
                >
                  <Avatar name={m.name} url={m.avatarUrl} />
                  <span className="text-sm font-medium text-zinc-300">{m.name}</span>
                  {statusLine ? (
                    <span
                      className={`text-center text-xs leading-snug ${
                        statusLine.tone === 'pending'
                          ? 'text-zinc-500'
                          : statusLine.tone === 'locked'
                            ? 'text-amber-300'
                            : statusLine.tone === 'ready'
                              ? 'text-emerald-400'
                              : 'invisible'
                      }`}
                    >
                      {statusLine.text}
                    </span>
                  ) : null}
                </button>
              </li>
              )
            })}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={openUnbindConfirm}
        className="mt-4 w-full text-sm text-zinc-500 hover:text-zinc-400"
      >
        {PIN_UNBIND_JOIN_CODE_LINK}
      </button>
      <FooterLinks from={from} />
      <Sheet
        open={unbindConfirmOpen}
        onClose={closeUnbindConfirm}
        aria-label={PIN_UNBIND_JOIN_CODE_SHEET_TITLE}
      >
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-zinc-300">
            {PIN_UNBIND_JOIN_CODE_SHEET_TITLE}
          </h2>
          <button
            type="button"
            onClick={closeUnbindConfirm}
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">{PIN_UNBIND_JOIN_CODE_SHEET_INTRO}</p>
          <div>
            <h3 className="text-sm font-medium text-zinc-300">
              {PIN_UNBIND_JOIN_CODE_WHAT_HAPPENS}
            </h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-400">
              <li>{PIN_UNBIND_JOIN_CODE_EFFECT_FORGET}</li>
              <li>{PIN_UNBIND_JOIN_CODE_EFFECT_REENTER}</li>
            </ul>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={closeUnbindConfirm}
              className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmUnbind}
              className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
            >
              {PIN_UNBIND_JOIN_CODE_CONFIRM}
            </button>
          </div>
        </div>
      </Sheet>
    </AuthShell>
  )
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-14 w-14 rounded-full object-cover ring-2 ring-zinc-700"
      />
    )
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-semibold text-zinc-300 ring-2 ring-zinc-700">
      {initial}
    </div>
  )
}

function FooterLinks({ from }: { from: string }) {
  return (
    <p className="mt-6 text-center text-sm text-zinc-500">
      <Link
        to="/login"
        state={{ preferEmailSignIn: true, from }}
        onClick={() => setSignInPreference('email')}
        className="text-emerald-400 hover:underline"
      >
        Admin email sign-in
      </Link>
    </p>
  )
}
