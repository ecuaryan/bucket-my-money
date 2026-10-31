import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readHeroMath, subscribeHeroMath, writeHeroMath } from '@/lib/heroMathPref'

beforeEach(() => {
  localStorage.clear()
})

describe('heroMathPref', () => {
  it('is off unless the person turned it on', () => {
    expect(readHeroMath('m1')).toBe(false)
    expect(readHeroMath(null)).toBe(false)
    writeHeroMath('m1', true)
    expect(readHeroMath('m1')).toBe(true)
    writeHeroMath('m1', false)
    expect(readHeroMath('m1')).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('is kept per person', () => {
    writeHeroMath('m1', true)
    expect(readHeroMath('m2')).toBe(false)
  })

  it('tells subscribers about changes and stops after unsubscribe', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeHeroMath(onChange)
    writeHeroMath('m1', true)
    expect(onChange).toHaveBeenCalledTimes(1)
    unsubscribe()
    writeHeroMath('m1', false)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('falls back to off when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readHeroMath('m1')).toBe(false)
    spy.mockRestore()
  })
})
