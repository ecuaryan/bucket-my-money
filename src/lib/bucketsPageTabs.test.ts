import { describe, expect, it } from 'vitest'
import {
  applyBucketsPageTabToSearchParams,
  bucketsPageTabOptions,
  isAutoOrganizeTabAvailabilityPending,
  parseBucketsPageTab,
  resolveBucketsPageTab,
  shouldShowAutoOrganizeTab,
  shouldShowPlanTab,
} from '@/lib/bucketsPageTabs'

describe('parseBucketsPageTab', () => {
  it('defaults to buckets', () => {
    expect(parseBucketsPageTab(null)).toBe('buckets')
    expect(parseBucketsPageTab(undefined)).toBe('buckets')
    expect(parseBucketsPageTab('')).toBe('buckets')
    expect(parseBucketsPageTab('other')).toBe('buckets')
  })

  it('parses auto-organize', () => {
    expect(parseBucketsPageTab('auto-bucket')).toBe('auto-bucket')
  })

  it('parses plan', () => {
    expect(parseBucketsPageTab('plan')).toBe('plan')
  })

  it('parses bank', () => {
    expect(parseBucketsPageTab('bank')).toBe('bank')
  })

  it('parses bitcoin', () => {
    expect(parseBucketsPageTab('bitcoin')).toBe('bitcoin')
  })
})

describe('resolveBucketsPageTab', () => {
  it('falls back to buckets when auto-organize tab is unavailable', () => {
    expect(
      resolveBucketsPageTab('auto-bucket', { autoOrganize: false, account: false }),
    ).toBe('buckets')
  })

  it('keeps auto-organize when available', () => {
    expect(
      resolveBucketsPageTab('auto-bucket', { autoOrganize: true, account: false }),
    ).toBe('auto-bucket')
  })

  it('falls back to buckets when bank tab is unavailable', () => {
    expect(
      resolveBucketsPageTab('bank', { autoOrganize: false, account: false }),
    ).toBe('buckets')
  })

  it('keeps bank when available', () => {
    expect(
      resolveBucketsPageTab('bank', { autoOrganize: false, account: true }),
    ).toBe('bank')
  })

  it('falls back to buckets when bitcoin tab is unavailable or unspecified', () => {
    expect(
      resolveBucketsPageTab('bitcoin', {
        autoOrganize: false,
        account: false,
        bitcoin: false,
      }),
    ).toBe('buckets')
    expect(
      resolveBucketsPageTab('bitcoin', { autoOrganize: false, account: false }),
    ).toBe('buckets')
  })

  it('keeps bitcoin when available', () => {
    expect(
      resolveBucketsPageTab('bitcoin', {
        autoOrganize: false,
        account: false,
        bitcoin: true,
      }),
    ).toBe('bitcoin')
  })
})

describe('bucketsPageTabOptions', () => {
  it('returns only buckets when no optional tabs are available', () => {
    const opts = bucketsPageTabOptions({ showAutoOrganize: false, showAccount: false })
    expect(opts.map((o) => o.value)).toEqual(['buckets'])
  })

  it('appends optional tabs in order: buckets, auto-bucket, bank', () => {
    const opts = bucketsPageTabOptions({ showAutoOrganize: true, showAccount: true })
    expect(opts.map((o) => o.value)).toEqual([
      'buckets',
      'auto-bucket',
      'bank',
    ])
  })

  it('includes only the bank tab for a linked child', () => {
    const opts = bucketsPageTabOptions({ showAutoOrganize: false, showAccount: true })
    expect(opts.map((o) => o.value)).toEqual(['buckets', 'bank'])
  })

  it('appends bitcoin last when enabled', () => {
    const opts = bucketsPageTabOptions({
      showAutoOrganize: true,
      showAccount: true,
      showBitcoin: true,
    })
    expect(opts.map((o) => o.value)).toEqual([
      'buckets',
      'auto-bucket',
      'bank',
      'bitcoin',
    ])
  })
})

describe('Plan tab', () => {
  it('sits right after Buckets, before Auto-bucket and Bank', () => {
    expect(
      bucketsPageTabOptions({ showPlan: true, showAutoOrganize: true, showAccount: true }).map((o) => o.value),
    ).toEqual(['buckets', 'plan', 'auto-bucket', 'bank'])
  })

  it('falls back to buckets when Plan is unavailable', () => {
    expect(resolveBucketsPageTab('plan', { plan: false, autoOrganize: true, account: true })).toBe('buckets')
    expect(resolveBucketsPageTab('plan', { plan: true, autoOrganize: true, account: true })).toBe('plan')
  })

  it('shows for admins always, shared members once a plan exists, children never', () => {
    expect(shouldShowPlanTab('admin', null)).toBe(true)
    expect(shouldShowPlanTab('admin', false)).toBe(true)
    expect(shouldShowPlanTab('member', null)).toBe(false)
    expect(shouldShowPlanTab('member', false)).toBe(false)
    expect(shouldShowPlanTab('member', true)).toBe(true)
    expect(shouldShowPlanTab('child', true)).toBe(false)
    expect(shouldShowPlanTab(null, true)).toBe(false)
  })
})

describe('shouldShowAutoOrganizeTab', () => {
  it('hides from children', () => {
    expect(shouldShowAutoOrganizeTab(false, true, true)).toBe(false)
  })

  it('shows for admin even before availability resolves', () => {
    expect(shouldShowAutoOrganizeTab(true, true, null)).toBe(true)
  })

  it('shows for shared member only when rules exist', () => {
    expect(shouldShowAutoOrganizeTab(true, false, null)).toBe(false)
    expect(shouldShowAutoOrganizeTab(true, false, false)).toBe(false)
    expect(shouldShowAutoOrganizeTab(true, false, true)).toBe(true)
  })
})

describe('isAutoOrganizeTabAvailabilityPending', () => {
  it('waits only for shared members who can see auto-organize', () => {
    expect(isAutoOrganizeTabAvailabilityPending(true, false, null)).toBe(true)
    expect(isAutoOrganizeTabAvailabilityPending(true, false, true)).toBe(
      false,
    )
    expect(isAutoOrganizeTabAvailabilityPending(true, true, null)).toBe(false)
    expect(isAutoOrganizeTabAvailabilityPending(false, false, null)).toBe(
      false,
    )
  })
})

describe('applyBucketsPageTabToSearchParams', () => {
  it('sets tab without dropping unrelated params', () => {
    const prev = new URLSearchParams('foo=bar')
    const next = applyBucketsPageTabToSearchParams(prev, 'auto-bucket')
    expect(next.get('foo')).toBe('bar')
    expect(next.get('tab')).toBe('auto-bucket')
  })

  it('removes tab param for buckets default', () => {
    const prev = new URLSearchParams('tab=auto-bucket&foo=bar')
    const next = applyBucketsPageTabToSearchParams(prev, 'buckets')
    expect(next.get('tab')).toBeNull()
    expect(next.get('foo')).toBe('bar')
  })

  it('sets the bank tab param', () => {
    const prev = new URLSearchParams('foo=bar')
    const next = applyBucketsPageTabToSearchParams(prev, 'bank')
    expect(next.get('tab')).toBe('bank')
    expect(next.get('foo')).toBe('bar')
  })

  it('does not mutate the input params', () => {
    const prev = new URLSearchParams('tab=auto-bucket')
    applyBucketsPageTabToSearchParams(prev, 'buckets')
    expect(prev.get('tab')).toBe('auto-bucket')
  })
})
