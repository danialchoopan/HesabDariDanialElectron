import { getDatabase } from '../connection'
import { app } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'

export const DEFAULT_PRINT_SETTINGS: Record<string, string> = {
  printInvoiceTitle: 'فاکتور فروش',
  printReprintTitle: 'چاپ دوباره فاکتور',
  printReportTitle: 'گزارش',
  printFooter: '',
  printColorScheme: '#006194',
  printShowSignature: 'true',
  printShowTax: 'true',
  printLogo: '',
  printSignature: '',
  printWatermark: '',
  printFontSize: '11pt',
  printHeaderSize: '18pt',
  printLineSpacing: '1.5',
  printMarginTop: '15',
  printMarginBottom: '15',
  printMarginLeft: '15',
  printMarginRight: '15',
  printPaperSize: 'A4',
  printHeaderField1: '',
  printHeaderField2: '',
  printHeaderField3: '',
  printBorderStyle: 'none',
  printHeaderAlign: 'center',
  printFontFamily: 'Vazirmatn',
  // A4 invoice extras
  printTableStyle: 'bordered',          // 'bordered' | 'clean'
  printShowInvoiceQr: 'false',          // embed a QR code on the invoice
  // Thermal receipt extras
  printReceiptWidth: '80mm',            // '58mm' | '80mm'
  printReceiptShowChange: 'true',
  printReceiptShowCustomer: 'true',
  printReceiptHeaderExtra: '',
  printActiveTemplate: 'default',
}

export function getPrintSettings(): Record<string, string> {
  const db = getDatabase()
  const result: Record<string, string> = { ...DEFAULT_PRINT_SETTINGS }
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'print%'").all() as { key: string; value: string }[]
  for (const row of rows) {
    if (row.key in result) result[row.key] = row.value
  }
  return result
}

export function savePrintSettings(settings: Record<string, string>): void {
  const db = getDatabase()
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith('print')) upsert.run(key, value)
  }
}

export function resetPrintSettings(): void {
  const db = getDatabase()
  db.prepare("DELETE FROM settings WHERE key LIKE 'print%'").run()
}

export function savePrintAsset(assetType: string, base64: string): { filename: string; path: string } {
  const dir = join(app.getPath('userData'), 'print-assets')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const ext = base64.startsWith('data:image/png') ? '.png' : '.jpg'
  const filename = `${assetType}-${Date.now()}${ext}`
  const filePath = join(dir, filename)
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '')
  writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
  return { filename, path: filePath }
}

export function getPrintAsset(filename: string): string | null {
  const dir = join(app.getPath('userData'), 'print-assets')
  const filePath = join(dir, filename)
  if (!existsSync(filePath)) return null
  const data = readFileSync(filePath)
  const ext = filename.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${ext};base64,${data.toString('base64')}`
}
