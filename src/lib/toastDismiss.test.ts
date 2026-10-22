import { describe, expect, it } from 'vitest'
import {
  TOAST_AUTO_SUCCESS_MAX_CHARS,
  toastDismissMode,
  toastPushPx,
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
    // 12px above (header → toast); below = main padding 24 + push − 12 − height.
    expect(toastPushPx(52)).toBe(52)
    expect(toastPushPx(101)).toBe(101)
  })

  it('never pushes upward', () => {
    expect(toastPushPx(0)).toBe(0)
  })
})
