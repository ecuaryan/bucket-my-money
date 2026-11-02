import { useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth'
import PinInput from '@/components/ui/PinInput'
import { Sheet } from '@/components/ui/Sheet'
import { SheetHeader } from '@/components/ui/SheetHeader'
import { clearOwnPin, setOwnPin } from '@/lib/memberAuth'
import { toast } from '@/lib/toast'
import KeypadIcon from '@/components/ui/KeypadIcon'

/**
 * Self-service PIN management for the signed-in member (any role). Non-admins
 * always already have a PIN (an admin set it before they could sign in), so for
 * them this is "Change PIN"; the email account owner may have none yet, so they
 * see "Set a PIN". Admins still manage everyone from the Admin page.
 */
export default function PinSettingsCard() {
  const auth = useAuth()
  const member = auth.status === 'signedIn' ? auth.member : null

  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  if (!member) return null

  const hasPin = Boolean(member.pin_set_at)
  // Only the account owner can remove their PIN — they still have email +
  // password to sign in. Everyone else is PIN-only and would be locked out.
  const canRemovePin = hasPin && member.is_account_owner

  async function removePin() {
    if (removing) return
    setRemoving(true)
    setError(null)
    try {
      await clearOwnPin()
      await auth.refreshMember()
      toast.success('PIN removed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your PIN.')
    } finally {
      setRemoving(false)
    }
  }

  function openSheet() {
    setPin('')
    setError(null)
    setOpen(true)
  }

  function closeSheet() {
    if (saving) return
    setOpen(false)
    setPin('')
    setError(null)
  }

  async function save(value: string) {
    if (saving) return
    if (!/^\d{4}$/.test(value)) {
      setError('PIN must be exactly 4 digits.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setOwnPin(value)
      await auth.refreshMember()
      toast.success(hasPin ? 'PIN updated.' : 'PIN set.')
      setOpen(false)
      setPin('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your PIN.')
      setPin('')
    } finally {
      setSaving(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await save(pin)
  }

  return (
    <section className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
        <KeypadIcon className="h-5 w-5 text-emerald-400" />
        PIN
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        {hasPin
          ? 'Your 4-digit PIN signs you in on this household’s shared devices. Changing it signs you out on your other devices.'
          : 'Set a 4-digit PIN so you can sign in on this household’s shared devices without your email and password.'}
      </p>
      <button
        type="button"
        onClick={openSheet}
        className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
      >
        {hasPin ? 'Change PIN' : 'Set a PIN'}
      </button>
      {canRemovePin && (
        <button
          type="button"
          onClick={() => void removePin()}
          disabled={removing}
          className="mt-2 w-full text-sm text-zinc-400 transition hover:text-zinc-300 disabled:opacity-60"
        >
          {removing ? 'Removing…' : 'Remove PIN'}
        </button>
      )}

      <Sheet
        open={open}
        onClose={closeSheet}
        aria-label={hasPin ? 'Change your PIN' : 'Set your PIN'}
      >
        <form onSubmit={onSubmit} autoComplete="off">
          <SheetHeader onClose={closeSheet}>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-zinc-300">
                {hasPin ? 'Change your PIN' : 'Set your PIN'}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Your other devices will be signed out.
              </p>
            </div>
          </SheetHeader>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30"
            >
              {error}
            </p>
          )}
          <PinInput
            autoFocus
            aria-label="New 4-digit PIN"
            value={pin}
            onChange={(v) => {
              setPin(v)
              if (error) setError(null)
            }}
            disabled={saving}
            className="mt-4 block w-full rounded-lg bg-zinc-950 px-3 py-3 text-center text-2xl tracking-[0.5em] text-zinc-300 ring-1 ring-zinc-700"
          />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={closeSheet}
              disabled={saving}
              className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || pin.length !== 4}
              className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save PIN'}
            </button>
          </div>
        </form>
      </Sheet>
    </section>
  )
}
