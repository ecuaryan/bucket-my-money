import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { AuthBrandHeader } from '@/components/AuthBrandHeader'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { useAuth } from '@/lib/auth'
import {
  LOGIN_ALREADY_HAVE_ACCOUNT,
  LOGIN_GET_STARTED,
  LOGIN_SHARED_CTA,
  LOGIN_SHARED_SUB,
  LOGIN_SHARED_TITLE,
  LOGIN_SIGNUP_SUBTITLE,
  LOGIN_SIGNUP_SUCCESS,
  LOGIN_SIGNUP_TITLE,
} from '@/lib/brand'
import {
  clearRequireFreshSignIn,
  isRequireFreshSignIn,
} from '@/lib/freshSignIn'
import {
  type AuthLocationState,
  loginEmailFromQuery,
  postSignInPath,
  shouldRedirectLoginToPin,
} from '@/lib/authNavigation'
import { clearPasswordRecoveryFlow } from '@/lib/passwordRecoveryFlow'
import { setSignInPreference } from '@/lib/signInPreference'
import {
  clearBiometricBinding,
  getBiometricBinding,
  getDeviceMember,
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
import { exchangePinForSession } from '@/lib/memberAuth'

type Mode = 'signIn' | 'signUp'

function clearPasswordInput(elementId: string) {
  const el = document.getElementById(elementId) as HTMLInputElement | null
  if (!el) return
  el.value = ''
  el.defaultValue = ''
  el.blur()
}

export default function LoginPage() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const loginState = location.state as AuthLocationState | null
  const from = loginState?.from ?? '/'
  const loginInfo = loginState?.info ?? searchParams.get('info')
  const loginEmail = loginEmailFromQuery(
    loginState?.email,
    searchParams.get('email'),
  )
  const pendingFreshSignIn = isRequireFreshSignIn()
  const preferEmailSignIn = loginState?.preferEmailSignIn === true
  const isSignUpMode = searchParams.get('signup') === '1'

  useEffect(() => {
    if (pendingFreshSignIn && auth.status === 'signedIn') {
      void auth.signOut()
    }
  }, [pendingFreshSignIn, auth])

  useEffect(() => {
    if (preferEmailSignIn) {
      setSignInPreference('email')
    }
  }, [preferEmailSignIn])

  const [mode, setMode] = useState<Mode>(() =>
    searchParams.get('signup') === '1' ? 'signUp' : 'signIn',
  )
  const [email, setEmail] = useState(loginEmail)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(loginInfo)

  // Who this device knows (biometric binding, else last signed-in member). The
  // fingerprint needs the binding (this device enrolled); the PIN only needs to
  // know the member, so it works even if they never enrolled biometric.
  const [fastMember] = useState(
    () => getBiometricBinding() ?? getDeviceMember(),
  )
  const [hasBinding, setHasBinding] = useState(() =>
    Boolean(getBiometricBinding()),
  )
  // Spinner while we resolve which fast options exist for this device's member.
  const [checking, setChecking] = useState(() => Boolean(fastMember))
  const [fingerprintReady, setFingerprintReady] = useState(false)
  const [pinReady, setPinReady] = useState(false)
  const [biometricBusy, setBiometricBusy] = useState(false)
  const [biometricError, setBiometricError] = useState<string | null>(null)
  // Inline 4-digit PIN entry for this device's member (routes through pin-login).
  const [pinMode, setPinMode] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)

  useEffect(() => {
    if (!fastMember || pendingFreshSignIn) {
      setChecking(false)
      return
    }
    let active = true
    setChecking(true)
    void (async () => {
      // Run the local platform-authenticator check and the server check
      // concurrently so they don't stack (the platform check can be ~1s on
      // mobile). Still reveal only after both resolve — no flicker.
      const [available, methods] = await Promise.all([
        hasBinding
          ? isPlatformAuthenticatorAvailable()
          : Promise.resolve(false),
        fetchLoginMethods({
          familyId: fastMember.familyId,
          memberId: fastMember.memberId,
        }),
      ])
      if (!active) return
      if (hasBinding && methods && !methods.hasPasskey) {
        // Passkey was revoked — drop the stale binding (a PIN may still remain).
        clearBiometricBinding()
        setHasBinding(false)
        setFingerprintReady(false)
      } else {
        // hasPasskey true, or null (server unreachable) → optimistic; tap self-heals.
        setFingerprintReady(
          hasBinding && available && methods?.hasPasskey !== false,
        )
      }
      setPinReady(methods?.hasPin === true)
      setChecking(false)
    })()
    return () => {
      active = false
    }
  }, [fastMember, hasBinding, pendingFreshSignIn])

  async function unlockWithBiometric() {
    if (!fastMember) return
    setBiometricBusy(true)
    setBiometricError(null)
    try {
      const tokens = await loginWithPasskey({
        familyId: fastMember.familyId,
        memberId: fastMember.memberId,
      })
      clearPasswordRecoveryFlow()
      await auth.signInWithSession(tokens)
    } catch (err) {
      setBiometricBusy(false)
      if ((err as { noPasskey?: boolean }).noPasskey) {
        clearBiometricBinding()
        setHasBinding(false)
        setFingerprintReady(false)
        setBiometricError(
          'Biometric unlock is no longer set up on this device. Use your PIN or password.',
        )
        return
      }
      setBiometricError(passkeyErrorMessage(err, 'password'))
    }
  }

  function enterPinMode() {
    setPinMode(true)
    setPinValue('')
    setPinError(null)
    setBiometricError(null)
  }

  async function submitPin(value: string) {
    if (!fastMember || pinBusy) return
    if (!/^\d{4}$/.test(value)) {
      setPinError('Enter your 4-digit PIN.')
      return
    }
    setPinBusy(true)
    setPinError(null)
    try {
      // Routes through pin-login → same server-side 6-attempt lockout (no new
      // brute-force surface).
      const tokens = await exchangePinForSession({
        familyId: fastMember.familyId,
        memberId: fastMember.memberId,
        pin: value,
      })
      clearPasswordRecoveryFlow()
      await auth.signInWithSession(tokens)
      setSignInPreference('pin')
    } catch (err) {
      setPinBusy(false)
      setPinError(err instanceof Error ? err.message : 'Sign-in failed')
      setPinValue('')
    }
  }

  function onPinChange(next: string) {
    setPinValue(next)
    if (pinError) setPinError(null)
    if (next.length === 4) void submitPin(next)
  }

  // Spinner while checking; then offer exactly the methods that exist —
  // PIN only, fingerprint only, or both (or nothing).
  const biometricTrailing: ReactNode =
    checking || biometricBusy ? (
      <span className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center">
        <LoadingSpinner className="h-5 w-5" />
      </span>
    ) : pinReady || fingerprintReady ? (
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {pinReady && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={enterPinMode}
            className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/10"
          >
            PIN
          </button>
        )}
        {fingerprintReady && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void unlockWithBiometric()}
            // Tap target that launches the OS Face ID / Touch ID prompt — not an
            // in-app sensor. Suppress the mobile long-press callout so it reads
            // as "tap me", with a press animation for tap feedback.
            onContextMenu={(e) => e.preventDefault()}
            disabled={biometricBusy}
            aria-label="Unlock with Face ID or Touch ID"
            className="flex h-8 w-8 cursor-pointer touch-manipulation select-none items-center justify-center rounded-full text-emerald-400 transition [-webkit-touch-callout:none] hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-50"
          >
            <FingerprintIcon className="pointer-events-none h-6 w-6" />
          </button>
        )}
      </div>
    ) : undefined

  // "PIN" text needs extra room in the field.
  const biometricTrailingWide = pinReady

  if (auth.status === 'signedIn' && !pendingFreshSignIn) {
    if (auth.memberLoading) {
      return (
        <div className="flex min-h-svh items-center justify-center bg-black px-4 pb-[calc(10rem+max(0.5rem,env(safe-area-inset-bottom,0px))+var(--keyboard-inset,0px))]">
          <p className="text-sm text-zinc-500">Signing you in…</p>
        </div>
      )
    }
    return (
      <Navigate to={postSignInPath()} replace />
    )
  }

  if (
    shouldRedirectLoginToPin({
      preferEmailSignIn,
      isSignUpMode,
      pendingFreshSignIn,
      signedOut: auth.status === 'signedOut',
    })
  ) {
    return <Navigate to="/login/family" replace state={{ from }} />
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBiometricError(null)

    if (!email || !password) {
      setError('Email and password are required.')
      return
    }
    if (mode === 'signUp' && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'signIn') {
        clearPasswordRecoveryFlow()
        await auth.signIn(email, password)
        setSignInPreference('email')
        clearRequireFreshSignIn()
      } else {
        await auth.signUp({ email, password })
        setSignInPreference('email')
        setInfo(LOGIN_SIGNUP_SUCCESS)
        switchMode('signIn')
        setPassword('')
      }
    } catch (err) {
      const status = (err as { status?: number } | null)?.status
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      const lower = msg.toLowerCase()
      if (lower.includes('invalid login')) {
        setPassword('')
        clearPasswordInput('login-password')
        setError(
          'Invalid email or password. Try again or use Forgot password below.',
        )
      } else if (lower.includes('failed to fetch') || lower.includes('network')) {
        setError('Could not reach the server. Check your connection and try again.')
      } else if (
        (typeof status === 'number' && status >= 500) ||
        lower.includes('database error') ||
        lower.includes('querying schema') ||
        lower.includes('unexpected')
      ) {
        // Never surface raw server/database internals to the user.
        setError('Something went wrong on our end. Please try again in a moment.')
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const isSignUp = mode === 'signUp'

  return (
    <div className="flex min-h-svh flex-col items-center justify-center overflow-y-auto bg-black px-4 pt-[max(2rem,env(safe-area-inset-top,0px))] pb-[calc(10rem+max(0.5rem,env(safe-area-inset-bottom,0px))+var(--keyboard-inset,0px))] sm:py-12">
      <div className="w-full max-w-sm">
        <AuthBrandHeader />

        <form
          onSubmit={onSubmit}
          autoComplete="on"
          className="space-y-4 rounded-2xl bg-zinc-900 p-6 shadow-lg ring-1 ring-zinc-800"
        >
          {isSignUp ? (
            <>
              <div>
                <h2 className="text-lg font-semibold text-zinc-300">
                  {LOGIN_SIGNUP_TITLE}
                </h2>
                <p className="mt-1.5 text-sm text-zinc-400">
                  {LOGIN_SIGNUP_SUBTITLE}
                </p>
              </div>

              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
                name="email"
                id="login-email"
                required
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                name="password"
                id="login-password"
                required
              />

              {error && <AuthMessage tone="error">{error}</AuthMessage>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Working…' : 'Create account'}
              </button>

              <button
                type="button"
                onClick={() => switchMode('signIn')}
                className="block w-full text-center text-sm text-zinc-400 hover:text-zinc-300"
              >
                Already have an account? Sign in
              </button>
            </>
          ) : (
            <>
              {!pinMode && (
                <>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => switchMode('signUp')}
                    className="w-full rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-500/40 transition hover:bg-zinc-900 hover:ring-emerald-500/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {LOGIN_GET_STARTED}
                  </button>

                  <div className="relative py-1" role="separator">
                    <div
                      className="absolute inset-0 flex items-center"
                      aria-hidden
                    >
                      <div className="w-full border-t border-zinc-700/80" />
                    </div>
                    <p className="relative flex justify-center">
                      <span className="bg-zinc-900 px-2 text-xs text-zinc-500">
                        {LOGIN_ALREADY_HAVE_ACCOUNT}
                      </span>
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-4">
                {pinMode ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-center text-sm text-zinc-400">
                      Enter your 4-digit PIN
                    </p>
                    <PinInput
                      autoFocus
                      aria-label="4-digit PIN"
                      value={pinValue}
                      error={Boolean(pinError)}
                      onChange={onPinChange}
                      disabled={pinBusy}
                      placeholder="····"
                      className="block w-full rounded-xl border-0 bg-zinc-950 px-4 py-4 text-center text-2xl tracking-[0.5em] text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-600 focus:outline focus:outline-2 focus:outline-emerald-400"
                    />
                    {pinError && <AuthMessage tone="error">{pinError}</AuthMessage>}
                    <button
                      type="button"
                      onClick={() => {
                        setPinMode(false)
                        setPinError(null)
                        setPinValue('')
                      }}
                      className="w-full text-sm text-zinc-400 hover:text-zinc-300"
                    >
                      Use email &amp; password instead
                    </button>
                  </div>
                ) : (
                  <>
                    {info && <AuthMessage tone="info">{info}</AuthMessage>}

                    <Field
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(v) => {
                        setEmail(v)
                        if (biometricError) setBiometricError(null)
                      }}
                      placeholder="you@example.com"
                      autoComplete="username"
                      name="email"
                      id="login-email"
                      required
                      trailing={biometricTrailing}
                      trailingWide={biometricTrailingWide}
                    />
                    {biometricError && (
                      <AuthMessage tone="error">{biometricError}</AuthMessage>
                    )}
                    <Field
                      label="Password"
                      type="password"
                      value={password}
                      onChange={setPassword}
                      autoComplete={error ? 'off' : 'current-password'}
                      name="password"
                      id="login-password"
                      required
                    />

                    {error && <AuthMessage tone="error">{error}</AuthMessage>}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? 'Working…' : 'Sign in'}
                    </button>

                    <p className="text-right">
                      <button
                        type="button"
                        className="text-sm text-zinc-400 hover:text-zinc-300 hover:underline"
                        onClick={() => {
                          setPassword('')
                          clearPasswordInput('login-password')
                          ;(
                            document.getElementById(
                              'login-email',
                            ) as HTMLInputElement | null
                          )?.blur()
                          requestAnimationFrame(() => {
                            navigate('/login/forgot', { state: { email } })
                          })
                        }}
                      >
                        Forgot password?
                      </button>
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </form>

        <div className="mt-6 rounded-2xl bg-zinc-900/80 p-4 text-center ring-1 ring-zinc-800">
          <p className="text-sm font-medium text-zinc-300">{LOGIN_SHARED_TITLE}</p>
          <p className="mt-1 text-xs text-zinc-500">{LOGIN_SHARED_SUB}</p>
          <Link
            to="/login/family"
            state={{ from }}
            className="mt-3 inline-block text-sm font-semibold text-emerald-400 hover:underline"
          >
            {LOGIN_SHARED_CTA}
          </Link>
        </div>
      </div>
    </div>
  )
}

function AuthMessage({
  tone,
  children,
}: {
  tone: 'error' | 'info'
  children: string
}) {
  const styles =
    tone === 'error'
      ? 'bg-red-500/10 text-red-300 ring-red-500/30'
      : 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
  return (
    <p className={`rounded-lg px-3 py-2 text-sm ring-1 ${styles}`}>{children}</p>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  name,
  id,
  required,
  trailing,
  trailingWide,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  autoComplete?: string
  name?: string
  id?: string
  required?: boolean
  trailing?: ReactNode
  trailingWide?: boolean
}) {
  return (
    <label className="block">
      <FieldLabel spacing="tight">{label}</FieldLabel>
      <div className="relative mt-1">
        <input
          type={type}
          name={name}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`block w-full rounded-lg border-0 bg-zinc-950 py-2 pl-3 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-emerald-400 ${
            trailing ? (trailingWide ? 'pr-20' : 'pr-11') : 'pr-3'
          }`}
        />
        {trailing}
      </div>
    </label>
  )
}

