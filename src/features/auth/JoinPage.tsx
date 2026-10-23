import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AuthShell } from '@/components/AuthShell'
import { bindFamily } from '@/lib/familyDevice'
import { formatJoinCode } from '@/lib/joinCode'
import { validateJoinCode } from '@/lib/memberAuth'
import { isStandaloneDisplay } from '@/lib/pwa'

export default function JoinPage() {
  const [params] = useSearchParams()
  const codeFromUrl = params.get('code')?.trim() ?? ''
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // Valid family id, held while we wait for the user to continue in a browser tab.
  const [pendingFamilyId, setPendingFamilyId] = useState<string | null>(null)

  // Only the *current* context is knowable — see isStandaloneDisplay(). A false
  // result means "browser tab" (on iOS, opened in Safari from a scanned QR),
  // where an installed PWA can't be reached and its storage isn't shared.
  const inBrowserTab = useMemo(() => !isStandaloneDisplay(), [])

  useEffect(() => {
    if (!codeFromUrl) return
    let cancelled = false

    void (async () => {
      try {
        const result = await validateJoinCode(codeFromUrl)
        if (cancelled) return
        if (inBrowserTab) {
          // Don't silently bind here: on iOS this is Safari, a separate storage
          // sandbox from the installed app. Surface the code + guidance instead.
          setPendingFamilyId(result.familyId)
        } else {
          bindFamily(result.familyId, codeFromUrl)
          setDone(true)
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Invalid join code')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [codeFromUrl, inBrowserTab])

  function continueInBrowser() {
    if (!pendingFamilyId) return
    bindFamily(pendingFamilyId, codeFromUrl)
    setDone(true)
  }

  if (done) {
    return <Navigate to="/login/family" replace />
  }

  if (!codeFromUrl) {
    return (
      <AuthShell>
        <p className="text-sm text-zinc-400">
          Missing join code. Scan your household QR or enter the code on the{' '}
          <Link to="/login/family" className="text-emerald-400 hover:underline">
            PIN sign-in
          </Link>{' '}
          page.
        </p>
      </AuthShell>
    )
  }

  if (error) {
    return (
      <AuthShell>
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {error}
        </p>
        <Link
          to="/login/family"
          className="mt-4 block text-center text-sm text-emerald-400 hover:underline"
        >
          Enter code manually
        </Link>
      </AuthShell>
    )
  }

  // Browser tab with a valid code: the link can't open an already-installed app
  // on iPhone, so point the user at the reliable path (open the app, type the
  // code) while still letting browser-only users continue here.
  if (inBrowserTab && pendingFamilyId) {
    return (
      <AuthShell title="You're almost in">
        <p className="text-sm text-zinc-400">
          Already added Bucket My Money to your home screen? Open it from there
          and enter this code — on iPhone a link can't open an installed app.
        </p>
        <p className="mt-4 text-center font-mono text-3xl font-semibold tracking-widest text-zinc-200">
          {formatJoinCode(codeFromUrl)}
        </p>
        <button
          type="button"
          onClick={continueInBrowser}
          className="mt-6 w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400"
        >
          Continue in this browser
        </button>
        <Link
          to="/login/family"
          className="mt-4 block text-center text-sm text-emerald-400 hover:underline"
        >
          Enter code manually
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <p className="text-sm text-zinc-400">
        Linking this device to your household…
      </p>
    </AuthShell>
  )
}
