import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { qrMatrix, qrSvgDataUrl } from '@/lib/qrCode'

// Proof that the QR we draw is scannable: take the generated SVG, rasterize it
// ourselves (read the path back into pixels), and decode it with an
// independent QR reader (jsQR).

const SCALE = 6

function svgFromDataUrl(dataUrl: string): string {
  const prefix = 'data:image/svg+xml;charset=utf-8,'
  expect(dataUrl.startsWith(prefix)).toBe(true)
  return decodeURIComponent(dataUrl.slice(prefix.length))
}

/** Rasterize our own SVG (white square + one path of `M x y h w v1 h-w z` runs). */
function rasterize(svg: string): { data: Uint8ClampedArray; width: number; height: number } {
  const total = Number(svg.match(/viewBox="0 0 (\d+) \d+"/)![1])
  const width = total * SCALE
  const data = new Uint8ClampedArray(width * width * 4).fill(255)
  const path = svg.match(/<path fill="#000" d="([^"]*)"/)![1]
  for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])]
    for (let py = y * SCALE; py < (y + 1) * SCALE; py++) {
      for (let px = x * SCALE; px < (x + w) * SCALE; px++) {
        const i = (py * width + px) * 4
        data[i] = data[i + 1] = data[i + 2] = 0
      }
    }
  }
  return { data, width, height: width }
}

function decode(text: string): string | undefined {
  const { data, width, height } = rasterize(svgFromDataUrl(qrSvgDataUrl(text)))
  return jsQR(data, width, height)?.data
}

describe('qrSvgDataUrl', () => {
  it.each([
    ['a new 12-character join code', 'https://bucketmymoney.com/join?code=39S27X82A6G7'],
    ['an existing 8-character join code', 'https://bucketmymoney.com/join?code=K8M2P5XD'],
    ['a local dev origin', 'http://localhost:5173/join?code=39S27X82A6G7'],
    ['a long link', `https://bucketmymoney.com/join?code=${'A2'.repeat(60)}`],
  ])('decodes back to the exact link for %s', (_label, link) => {
    expect(decode(link)).toBe(link)
  })

  it('is a self-contained SVG image (no external references)', () => {
    const svg = svgFromDataUrl(qrSvgDataUrl('https://bucketmymoney.com/join?code=ABC'))
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
    expect(svg).not.toContain('ABC') // the code is encoded as modules, not text
  })

  it('draws a white quiet zone of 4 modules around the symbol', () => {
    const text = 'https://bucketmymoney.com/join?code=39S27X82A6G7'
    const { size } = qrMatrix(text)
    const svg = svgFromDataUrl(qrSvgDataUrl(text))
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`)
    const starts = [...svg.matchAll(/M(\d+) (\d+)h/g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(Math.min(...starts.map(([x]) => x))).toBeGreaterThanOrEqual(4)
    expect(Math.min(...starts.map(([, y]) => y))).toBeGreaterThanOrEqual(4)
  })
})

describe('qrMatrix', () => {
  it('is square, with the three finder squares in the corners', () => {
    const { size, isDark } = qrMatrix('https://bucketmymoney.com/join?code=39S27X82A6G7')
    expect(size).toBeGreaterThanOrEqual(21)
    for (const [r, c] of [[0, 0], [0, size - 1], [size - 1, 0]]) {
      expect(isDark(r, c)).toBe(true)
    }
  })
})
