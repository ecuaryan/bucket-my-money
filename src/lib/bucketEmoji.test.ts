import { describe, expect, it } from 'vitest'
import { splitBucketEmoji } from '@/lib/bucketEmoji'
import { dominantHue } from '@/lib/emojiTint'

describe('splitBucketEmoji', () => {
  it('splits a leading emoji from the name', () => {
    expect(splitBucketEmoji('🏠 Rent')).toEqual({ emoji: '🏠', label: 'Rent' })
    expect(splitBucketEmoji('🏠Rent')).toEqual({ emoji: '🏠', label: 'Rent' })
  })

  it('keeps variation selectors, skin tones, ZWJ sequences, flags and keycaps whole', () => {
    expect(splitBucketEmoji('✈️ Travel').emoji).toBe('✈️')
    expect(splitBucketEmoji('👍🏽 Tips').emoji).toBe('👍🏽')
    expect(splitBucketEmoji('👨‍👩‍👧 Family').emoji).toBe('👨‍👩‍👧')
    expect(splitBucketEmoji('🇺🇸 Trip').emoji).toBe('🇺🇸')
    expect(splitBucketEmoji('1️⃣ First').emoji).toBe('1️⃣')
  })

  it('leaves names without a leading emoji alone', () => {
    expect(splitBucketEmoji('Groceries')).toEqual({ emoji: null, label: 'Groceries' })
    expect(splitBucketEmoji('Rent 🏠')).toEqual({ emoji: null, label: 'Rent 🏠' })
    expect(splitBucketEmoji('2024 Taxes')).toEqual({ emoji: null, label: '2024 Taxes' })
    expect(splitBucketEmoji('#1 Priority')).toEqual({ emoji: null, label: '#1 Priority' })
  })

  it('never blanks the row when the name is only an emoji', () => {
    expect(splitBucketEmoji('🏠')).toEqual({ emoji: null, label: '🏠' })
  })
})

function pixels(colors: Array<[number, number, number, number]>): number[] {
  return colors.flat()
}

describe('dominantHue', () => {
  it('finds the hue of a single-color emoji', () => {
    const red = Array.from({ length: 20 }, () => [220, 30, 30, 255] as [number, number, number, number])
    const hue = dominantHue(pixels(red))
    expect(hue).not.toBeNull()
    expect(hue!).toBeLessThanOrEqual(5)
  })

  it('returns null for grey, transparent or empty images', () => {
    const grey = Array.from({ length: 20 }, () => [120, 120, 120, 255] as [number, number, number, number])
    expect(dominantHue(pixels(grey))).toBeNull()
    const clear = Array.from({ length: 20 }, () => [220, 30, 30, 0] as [number, number, number, number])
    expect(dominantHue(pixels(clear))).toBeNull()
    expect(dominantHue([])).toBeNull()
  })

  it('returns null when the hues disagree (multicolor emoji)', () => {
    const mixed: Array<[number, number, number, number]> = []
    for (let i = 0; i < 10; i += 1) mixed.push([220, 30, 30, 255], [30, 90, 220, 255], [40, 200, 60, 255])
    expect(dominantHue(pixels(mixed))).toBeNull()
  })
})
