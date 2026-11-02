import type { ReactNode } from 'react'

/**
 * Top of a form or content sheet: the title (or custom content, e.g. kind
 * tabs) and a × close button. Confirmations use ConfirmSheet instead — their
 * Cancel sits next to the action, so they have no ×.
 */
export function SheetHeader({
  title,
  children,
  onClose,
  disabled,
  centerClose = false,
}: {
  title?: string
  /** Replaces the title, e.g. a title plus a status line, or tabs. */
  children?: ReactNode
  onClose: () => void
  disabled?: boolean
  /** Center the × beside single-row content such as tabs (default: top-aligned). */
  centerClose?: boolean
}) {
  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      {children ?? (
        <h2 className="min-w-0 truncate text-lg font-semibold text-zinc-300">
          {title}
        </h2>
      )}
      <button
        type="button"
        onClick={onClose}
        disabled={disabled}
        aria-label="Close"
        className={
          'shrink-0 rounded p-1 ' + (centerClose ? 'self-center ' : 'self-start ') +
          'text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50'
        }
      >
        ×
      </button>
    </header>
  )
}
