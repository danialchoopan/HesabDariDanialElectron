/**
 * A4 Print utilities — generates printable HTML reports with RTL Farsi support.
 * Uses module-level caches for shop name, phone, tax rate, and customization
 * settings (populated on app startup from the settings store).
 *
 * Key exports:
 * - printA4Report(): Opens a new window with styled HTML, calls window.print()
 * - downloadExcel(): Generates real .xlsx file via xlsx library
 * - downloadCSV(): Generates CSV with BOM for Farsi compatibility
 * - setShopName/setTaxRate/setPrintCustomization(): Populate module caches
 */

import { formatDateTimeNow } from './jalali'
import { generateQRDataURL } from './qrCode'

let cachedShopName = ''
let cachedShopPhone = ''
let cachedShopAddress = ''
let cachedTaxRate = 0
let cachedCustomization: Record<string, string> = {}

export function setShopName(name: string, phone?: string, address?: string) {
  if (name) cachedShopName = name
  if (phone !== undefined) cachedShopPhone = phone
  if (address !== undefined) cachedShopAddress = address
}

export function setTaxRate(rate: number) {
  cachedTaxRate = rate
}

export function getTaxRate(): number {
  return cachedTaxRate
}

export function setPrintCustomization(settings: Record<string, string>) {
  cachedCustomization = { ...settings }
}

export function getPrintCustomization(): Record<string, string> {
  return cachedCustomization
}

function getJalaliNow(): string {
  return formatDateTimeNow()
}

