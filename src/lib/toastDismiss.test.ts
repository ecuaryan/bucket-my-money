import { describe, expect, it } from 'vitest'
import {
  TOAST_AUTO_SUCCESS_MAX_CHARS,
  toastDismissMode,
  toastPushPx,
  toastStickyInsetPx,
} from '@/lib/toastDismiss'

describe('toastDismissMode', () => {
  it('errors always need manual dismiss', () => {
    expect(toastDismissMode('error', 'Short')).toBe('manual')
  })

  it('short success auto-dismisses', () => {
    expect(toastDismissMode('success', 'PIN saved for Alex.')).toBe('auto')
  })

  it('long success needs manual dismiss', () => {
    const long = 'a'.repeat(TOAST_AUTO_SUCCESS_MAX_CHARS + 1)
    expect(toastDismissMode('success', long)).toBe('manual')
  })
})


describe('toastPushPx', () => {
  it('leaves equal space above and below the toast', () => {
    // 12px above (header → toast); below = main padding 16 + push − 12 − height.
    expect(toastPushPx(52)).toBe(60)
    expect(toastPushPx(101)).toBe(109)
  })

  it('never pushes upward', () => {
    expect(toastPushPx(-100)).toBe(0)
  })
})

describe('toastStickyInsetPx', () => {
  it('pins sticky headings just below the toast', () => {
    // toast sits TOAST_GAP below the header; headings clear it by 8px more.
    expect(toastStickyInsetPx(52)).toBe(52 + 12 + 8)
  })
})
