import { describe, expect, it } from 'vitest'
import { planLinkConfirmBody } from './plan'

describe('planLinkConfirmBody', () => {
  it('says what happens to the rule’s buckets', () => {
    expect(planLinkConfirmBody(0, 3)).toBe('Its buckets and amounts will come from your plan.')
    expect(planLinkConfirmBody(0, 0)).toBe('Its buckets and amounts will come from your plan.')
    expect(planLinkConfirmBody(10, 0)).toBe('Its 10 buckets and their amounts will be copied into your plan.')
    expect(planLinkConfirmBody(1, 0)).toBe('Its 1 bucket and its amount will be copied into your plan.')
    expect(planLinkConfirmBody(10, 4)).toBe('Its 10 buckets will be replaced by your plan’s 4.')
  })
})