export async function printA4Report(html: string, title: string, options?: {
  shopName?: string
  isInvoice?: boolean
  taxRate?: number
  customization?: Record<string, string>
  qrData?: string
  customerName?: string
  customerType?: 'real' | 'legal'
}): Promise<void> {
  const cust = { ...cachedCustomization, ...(options?.customization || {}) }

  for (const key of ['printLogo', 'printSignature', 'printWatermark'] as const) {
    if (cust[key] && !cust[key].startsWith('data:') && !cust[key].startsWith('http') && window.api?.printSettings) {
      try {
        const r = await window.api.printSettings.getAsset(cust[key])
        if (r.success && r.data) cust[key] = r.data as string
      } catch (e) { /* ignore */ }
    }
  }

  const win = window.open('', '_blank')
  if (!win) return
  const name = options?.shopName || cachedShopName
  const phone = cachedShopPhone
  const isInvoice = options?.isInvoice ?? false
  const taxRate = options?.taxRate ?? cachedTaxRate
  const primaryColor = cust.printColorScheme || '#006194'
  const showSignature = cust.printShowSignature !== 'false'
  const showTax = cust.printShowTax !== 'false'

  const logoHtml = cust.printLogo
    ? `<div class="brand-logo"><img src="${cust.printLogo}" alt="logo" /></div>`
    : ''

  const wmOpacity = cust.printWatermarkOpacity ? (parseInt(cust.printWatermarkOpacity) / 100) : 0.1
  const watermarkStyle = cust.printWatermark
    ? `body::after { content: ''; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${cust.printWatermark}'); background-repeat: no-repeat; background-position: center; background-size: contain; opacity: ${wmOpacity}; pointer-events: none; z-index: -1; }`
    : ''

  const footerText = cust.printFooter || `${name} — تاریخ چاپ: ${getJalaliNow()}`
  // Selected print font (Vazirmatn / Tahoma / Arial / Courier New ...). Only
  // Vazirmatn is bundled; the others fall back to system fonts, which is fine.
  const fontFamily = cust.printFontFamily || 'Vazirmatn'
  const fontStack = fontFamily === 'Vazirmatn'
    ? "'Vazirmatn', Tahoma, 'Segoe UI', sans-serif"
    : `${fontFamily}, 'Vazirmatn', Tahoma, sans-serif`

  // The selected customer's name goes on the invoice and the real/legal
  // (حقیقی/حقوقی) checkbox is pre-ticked to match their customer type.
  const buyerReal = options?.customerType === 'real'
  const buyerLegal = options?.customerType === 'legal'

  const invoiceSection = isInvoice && showSignature ? `
    <div class="buyer-panel">
      <div class="buyer-name">
        <span class="lbl">خریدار</span>
        <strong>${options?.customerName || '—'}</strong>
      </div>
      <div class="buyer-type">
        <span class="type ${buyerReal ? 'on' : ''}">حقیقی</span>
        <span class="type ${buyerLegal ? 'on' : ''}">حقوقی</span>
      </div>
    </div>
    <div class="note-box">
      <span class="lbl">توضیحات</span>
      <div class="description-box"></div>
    </div>
    <div class="signature-row">
      <div class="signature-box">
        <div class="signature-line">مهر و امضای خریدار</div>
      </div>
      <div class="signature-box">
        ${cust.printSignature ? `<img src="${cust.printSignature}" class="signature-img" />` : ''}
        <div class="signature-line">مهر و امضای فروشنده</div>
      </div>
    </div>
  ` : ''

  const headerFields = [cust.printHeaderField1, cust.printHeaderField2, cust.printHeaderField3]
    .filter(Boolean)
    .map(f => `<div>${f}</div>`)
    .join('')

  const taxInfo = taxRate > 0 && showTax
    ? `<div style="font-size: 10pt; color: #555; margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px;"><strong>مالیات بر ارزش افزوده:</strong> ${taxRate}% (شامل قیمت نهایی می‌باشد)</div>`
    : ''

  // Optional QR code on the invoice (e.g. encodes the invoice number)
  let qrHtml = ''
  if (cust.printShowInvoiceQr === 'true' && options?.qrData) {
    try {
      const qrDataUrl = await generateQRDataURL(options.qrData, 160)
      qrHtml = `<div class="qr"><img src="${qrDataUrl}" alt="QR" /><div class="qr-data">${options.qrData}</div></div>`
    } catch { /* keep no QR if generation fails */ }
  }

  // Page-edge accent (border style template)
  let borderCSS = ''
  if (cust.printBorderStyle === 'simple') borderCSS = 'body { border-top: 2px solid ' + primaryColor + '; border-bottom: 2px solid ' + primaryColor + '; }'
  if (cust.printBorderStyle === 'double') borderCSS = 'body { border-top: 4px double ' + primaryColor + '; border-bottom: 4px double ' + primaryColor + '; }'
  if (cust.printBorderStyle === 'decorative') borderCSS = 'body { border-top: 6px solid ' + primaryColor + '; border-bottom: 3px solid ' + primaryColor + '; }'

  // ── Professional invoice/report layout ───────────────────────
  // The whole print is wrapped in .sheet; the shop header sits on top, then a
  // title band, then the caller's content (tables use .header-info / tables),
  // then buyer panel + signature (for invoices), QR and footer.
  const bodyShell = `
  <style>
    @font-face { font-family: 'Vazirmatn'; src: local('Vazirmatn'), url('/fonts/Vazirmatn-Regular.woff2') format('woff2'); font-weight: 400; font-display: swap; }
    @font-face { font-family: 'Vazirmatn'; src: local('Vazirmatn'), url('/fonts/Vazirmatn-Bold.woff2') format('woff2'); font-weight: 700; font-display: swap; }
    @page { size: ${cust.printPaperSize || 'A4'}; margin: ${cust.printMarginTop || 15}mm ${cust.printMarginRight || 15}mm ${cust.printMarginBottom || 15}mm ${cust.printMarginLeft || 15}mm; }
    @media print { body { margin: 0; } }
    * { box-sizing: border-box; }
    body { font-family: ${fontStack}; font-size: ${cust.printFontSize || '10.5pt'}; line-height: ${cust.printLineSpacing || '1.6'}; direction: rtl; color: #1f2937; background: #fff; padding: 4px; margin: 0; }
    .app-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-bottom: 10px; border-bottom: 2px solid ${primaryColor}; }
    .brand-logo { flex: 0 0 auto; }
    .brand-logo img { max-height: 62px; max-width: 180px; }
    .shop-center { flex: 1; text-align: center; }
    .shop-name { font-size: 17pt; font-weight: 800; color: ${primaryColor}; letter-spacing: .2px; }
    .shop-contact { font-size: 10pt; color: #6b7280; margin-top: 3px; }
    .shop-contact span { margin: 0 6px; }
    .header-fields { margin-top: 5px; font-size: 9.5pt; color: #6b7280; }
    .doc-title { text-align: center; font-size: 13.5pt; font-weight: 800; color: #111827; margin: 12px 0 10px; }
    .doc-title::after { content: ''; display: block; width: 90px; height: 3px; margin: 6px auto 0; border-radius: 2px; background: ${primaryColor}; }
    h2, h3 { color: #111827; margin: 14px 0 6px; }
    /* meta line produced by invoice callers */
    .header-info { display: flex; flex-wrap: wrap; align-items: center; background: #f4f7fb; border: 1px solid #e3e9f2; border-radius: 8px; padding: 7px 6px; margin-bottom: 12px; font-size: 9.5pt; color: #4b5563; }
    .header-info span { padding: 1px 10px; border-left: 1px solid #d7dde5; white-space: nowrap; }
    .header-info span:last-child { border-left: none; }
    /* tables */
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 4px 0 14px; }
    thead th { background: ${primaryColor}; color: #fff; font-weight: 700; font-size: 9.5pt; padding: 8px 9px; text-align: right; }
    thead th:first-child { border-top-right-radius: 6px; }
    thead th:last-child { border-top-left-radius: 6px; }
    tbody td { padding: 7px 9px; border-bottom: 1px solid #e9edf2; font-size: 10pt; vertical-align: top; }
    tbody tr:last-child td { border-bottom: 1px solid ${primaryColor}; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .total-row { font-weight: 700; background: #eef4ff; }
    /* invoice panels */
    .buyer-panel { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; padding: 9px 12px; background: #f4f7fb; border: 1px solid #e3e9f2; border-radius: 8px; }
    .lbl { display: block; font-size: 8.5pt; color: #6b7280; margin-bottom: 1px; }
    .buyer-name strong { font-size: 11pt; color: #111827; }
    .buyer-type .type { display: inline-block; margin-right: 6px; padding: 2px 14px; border-radius: 20px; font-size: 9.5pt; color: #9aa3af; border: 1px solid #d5dbe3; }
    .buyer-type .type.on { color: #fff; background: ${primaryColor}; border-color: ${primaryColor}; }
    .note-box { margin-top: 10px; }
    .description-box { border: 1px dashed #c3cbd4; border-radius: 6px; min-height: 56px; padding: 8px; font-size: 9.5pt; color: #6b7280; }
    .signature-row { display: flex; justify-content: space-between; gap: 16px; margin-top: 26px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
    .signature-box { text-align: center; width: 45%; }
    .signature-line { border-top: 1px solid #334155; margin-top: 30px; padding-top: 4px; font-size: 9pt; color: #6b7280; }
    .signature-img { max-width: 120px; max-height: 50px; display: block; margin: 0 auto 4px; }
    .qr { text-align: center; margin-top: 14px; }
    .qr img { width: 78px; height: 78px; }
    .qr-data { font-size: 7.5pt; color: #9aa3af; margin-top: 2px; }
    .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 9pt; color: #6b7280; }
    ${cust.printTableStyle === 'clean'
      ? 'table thead th { background: transparent; color: ' + primaryColor + '; border-bottom: 2px solid ' + primaryColor + '; border-radius: 0; } tbody tr:nth-child(even) td, tbody td { border-bottom: 1px solid #eef1f5; }'
      : ''}
    ${borderCSS}
    ${watermarkStyle}
  </style>
</head>
<body>
  <div class="app-header">
    ${logoHtml}
    <div class="shop-center">
      <div class="shop-name">${name}</div>
      <div class="shop-contact">
        ${phone ? `<span>تلفن: ${phone}</span>` : ''}
        ${cachedShopAddress ? `<span>${cachedShopAddress}</span>` : ''}
      </div>
      ${headerFields ? `<div class="header-fields">${headerFields}</div>` : ''}
    </div>
  </div>
  <div class="doc-title">${title}</div>
  ${taxInfo}
  ${html}
  ${invoiceSection}
  ${qrHtml}
  <div class="footer">${footerText}</div>
</body>
</html>`

  win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
${bodyShell}`)
  win.document.close()
  win.print()
}

/**
 * Downloads a real Excel (.xlsx) file using the xlsx library.
 * @param filename - Output filename (should end with .xlsx)
 * @param sheetName - Name of the worksheet
 * @param headers - Column headers array
 * @param rows - Data rows array
 */
export async function downloadExcel(filename: string, headers: string[], rows: any[][], sheetName = 'Sheet1'): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  // Ensure filename ends with .xlsx
  const safeFilename = filename.endsWith('.xlsx') ? filename : filename.replace(/\.\w+$/, '') + '.xlsx'
  XLSX.writeFile(wb, safeFilename)
}

/**
 * Downloads a CSV file with BOM for Farsi/Excel compatibility.
 * Kept as fallback for simple text exports.
 */
export function downloadCSV(filename: string, headers: string[], rows: any[][]): void {
  const BOM = '\uFEFF'
  let csv = BOM + headers.join(',') + '\n'
  for (const row of rows) {
    csv += row.map(cell => {
      const val = String(cell ?? '')
      return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val.replace(/"/g, '""')}"` : val
    }).join(',') + '\n'
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
