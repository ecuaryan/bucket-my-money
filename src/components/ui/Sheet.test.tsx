import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sheet } from '@/components/ui/Sheet'

let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  root = createRoot(document.createElement('div'))
})

afterEach(async () => {
  await act(async () => root.unmount())
})

/** A real tap: pointerdown on one element, click on where it ended. */
async function tap(down: Element, up: Element = down) {
  await act(async () => {
    down.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    // A press that moves between elements clicks their common ancestor.
    const target = up.contains(down) ? up : down.contains(up) ? down : document.body
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function renderSheet(closeOnBackdropClick?: boolean) {
  const onClose = vi.fn()
  await act(async () =>
    root.render(
      <Sheet open onClose={onClose} aria-label="Edit line" closeOnBackdropClick={closeOnBackdropClick}>
        <textarea aria-label="Note" />
      </Sheet>,
    ),
  )
  const backdrop = document.body.querySelector('[role="dialog"]')!
  const note = document.body.querySelector('textarea')!
  return { onClose, backdrop, note }
}

describe('Sheet backdrop', () => {
  it('a tap outside the panel closes it; a tap inside does not', async () => {
    const { onClose, backdrop, note } = await renderSheet()
    await tap(note)
    expect(onClose).not.toHaveBeenCalled()
    await tap(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('a press that starts in the panel and ends outside (selecting text) does not close it', async () => {
    const { onClose, backdrop, note } = await renderSheet()
    await tap(note, backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open on a tap outside while closeOnBackdropClick is off (unsaved edits)', async () => {
    const { onClose, backdrop } = await renderSheet(false)
    await tap(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })
})
