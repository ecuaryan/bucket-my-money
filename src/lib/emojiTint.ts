/**
 * Picks a tile tint from an emoji's own colors: draw it small on a canvas and
 * average the hue of its saturated pixels. Multicolor or washed-out emoji have
 * no clear dominant hue and return null (the tile stays neutral).
 */

const SIZE = 32
const MIN_ALPHA = 140
const MIN_SATURATION = 0.35
/** Share of visible pixels that must be saturated for the emoji to count as colored. */
const MIN_COLORED_SHARE = 0.3
/** Length of the mean hue vector (0–1); low means the hues disagree. */
const MIN_HUE_AGREEMENT = 0.7

/** Dominant hue (0–359) of RGBA pixel data, or null when there is no clear one. */
export function dominantHue(pixels: ArrayLike<number>): number | null {
  let visible = 0
  let colored = 0
  let x = 0
  let y = 0
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < MIN_ALPHA) continue
    visible += 1
    const r = pixels[i] / 255
    const g = pixels[i + 1] / 255
    const b = pixels[i + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    if (max < 0.25 || delta / max < MIN_SATURATION) continue
    let hue: number
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    const radians = (hue * 60 * Math.PI) / 180
    colored += 1
    x += Math.cos(radians)
    y += Math.sin(radians)
  }
  if (visible === 0 || colored / visible < MIN_COLORED_SHARE) return null
  if (Math.hypot(x, y) / colored < MIN_HUE_AGREEMENT) return null
  const degrees = (Math.atan2(y, x) * 180) / Math.PI
  return Math.round((degrees + 360) % 360)
}

const cache = new Map<string, number | null>()

/** Tint hue for an emoji, cached per emoji. Null when it cannot be measured. */
export function emojiHue(emoji: string): number | null {
  if (cache.has(emoji)) return cache.get(emoji) ?? null
  let hue: number | null = null
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.font = `${SIZE - 8}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(emoji, SIZE / 2, SIZE / 2 + 1)
        hue = dominantHue(ctx.getImageData(0, 0, SIZE, SIZE).data)
      }
    }
  } catch {
    hue = null
  }
  cache.set(emoji, hue)
  return hue
}
