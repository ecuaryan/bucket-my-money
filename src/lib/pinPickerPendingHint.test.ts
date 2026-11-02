import { describe, expect, it } from 'vitest'
import {
  pinPickerPendingLead,
} from './brand'

describe('pinPickerPendingLead', () => {
  it('uses personal copy when everyone is waiting on a PIN', () => {
    expect(pinPickerPendingLead('Alex', true)).toBe(
      'Waiting for Alex to set your PIN.',
    )
  })

  it('uses household copy when some members can already sign in', () => {
    expect(pinPickerPendingLead('Alex', false)).toBe(
      'Waiting for Alex to set remaining PINs.',
    )
  })

  it('falls back to the generic admin phrase', () => {
    expect(pinPickerPendingLead(null, false)).toContain('your household admin')
  })
})
