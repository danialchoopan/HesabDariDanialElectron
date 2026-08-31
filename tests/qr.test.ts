/**
 * QR round-trip test — proves the generated QR codes are REAL and scannable.
 *
 * Generates a QR PNG with `qrcode` (the same encoder used by the app's
 * generateQRSvg), decodes the PNG pixels with `jsqr` (an independent decoder,
 * the same algorithm phone/scanner apps use), and asserts the decoded text
 * matches the original payload.
 */
import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { inflateSync } from 'zlib'

/** Minimal PNG → RGBA ImageData decoder (8-bit RGBA, no interlace). */
function pngToImageData(buf: Buffer): { width: number; height: number; data: Uint8ClampedArray } {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG')
  let offset = 8
  let width = 0, height = 0
  let colorType = 0
  let bitDepth = 0
  const idat: Buffer[] = []
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    }
    offset += 12 + len
  }
  if (colorType !== 6 || bitDepth !== 8) throw new Error(`Unsupported PNG: colorType=${colorType} bitDepth=${bitDepth}`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const out = new Uint8ClampedArray(width * height * 4)
  let src = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[src++]
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[src]
      const left = x >= 4 ? out[(y * stride) + x - 4] : 0
      const up = y > 0 ? out[((y - 1) * stride) + x] : 0
      const upLeft = (x >= 4 && y > 0) ? out[((y - 1) * stride) + x - 4] : 0
      let val = rawByte
      if (filter === 1) val = (rawByte + left) & 0xff
      else if (filter === 2) val = (rawByte + up) & 0xff
      else if (filter === 3) val = (rawByte + ((left + up) >> 1)) & 0xff
      else if (filter === 4) {
        const pa = Math.abs(up - upLeft)
        const pb = Math.abs(left - upLeft)
        const pc = Math.abs(left + up - 2 * upLeft)
        const pred = (pa <= pb && pa <= pc) ? left : (pb <= pc) ? up : upLeft
        val = (rawByte + pred) & 0xff
      }
      out[(y * stride) + x] = val
      src++
    }
  }
  return { width, height, data: out }
}

async function decodeQr(text: string): Promise<string | null> {
  const buf = await QRCode.toBuffer(text, { width: 400, margin: 4, errorCorrectionLevel: 'M' })
  const { width, height, data } = pngToImageData(buf)
  const result = jsQR(data, width, height)
  return result ? result.data : null
}

describe('QR generation (real, scannable)', () => {
  it('decodes back a numeric barcode', async () => {
    expect(await decodeQr('PRD-000001')).toBe('PRD-000001')
  })

  it('decodes back a product barcode (626... GTIN style)', async () => {
    expect(await decodeQr('6260123456789')).toBe('6260123456789')
  })

  it('decodes back a URL', async () => {
    expect(await decodeQr('https://example.com/product/42')).toBe('https://example.com/product/42')
  })

  it('decodes back Persian text (UTF-8 byte mode)', async () => {
    expect(await decodeQr('شیر کاله ۱ لیتری')).toBe('شیر کاله ۱ لیتری')
  })

  it('decodes a longer payload (product info)', async () => {
    const payload = 'INV-20260915-0001|شیر کاله|32000|2'
    expect(await decodeQr(payload)).toBe(payload)
  })
})
