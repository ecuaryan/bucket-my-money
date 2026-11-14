import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { useAuth } from '@/lib/auth'
import { bindDeviceForPinSignIn } from '@/lib/familyDevice'
import {
  ADMIN_JOIN_CODE_COPY_CODE_ARIA,
  ADMIN_JOIN_CODE_QR_ALT,
  ADMIN_JOIN_CODE_ROTATE_CONFIRM,
  ADMIN_JOIN_CODE_ROTATE_SHEET_BODY,
  ADMIN_JOIN_CODE_ROTATE_SHEET_TITLE,
  ADMIN_JOIN_CODE_ROTATE_SUCCESS,
  ADMIN_JOIN_CODE_TITLE,
} from '@/lib/brand'
import { formatLoadErrorMessage, withAuthLockRetry } from '@/lib/authLockError'
import { formatJoinCode } from '@/lib/joinCode'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'

export default function FamilyJoinSection() {
  const auth = useAuth()
  const member = auth.status === 'signedIn' ? auth.member : null
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rotateError, setRotateError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  const loadCode = useCallback(async () => {
    try {
      await withAuthLockRetry(async () => {
        const { data, error } = await supabase
          .from('families')
          .select('join_code')
          .maybeSingle()
        if (error) throw new Error(error.message)
        setJoinCode(data?.join_code ?? null)
      })
      setLoadError(null)
    } catch (e) {
      setLoadError(formatLoadErrorMessage(e, 'Could not load join code.'))
    }
  }, [])

  useEffect(() => {
    void loadCode()
  }, [loadCode])

  async function retryLoad() {
    setRetrying(true)
    try {
      await loadCode()
    } finally {
      setRetrying(false)
    }
  }

  const joinUrl = useMemo(() => {
    if (!joinCode || typeof window === 'undefined') return ''
    return `${window.location.origin}/join?code=${encodeURIComponent(joinCode)}`
  }, [joinCode])

  // Drawn here, never by a third party: the link contains the join code.
  // Loaded lazily so the QR encoder stays out of the main bundle.
  const [qrSrc, setQrSrc] = useState('')
  useEffect(() => {
    if (!joinUrl) {
      setQrSrc('')
      return
    }
    let cancelled = false
    void import('@/lib/qrCode')
      .then((m) => {
        if (!cancelled) setQrSrc(m.qrSvgDataUrl(joinUrl))
      })
      .catch(() => {
        if (!cancelled) setQrSrc('')
      })
    return () => {
      cancelled = true
    }
  }, [joinUrl])

  function openRotateConfirm() {
    setRotateError(null)
    setConfirmOpen(true)
  }

  function closeRotateConfirm() {
    if (rotating) return
    setConfirmOpen(false)
    setRotateError(null)
  }

  async function confirmRotate() {
    setRotating(true)
    setRotateError(null)
    setLoadError(null)
    try {
      const { data, error } = await supabase.rpc('rotate_family_join_code')
      if (error) throw error
      const newCode = data as string
      setJoinCode(newCode)
      if (
        member?.role === 'admin' &&
        member.pin_set_at &&
        member.family_id
      ) {
        bindDeviceForPinSignIn(member.family_id, newCode, member.id)
      }
      toast.success(ADMIN_JOIN_CODE_ROTATE_SUCCESS)
      setConfirmOpen(false)
    } catch (e) {
      setRotateError(e instanceof Error ? e.message : String(e))
    } finally {
      setRotating(false)
    }
  }

  async function copyText(text: string, target: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(target)
      setTimeout(() => {
        setCopied((current) => (current === target ? null : current))
      }, 2000)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  return (
    <section aria-label={ADMIN_JOIN_CODE_TITLE}>
      <h2 className="text-base font-semibold">{ADMIN_JOIN_CODE_TITLE}</h2>

      {loadError && (
        <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void retryLoad()}
            disabled={retrying}
            className="mt-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100 ring-1 ring-red-500/40 hover:bg-red-500/30"
          >
            {retrying ? 'Trying…' : 'Try again'}
          </button>
        </div>
      )}
      <div className="mt-4 flex flex-col items-center gap-4 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800 sm:flex-row sm:items-start">
        {joinCode && (
          // Reserve the space so the card doesn't jump when the QR appears.
          <div className="h-[180px] w-[180px] shrink-0 rounded-lg bg-white/5">
            {qrSrc && (
              <img
                src={qrSrc}
                alt={ADMIN_JOIN_CODE_QR_ALT}
                width={180}
                height={180}
                className="rounded-lg"
              />
            )}
          </div>
        )}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <p className="font-mono text-2xl font-semibold tracking-widest text-zinc-300">
              {joinCode ? formatJoinCode(joinCode) : '…'}
            </p>
            <button
              type="button"
              onClick={() => joinCode && void copyText(joinCode, 'code')}
              disabled={!joinCode}
              aria-label={
                copied === 'code' ? 'Copied' : ADMIN_JOIN_CODE_COPY_CODE_ARIA
              }
              className={
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50 ' +
                (copied === 'code' ? 'border-emerald-500/40 text-emerald-400' : '')
              }
            >
              {copied === 'code' ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="h-4 w-4"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-2 break-all text-xs text-zinc-500">{joinUrl}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <button
              type="button"
              onClick={() => joinUrl && void copyText(joinUrl, 'link')}
              disabled={!joinUrl}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              {copied === 'link' ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={openRotateConfirm}
              disabled={rotating}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
            >
              New code
            </button>
          </div>
        </div>
      </div>

      <ConfirmSheet
        open={confirmOpen}
        title={ADMIN_JOIN_CODE_ROTATE_SHEET_TITLE}
        body={ADMIN_JOIN_CODE_ROTATE_SHEET_BODY}
        confirmLabel={ADMIN_JOIN_CODE_ROTATE_CONFIRM}
        busyLabel="Generating…"
        busy={rotating}
        error={rotateError}
        tone="caution"
        onConfirm={() => void confirmRotate()}
        onClose={closeRotateConfirm}
      />
    </section>
  )
}
