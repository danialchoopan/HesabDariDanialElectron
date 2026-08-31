/**
 * QR Code utilities — generates real, scannable QR codes.
 *
 * Uses the battle-tested `qrcode` library (ISO/IEC 18004) instead of a
 * hand-rolled encoder. The previous custom encoder had bugs in the format
 * information and data-placement zigzag, so its output could not be scanned
 * reliably by cameras/scanners.
 *
 * `generateQRSvg` returns an <svg> string with a white background and the
 * required quiet zone, ready to embed in HTML (labels, receipts, reports).
 */

import QRCode from 'qrcode'

/**
 * Generate a scannable QR code as an SVG string.
 *
 * @param text - the payload to encode (e.g. a product barcode: 'PRD-000001')
 * @param size - nominal width/height in pixels (default 128)
 * @returns SVG markup string with quiet zone + white background
 */
export async function generateQRSvg(text: string, size: number = 128): Promise<string> {
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 4, // required quiet zone so scanners can read it
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
    // The library returns a viewBox-scaled SVG; give it an explicit size so
    // embedded labels/receipts render at a predictable dimension.
    return svg.replace('<svg ', `<svg width="${size}" height="${size}" `)
  } catch {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/><text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${size / 10}" fill="#999">خطا</text></svg>`
  }
}

/**
 * Generate a QR code as a PNG data URL (for downloads/images).
 */
export async function generateQRDataURL(text: string, size: number = 256): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })
}
