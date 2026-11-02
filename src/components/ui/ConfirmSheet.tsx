import type { ReactNode } from 'react'
import { Sheet } from '@/components/ui/Sheet'

type Props = {
  open?: boolean
  /** The question, naming the thing: "Delete Groceries?" */
  title: string
  /** The consequence in one or two sentences — no lists, no "What happens". */
  body: ReactNode
  /** Extra content between the body and the buttons (e.g. a list of affected rules). */
  children?: ReactNode
  confirmLabel: string
  busyLabel?: string
  busy?: boolean
  error?: string | null
  /** `danger` (red) removes something; `caution` (amber) changes access or links. */
  tone?: 'danger' | 'caution'
  cancelLabel?: string
  confirmAriaLabel?: string
  onConfirm: () => void
  onClose: () => void
}

const CONFIRM_TONE = {
  danger: 'bg-red-500 text-white hover:bg-red-400',
  caution: 'bg-amber-500 text-black hover:bg-amber-400',
} as const

/**
 * Confirmation for a consequential action: title, a sentence or two, Cancel and
 * the action. Closing is blocked while `busy`.
 */
export function ConfirmSheet({
  open = true,
  title,
  body,
  children,
  confirmLabel,
  busyLabel,
  busy = false,
  error,
  tone = 'danger',
  cancelLabel = 'Cancel',
  confirmAriaLabel,
  onConfirm,
  onClose,
}: Props) {
  const close = busy ? () => {} : onClose
  return (
    <Sheet open={open} onClose={close} aria-label={title}>
      <h2 className="text-lg font-semibold text-zinc-200">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</div>
      {children ? <div className="mt-4">{children}</div> : null}
      {error ? (
        <p
          role="alert"
          className="mt-4 break-words rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-inset ring-red-500/30"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={close}
          disabled={busy}
          className="flex-1 rounded-lg py-2.5 text-sm font-medium text-zinc-300 ring-1 ring-inset ring-zinc-700 transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          aria-label={confirmAriaLabel}
          className={
            'flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ' +
            CONFIRM_TONE[tone]
          }
        >
          {busy && busyLabel ? busyLabel : confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}
