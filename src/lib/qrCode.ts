/**
 * QR codes drawn in the app. The join link carries the household's join code,
 * so it must not be sent to a third-party image service (it used to be).
 * Output is an SVG data: URL, which the CSP already allows for images.
 */
import qrcode from 'qrcode-generator'

/** Quiet zone around the symbol, in modules (the QR spec asks for 4). */
const QUIET_ZONE = 4

export type QrMatrix = {
  /** Modules per side (without the quiet zone). */
  size: number
  isDark: (row: number, col: number) => boolean
}

/** Encode `text` (auto-sized, error correction level M). */
export function qrMatrix(text: string): QrMatrix {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return { size: qr.getModuleCount(), isDark: (row, col) => qr.isDark(row, col) }
}

/** The QR as one crisp, scalable SVG image: `<img src={...} />`. */
export function qrSvgDataUrl(text: string): string {
  const { size, isDark } = qrMatrix(text)
  const total = size + QUIET_ZONE * 2

  // One path, one rectangle per horizontal run of dark modules.
  let path = ''
  for (let row = 0; row < size; row++) {
    let col = 0
    while (col < size) {
      if (!isDark(row, col)) {
        col++
        continue
      }
      const start = col
      while (col < size && isDark(row, col)) col++
      path += `M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${col - start}v1h-${col - start}z`
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/>` +
    `<path fill="#000" d="${path}"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
