/**
 * Receipt / thermal-print tests — verifies the generated receipt HTML:
 *   - Always dark text on white background (readable on thermal paper)
 *   - Shipping shown as a separate line (not mislabeled as "گرد شده")
 *   - No leftover rounding-margin label
 */
import { describe, it, expect } from 'vitest'
import { generateReceiptHTML } from '../src/renderer/src/utils/receipt'

function baseData(over: Record<string, any> = {}) {
  return {
    title: 'فاکتور فروش',
    invoiceNumber: 'INV-001',
    date: '1405/06/01',
    cashier: 'علی',
    method: 'نقدی',
    items: [{ name: 'شیر', qty: 2, price: 500, total: 1000 }],
    subtotal: 1000,
    total: 1000,
    storeName: 'فروشگاه من',
    ...over,
  }
}

describe('generateReceiptHTML', () => {
  it('always uses black text on white background for thermal paper', () => {
    const html = generateReceiptHTML(baseData())
    expect(html).toContain('color:#000')
    expect(html).toContain('background:#fff')
  })

  it('shows shipping as its own line when present', () => {
    const html = generateReceiptHTML(baseData({ subtotal: 1000, total: 1200, shipping: 200 }))
    expect(html).toContain('هزینه ارسال')
    expect(html).toContain('۲۰۰')
    // the outdated "گرد شده" (rounding) label must not appear
    expect(html).not.toContain('گرد شده')
    // total is still shown
    expect(html).toContain('مبلغ قابل پرداخت')
    expect(html).toContain('۱٬۲۰۰')
  })

  it('omits the shipping row when there is no shipping', () => {
    const html = generateReceiptHTML(baseData())
    expect(html).not.toContain('هزینه ارسال')
    expect(html).not.toContain('گرد شده')
  })

  it('renders customer-paid and change for cash sales', () => {
    const html = generateReceiptHTML(baseData({ customerPaid: 2000, change: 800, total: 1200 }))
    expect(html).toContain('پرداختی مشتری')
    expect(html).toContain('پول خرد')
    expect(html).toContain('۲٬۰۰۰')
    expect(html).toContain('۸۰۰')
  })

  it('escapes nothing harmful and keeps RTL direction', () => {
    const html = generateReceiptHTML(baseData())
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('width:80mm')
  })
})
