import { useState, type FormEvent } from 'react'
import { ClearableInput } from '@/components/ui/ClearableInput'
import { Sheet } from '@/components/ui/Sheet'
import {
  BUCKET_GROUP_CREATE_HINT,
  BUCKET_GROUP_CREATE_TITLE,
  BUCKET_GROUP_DELETE_WHAT_HAPPENS,
  BUCKET_GROUP_NAME_LABEL,
  BUCKET_GROUP_NAME_PLACEHOLDER,
  BUCKET_GROUP_RENAME_TITLE,
  bucketGroupDeleteIntro,
  bucketGroupDeleteTitle,
} from '@/lib/brand'
import { BUCKET_GROUP_NAME_MAX_LENGTH } from '@/lib/bucketGroups'

function SheetHeader({
  title,
  onClose,
  disabled,
}: {
  title: string
  onClose: () => void
  disabled?: boolean
}) {
  return (
    <header className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="min-w-0 truncate text-lg font-semibold text-zinc-300">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        disabled={disabled}
        aria-label="Close"
        className="shrink-0 rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
      >
        ×
      </button>
    </header>
  )
}

type NameSheetProps = {
  mode: 'create' | 'rename'
  initialName: string
  onClose: () => void
  /** Persists the name (blank = unnamed); throws so the sheet can show the error. */
  onSubmit: (name: string) => Promise<void>
}

/** Create or rename a group. The name is optional — blank makes an unnamed group. */
export function BucketGroupNameSheet({
  mode,
  initialName,
  onClose,
  onSubmit,
}: NameSheetProps) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title =
    mode === 'create' ? BUCKET_GROUP_CREATE_TITLE : BUCKET_GROUP_RENAME_TITLE

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save group.')
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={saving ? () => {} : onClose} aria-label={title}>
      <SheetHeader title={title} onClose={onClose} disabled={saving} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="bucket-group-name"
            className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            {BUCKET_GROUP_NAME_LABEL}
          </label>
          <ClearableInput
            id="bucket-group-name"
            wrapperClassName="mt-2"
            autoFocus
            type="text"
            value={name}
            maxLength={BUCKET_GROUP_NAME_MAX_LENGTH}
            onValueChange={(v) => {
              setName(v)
              if (error) setError(null)
            }}
            placeholder={BUCKET_GROUP_NAME_PLACEHOLDER}
            inputClassName="w-full rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-500 focus:outline focus:outline-2 focus:outline-emerald-400"
          />
        </div>
        {mode === 'create' && (
          <p className="text-xs text-zinc-400">{BUCKET_GROUP_CREATE_HINT}</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 ring-1 ring-inset ring-zinc-700 transition hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Create group' : 'Save'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

type DeleteSheetProps = {
  name: string | null
  bucketCount: number
  onClose: () => void
  onConfirm: () => Promise<void>
}

/** Confirmation that spells out exactly what deleting a group does (and doesn't). */
export function BucketGroupDeleteSheet({
  name,
  bucketCount,
  onClose,
  onConfirm,
}: DeleteSheetProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title = bucketGroupDeleteTitle(name)

  async function handleConfirm() {
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete group.')
      setDeleting(false)
    }
  }

  return (
    <Sheet open onClose={deleting ? () => {} : onClose} aria-label={title}>
      <SheetHeader title={title} onClose={onClose} disabled={deleting} />
      <div className="space-y-4">
        <p className="text-sm text-zinc-300">{bucketGroupDeleteIntro(bucketCount)}</p>
        <ul className="space-y-1 rounded-lg bg-zinc-950 px-3 py-2 text-sm text-zinc-400 ring-1 ring-inset ring-zinc-800">
          {BUCKET_GROUP_DELETE_WHAT_HAPPENS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 ring-1 ring-inset ring-zinc-700 transition hover:bg-zinc-800 disabled:opacity-50"
          >
            Keep group
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={deleting}
            className="flex-1 rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete group'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
