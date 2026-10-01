import { useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import type { Database } from '@/types/database'

type Bucket = Database['public']['Tables']['buckets']['Row']

type Props = {
  bucket: Bucket
  /** When false, notes are view-only (mirrors rename gating). */
  canEdit: boolean
  onClose: () => void
  /** Persists the notes; throws on failure so the sheet can show the error. */
  onSave: (notes: string | null) => Promise<void>
}

/**
 * View/edit sheet for a bucket's freeform notes. Opens in view mode;
 * the Edit button (when allowed) swaps to a textarea.
 */
export default function BucketNotesSheet({
  bucket,
  canEdit,
  onClose,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasNotes = (bucket.notes ?? '').trim().length > 0

  function startEdit() {
    setDraft(bucket.notes ?? '')
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft.trim() ? draft : null)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save notes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} aria-label={`Notes for ${bucket.name}`}>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-lg font-semibold text-zinc-200">
          {bucket.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-300"
        >
          ×
        </button>
      </header>

      {editing ? (
        <div className="space-y-4">
          <label
            htmlFor="bucket-notes-editor"
            className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Notes
          </label>
          <textarea
            id="bucket-notes-editor"
            autoFocus
            rows={8}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What is this bucket for? What should come out of it?"
            className="min-h-32 w-full resize-y rounded-lg border-0 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700 placeholder:text-zinc-600 focus:outline focus:outline-2 focus:outline-emerald-400"
          />
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-inset ring-red-500/30"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {hasNotes ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
              {bucket.notes}
            </p>
          ) : (
            <p className="text-sm text-zinc-500">No notes yet.</p>
          )}
          {canEdit && (
            <div>
              <button
                type="button"
                onClick={startEdit}
                className="text-sm font-medium text-emerald-400 transition hover:text-emerald-300"
              >
                {hasNotes ? 'Edit notes' : 'Add notes'}
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
