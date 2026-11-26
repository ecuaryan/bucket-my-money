import { APP_VERSION } from '@/lib/appVersion'
import { isNetworkError } from '@/lib/errorMessage'
import { resolveSupabasePublishableKey } from '@/lib/supabaseKeys'

/**
 * Anonymous crash reports (docs/MAINTENANCE.md § Error reports).
 *
 * Uncaught errors, unhandled promise rejections and render errors go to the
 * `report_client_error` RPC, which scrubs numbers, emails, ids, tokens and
 * quoted text before storing them. Sent as anon with no session, so no person
 * or household is attached. Never include user-entered text or ids here.
 * Production builds only, a few per session, off the main path: a report never
 * slows or breaks the app.
 */

export type ErrorReportKind = 'error' | 'rejection' | 'render'

const MAX_REPORTS_PER_SESSION = 10
const sent = new Set<string>()

/** A lazy `import()` failed to fetch its chunk (usually a stale tab post-deploy). */
export function isChunkLoadError(error: unknown): boolean {
  const err = error as { name?: string; message?: string } | null
  const message = err?.message ?? ''
  return (
    err?.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
      message,
    )
  )
}

/**
 * Noise that says nothing about the app: dropped connections, aborts, stale
 * chunks (handled by a reload), cross-origin "Script error.", the benign
 * ResizeObserver warning, and errors thrown by browser extensions.
 */
export function isReportable(error: unknown, message: string, stack: string): boolean {
  if (!message.trim()) return false
  if (message === 'Script error.' || /^ResizeObserver loop/.test(message)) return false
  if (isNetworkError(error) || isChunkLoadError(error)) return false
  const name = (error as { name?: string } | null)?.name
  if (name === 'AbortError' || /aborted/i.test(message)) return false
  if (/(chrome|moz|safari(-web)?)-extension:\/\//.test(stack)) return false
  return true
}

/** "Safari 18 · iOS"-style: enough to reproduce, nothing that identifies. */
export function coarseBrowser(userAgent: string): string {
  const os = /iPhone|iPad|iPod/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Other'
  const match =
    /(Edg|EdgiOS|EdgA)\/(\d+)/.exec(userAgent) ??
    /(Firefox|FxiOS)\/(\d+)/.exec(userAgent) ??
    /(CriOS|Chrome)\/(\d+)/.exec(userAgent) ??
    /Version\/(\d+).*(Safari)/.exec(userAgent)
  if (!match) return os
  const [, a, b] = match
  const label = (raw: string) =>
    raw.startsWith('Edg') ? 'Edge' : raw === 'FxiOS' ? 'Firefox' : raw === 'CriOS' ? 'Chrome' : raw
  return b === 'Safari' ? `Safari ${a} · ${os}` : `${label(a)} ${b} · ${os}`
}

/**
 * An error's own message. Anything else thrown (a string, an array, a plain
 * object) is described by its type only: its contents could be anything.
 */
export function describeError(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message
  if (typeof message === 'string') return message
  return `Non-Error ${error === null ? 'null' : Array.isArray(error) ? 'array' : typeof error} thrown`
}

/** Report one error. Safe to call from anywhere; never throws. */
export function reportError(kind: ErrorReportKind, error: unknown, extraStack?: string): void {
  try {
    if (!import.meta.env.PROD) return
    const message = describeError(error)
    const stack = [(error as { stack?: string } | null)?.stack ?? '', extraStack ?? '']
      .filter(Boolean)
      .join('\n')
    if (!isReportable(error, message, stack)) return
    const key = `${kind}|${message}`
    if (sent.has(key) || sent.size >= MAX_REPORTS_PER_SESSION) return
    sent.add(key)

    const body = JSON.stringify({
      p_kind: kind,
      p_message: message.slice(0, 1000),
      p_stack: stack.slice(0, 4000) || null,
      p_route: location.pathname,
      p_app_version: APP_VERSION,
      p_browser: coarseBrowser(navigator.userAgent),
    })
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/report_client_error`
    const apikey = resolveSupabasePublishableKey(import.meta.env)
    const send = (keepalive: boolean) =>
      fetch(url, { method: 'POST', keepalive, headers: { apikey, 'content-type': 'application/json' }, body })
    // Sent now (fetch is asynchronous), so keepalive can carry a report raised
    // just before a reload; a browser that refuses keepalive with a CORS
    // preflight gets a plain send.
    send(true)
      .catch(() => send(false))
      .catch(() => {})
  } catch {
    // Reporting must never become the error.
  }
}

/** Listen for uncaught errors and unhandled rejections, once, at startup. */
export function installErrorReports(): void {
  window.addEventListener('error', (event) => {
    // Resource load failures (a broken <img>) carry no error object.
    if (!event.error && !event.message) return
    reportError('error', event.error ?? new Error(event.message))
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportError('rejection', event.reason)
  })
}
