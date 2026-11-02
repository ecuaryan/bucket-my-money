import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  ADMIN_ACCOUNT_RESET_HINT,
  ADMIN_ACCOUNT_RESET_LINK_SENT,
  ADMIN_ACCOUNT_RESET_SENT,
  ADMIN_ACCOUNT_SEND_RESET,
  ADMIN_ACCOUNT_TITLE,
} from '@/lib/brand'
import { isHumanAuthEmail, passwordResetRedirectUrl } from '@/lib/passwordReset'
import { supabase } from '@/lib/supabase'
import MailIcon from '@/components/ui/MailIcon'

/**
 * Email + password reset for whoever signs in with a real email and password
 * (the account owner). PIN-only members have a synthetic auth email, so
 * isHumanAuthEmail is false and this card renders nothing for them — it sits
 * alongside the PIN and biometric cards as the owner's "how I sign in" option.
 */
export default function AccountSettingsCard() {
  const auth = useAuth()
  const sessionEmail =
    auth.status === 'signedIn' ? auth.session.user.email ?? '' : ''
  const humanEmail = isHumanAuthEmail(sessionEmail) ? sessionEmail : null

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onSendResetLink() {
    if (!humanEmail) return
    setError(null)
    setSubmitting(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        humanEmail,
        { redirectTo: passwordResetRedirectUrl() },
      )
      if (resetError) throw resetError
      setSent(true)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not send reset email.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!humanEmail) return null

  return (
    <section
      aria-label="Admin sign-in account"
      className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
        <MailIcon className="h-5 w-5 text-emerald-400" />
        {ADMIN_ACCOUNT_TITLE}
      </h2>

      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Email
      </p>
      <p className="mt-1 text-sm text-zinc-200">{humanEmail}</p>

      {sent ? (
        <div className="mt-4 space-y-2 text-sm text-zinc-300">
          <p>{ADMIN_ACCOUNT_RESET_LINK_SENT}</p>
          <p className="text-xs text-zinc-400">{ADMIN_ACCOUNT_RESET_HINT}</p>
          <p className="text-xs text-zinc-500">{ADMIN_ACCOUNT_RESET_SENT}</p>
        </div>
      ) : (
        <>
          {error ? (
            <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void onSendResetLink()}
            disabled={submitting}
            className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Sending…' : ADMIN_ACCOUNT_SEND_RESET}
          </button>
        </>
      )}
    </section>
  )
}
