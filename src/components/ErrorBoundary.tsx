import { Component, type ErrorInfo, type ReactNode } from 'react'
import { isChunkLoadError, reportError } from '@/lib/errorReports'

/**
 * App-wide error boundary. Without one, any render-time throw unmounts the whole
 * React tree and leaves a blank screen with no way out. This catches the error,
 * keeps the shell visible, and gives the user a way to recover.
 *
 * Two recovery paths:
 *  - Chunk-load failures (a lazy route whose JS 404s after a deploy changed the
 *    asset hashes) auto-reload once — a fresh load pulls the current assets.
 *  - Anything else shows a recovery screen with a Reload button and the error
 *    text, so the user isn't stranded and can report what happened.
 */

const CHUNK_RELOAD_KEY = 'bmm:chunk-reload-at'
const CHUNK_RELOAD_WINDOW_MS = 10_000

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Stale tab after a deploy: reload once to fetch the current chunks. Guard on
    // a timestamp so a genuinely broken build can't trap the user in a reload loop.
    if (isChunkLoadError(error)) {
      let lastReload = 0
      try {
        lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0
      } catch {
        /* sessionStorage unavailable — fall through to the manual screen */
      }
      if (Date.now() - lastReload > CHUNK_RELOAD_WINDOW_MS) {
        try {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
        } catch {
          /* ignore */
        }
        window.location.reload()
        return
      }
    }
    console.error('App crashed:', error, info.componentStack)
    reportError('render', error, info.componentStack ?? undefined)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-zinc-300">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-zinc-400">
          The app hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
        >
          Reload
        </button>
        {error.message ? (
          <p className="mt-2 max-w-sm break-words font-mono text-xs text-zinc-600">
            {error.message}
          </p>
        ) : null}
      </div>
    )
  }
}
