import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { SHEET_UNMOUNT_AFTER_CLOSE_MS } from '@/components/ui/Sheet'

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
})

function button(name: string): HTMLButtonElement {
  const match = [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent === name,
  )
  if (!match) throw new Error(`no button "${name}"`)
  return match
}

describe('ConfirmSheet', () => {
  it('shows the title and consequence, and confirms or cancels', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    await act(async () =>
      root.render(
        <ConfirmSheet
          title="Delete Groceries?"
          body="$120 returns to Unbucketed."
          confirmLabel="Delete Groceries"
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      ),
    )
    expect(document.body.textContent).toContain('Delete Groceries?')
    expect(document.body.textContent).toContain('$120 returns to Unbucketed.')
    await act(async () => button('Delete Groceries').click())
    expect(onConfirm).toHaveBeenCalledOnce()
    await act(async () => button('Cancel').click())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows the busy label and cannot be closed while busy', async () => {
    const onClose = vi.fn()
    await act(async () =>
      root.render(
        <ConfirmSheet
          title="Remove Sam?"
          body="Sam is signed out everywhere."
          confirmLabel="Remove Sam"
          busyLabel="Removing…"
          busy
          error="Could not remove."
          onConfirm={() => {}}
          onClose={onClose}
        />,
      ),
    )
    expect(button('Removing…').disabled).toBe(true)
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not remove.',
    )
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves nothing over the page once closed, even when no transitionend fires', async () => {
    vi.useFakeTimers()
    try {
      const sheet = (open: boolean) => (
        <ConfirmSheet
          open={open}
          title="Link Payday?"
          body="Its buckets and amounts will come from your plan."
          confirmLabel="Link"
          onConfirm={() => {}}
          onClose={() => {}}
        />
      )
      await act(async () => root.render(sheet(true)))
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()

      // jsdom runs no CSS transitions, like reduced motion or an interrupted close.
      await act(async () => root.render(sheet(false)))
      await act(async () => vi.advanceTimersByTime(SHEET_UNMOUNT_AFTER_CLOSE_MS))
      expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
