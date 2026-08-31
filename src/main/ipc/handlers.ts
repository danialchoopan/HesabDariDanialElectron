/**
 * IPC Handlers — bridges Electron main process with renderer (UI).
 *
 * All IPC channels are registered here via ipcMain.handle(). Each handler
 * wraps a repository function call with try/catch, returning IPCResponse<T>.
 *
 * Channel groups:
 *   - auth:          User authentication (login, CRUD, PIN management)
 *   - products:      Product CRUD, stock operations, bulk import, image storage
 *   - sales:         Sale creation (atomic), date-range queries, analytics
 *   - customers:     Customer CRUD, ledger operations, charge/pay
 *   - suppliers:     Supplier CRUD, purchase management, payments
 *   - expenses:      Expense CRUD with journal posting
 *   - returns:       Product returns with stock restoration
 *   - accounts:      Chart of accounts CRUD, tree structure
 *   - journal:       Double-entry journal entries, trial balance, ledger
 *   - reports:       P&L, balance sheet, AR aging, cash flow
 *   - categories:    Hierarchical category management (parent/child)
 *   - backup:        Backup creation, restore, integrity, export (SQLite/JSON)
 *   - smartExport:   Selective data export with encryption and signatures
 *   - migration:     Version detection, compatibility checks, data migration
 *   - inventory:     Stock adjustments with audit trail
 *   - settings:      Key-value settings store
 *   - dialog:        Native OS file dialogs (save/open)
 *
 * Two helper wrappers: handle(channel, fn) and handleArg<T>(channel, fn)
 * provide standardized error handling and type-safe IPCResponse returns.
 */

import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import type { ProductInput, SaleInput, CustomerInput, ExpenseInput } from '../../types'
import * as products from '../database/repositories/products'
import * as sales from '../database/repositories/sales'
import * as auth from '../database/repositories/auth'
import * as suspend from '../database/repositories/suspend'
import * as settingsRepo from '../database/repositories/settings'
import * as printSettings from '../database/repositories/printSettings'
import * as customers from '../database/repositories/customers'
import * as expenses from '../database/repositories/expenses'
import * as cashRegister from '../database/repositories/cashRegister'
import * as categoriesRepo from '../database/repositories/categories'
import * as auditRepo from '../database/repositories/audit'
import * as returnsRepo from '../database/repositories/returns'
import * as accountsRepo from '../database/repositories/accounts'
import * as journalRepo from '../database/repositories/journal'
import * as periodsRepo from '../database/repositories/periods'
import * as reportsRepo from '../database/repositories/reports'
import * as inventoryAdjRepo from '../database/repositories/inventoryAdjustments'
import * as seedRepo from '../database/repositories/seed'
import * as suppliersRepo from '../database/repositories/suppliers'
import * as purchasesRepo from '../database/repositories/purchases'
import * as priceHistoryRepo from '../database/repositories/priceHistory'
import * as salesReports from '../database/repositories/salesReports'
import * as customerAnalytics from '../database/repositories/customerAnalytics'
import * as crossSellRules from '../database/repositories/crossSellRules'
import * as installmentsRepo from '../database/repositories/installments'
import * as proformasRepo from '../database/repositories/proformas'
import * as serviceTicketsRepo from '../database/repositories/serviceTickets'
import * as customerCreditRepo from '../database/repositories/customerCredit'
import * as restorePointsRepo from '../database/repositories/restorePoints'
import * as schemaMigration from '../database/schemaMigration'
import * as backupService from '../database/backup'
import * as smartExportService from '../database/smartExport'
import * as migrationService from '../database/migration'
import { runBackupTests } from '../database/backup.test'
import { runSmartExportTests } from '../database/smartExport.test'
import { runMigrationTests } from '../database/migration.test'
import { isFirstRun, getDatabase, closeDatabase } from '../database/connection'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { app } from 'electron'

function handle<T>(channel: string, fn: () => T): void {
  ipcMain.handle(channel, (_event) => {
    try { return { success: true, data: fn() } }
    catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
}

function handleArg<TArg, TResult>(channel: string, fn: (arg: TArg) => TResult): void {
  ipcMain.handle(channel, (_event, arg: TArg) => {
    try { return { success: true, data: fn(arg) } }
    catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
}

export function registerAllHandlers(): void {
  // ─── System ─────────────────────────────────────────────
  handle('system:isFirstRun', () => ({ isFirstRun: isFirstRun() }))

  // ─── Update Check ──────────────────────────────────────
  // NOTE: keep this repo owner/name in sync with the project's GitHub home.
  const UPDATE_REPO = 'danialchoopan/HesabDariDanialElectron'
  ipcMain.handle('system:checkUpdate', async () => {
    try {
      const currentVersion = app.getVersion()
      let res: Response
      try {
        res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { signal: AbortSignal.timeout(10000) })
      } catch (e) {
        return { success: false, error: 'اتصال به سرور برقرار نشد' }
      }
      if (res.status === 404) return { success: false, error: 'نسخه‌ای در GitHub یافت نشد' }
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const release = await res.json()
      const latestVersion = String(release.tag_name || '').replace(/^v/i, '').trim()
      // Numeric semver comparison — "different string" is NOT the same as "newer".
      const hasUpdate = latestVersion !== '' && schemaMigration.compareVersions(latestVersion, currentVersion) > 0
      return {
        success: true,
        data: {
          currentVersion,
          latestVersion,
          hasUpdate,
          downloadUrl: release.html_url || '',
          releaseName: release.name || latestVersion,
          releaseDate: release.published_at || '',
          body: release.body || '',
        },
      }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })

  ipcMain.handle('system:getVersion', () => {
    return { success: true, data: app.getVersion() }
  })

  // ─── Auth ───────────────────────────────────────────────
  handleArg<{ pinCode: string }, ReturnType<typeof auth.login>>('auth:login', (a) => auth.login(a.pinCode))
  handle('auth:listUsers', () => auth.getAllUsers())
  handleArg<{ name: string; pinCode: string; role: string }, ReturnType<typeof auth.createUser>>('auth:createUser', (a) => auth.createUser(a.name, a.pinCode, a.role))
  handleArg<{ id: number }, boolean>('auth:deleteUser', (a) => auth.deleteUser(a.id))
  handleArg<{ id: number; newPin: string }, boolean>('auth:changePin', (a) => auth.changePin(a.id, a.newPin))
  handleArg<{ id: number; name?: string; pinCode?: string; role?: string; permissions?: string }, boolean>('auth:updateUser', (a) => auth.updateUser(a.id, { name: a.name, pinCode: a.pinCode, role: a.role, permissions: a.permissions }))

  // ─── Products ───────────────────────────────────────────
  handle('products:getAll', () => products.getAllProducts())
  handleArg<{ id: number }, ReturnType<typeof products.getProductById>>('products:getById', (a) => products.getProductById(a.id))
  handleArg<{ barcode: string }, ReturnType<typeof products.getProductByBarcode>>('products:getByBarcode', (a) => products.getProductByBarcode(a.barcode))
  handleArg<{ query: string }, ReturnType<typeof products.searchProducts>>('products:search', (a) => products.searchProducts(a.query))
  ipcMain.handle('products:create', (_event, a: ProductInput) => {
    try {
      if (!a.barcode || a.barcode.trim() === '') {
        const db = getDatabase()
        const row = db.prepare("SELECT barcode FROM products WHERE barcode LIKE 'PRD-%' ORDER BY CAST(SUBSTR(barcode, 5) AS INTEGER) DESC LIMIT 1").get() as { barcode: string } | undefined
        const lastNum = row ? parseInt(row.barcode.replace('PRD-', '')) : 0
        a.barcode = `PRD-${String(lastNum + 1).padStart(6, '0')}`
      }
      const result = products.createProduct(a)
      if (a.imageBase64 && a.imageBase64.startsWith('data:image')) {
        try {
          const imagesDir = join(app.getPath('userData'), 'product-images')
          if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true })
          const ext = a.imageBase64.startsWith('data:image/png') ? '.png' : '.jpg'
          const filename = `product-${result.id}-${randomBytes(8).toString('hex')}${ext}`
          const base64Data = a.imageBase64.replace(/^data:image\/\w+;base64,/, '')
          writeFileSync(join(imagesDir, filename), Buffer.from(base64Data, 'base64'))
          products.updateProduct(result.id, { imageBase64: filename })
          result.imageBase64 = filename
        } catch {}
      }
      auditRepo.createAuditEntry(null, 'create', 'product', result.id, JSON.stringify({ title: a.title, barcode: a.barcode }))
      return { success: true, data: result }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('products:update', (_event, a: { id: number; data: Partial<ProductInput> }) => {
    try {
      if (a.data.imageBase64 && a.data.imageBase64.startsWith('data:image')) {
        try {
          const imagesDir = join(app.getPath('userData'), 'product-images')
          if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true })
          const ext = a.data.imageBase64.startsWith('data:image/png') ? '.png' : '.jpg'
          const filename = `product-${a.id}-${randomBytes(8).toString('hex')}${ext}`
          const base64Data = a.data.imageBase64.replace(/^data:image\/\w+;base64,/, '')
          writeFileSync(join(imagesDir, filename), Buffer.from(base64Data, 'base64'))
          a.data.imageBase64 = filename
        } catch {}
      }
      const result = products.updateProduct(a.id, a.data)
      auditRepo.createAuditEntry(null, 'update', 'product', a.id, JSON.stringify({ fields: Object.keys(a.data) }))
      return { success: true, data: result }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('products:delete', (_event, a: { id: number }) => {
    try {
      const result = products.deleteProduct(a.id)
      auditRepo.createAuditEntry(null, 'delete', 'product', a.id)
      return { success: true, data: result }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('products:updateStock', (_event, a: { productId: number; quantityChange: number; reason?: string }) => {
    try {
      const result = products.updateStock(a.productId, a.quantityChange)
      auditRepo.createAuditEntry(null, 'restock', 'product', a.productId, JSON.stringify({ quantityChange: a.quantityChange, reason: a.reason || '' }))
      return { success: true, data: result }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  handle('products:lowStock', () => products.getLowStockProducts())
  handle('products:loose', () => products.getLooseProducts())
  handle('products:getSellable', () => products.getSellableProducts())
  ipcMain.handle('products:saveImage', (_event, arg: { base64: string; productId: number }) => {
    try {
      const imagesDir = join(app.getPath('userData'), 'product-images')
      if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true })
      const ext = arg.base64.startsWith('data:image/png') ? '.png' : '.jpg'
      const filename = `product-${arg.productId}-${randomBytes(8).toString('hex')}${ext}`
      const base64Data = arg.base64.replace(/^data:image\/\w+;base64,/, '')
      const filePath = join(imagesDir, filename)
      writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
      return { success: true, data: filename }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('products:getImage', (_event, arg: { filename: string }) => {
    try {
      const filePath = join(app.getPath('userData'), 'product-images', arg.filename)
      if (!existsSync(filePath)) return { success: false, error: 'File not found' }
      const data = readFileSync(filePath)
      const ext = arg.filename.endsWith('.png') ? 'image/png' : 'image/jpeg'
      const base64 = `data:${ext};base64,${data.toString('base64')}`
      return { success: true, data: base64 }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  handle('products:categories', () => products.getProductCategories())
  ipcMain.handle('products:reportData', () => {
    try {
      const db = getDatabase()
      const byCategory = db.prepare(`
        SELECT COALESCE(NULLIF(category, ''), 'بدون دسته') as category, COUNT(*) as count,
               SUM(stock) as totalStock,
               SUM(stock * purchase_price) as totalValue,
               SUM(stock * sale_price) as retailValue
        FROM products WHERE isActive = 1
        GROUP BY category ORDER BY totalValue DESC
      `).all()
      const slowMoving = db.prepare(`
        SELECT p.id, p.title, p.stock, p.purchase_price, p.category,
               MAX(s.createdAt) as lastSoldAt
        FROM products p
        LEFT JOIN sale_items si ON si.productId = p.id
        LEFT JOIN sales s ON s.id = si.saleId
        WHERE p.isActive = 1 AND p.stock > 0
        GROUP BY p.id
        HAVING lastSoldAt IS NULL OR julianday('now') - julianday(lastSoldAt) > 30
        ORDER BY (julianday('now') - julianday(lastSoldAt)) DESC
      `).all()
      return { success: true, data: { byCategory, slowMoving } }
    } catch (err) {
      console.error('[REPORT ERROR]', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('products:bulkImport', (_event, arg: { products: ProductInput[] }) => {
    try {
      const db = getDatabase()
      const results: { title: string; success: boolean; error?: string }[] = []
      const importTx = db.transaction(() => {
        for (const p of arg.products) {
          try {
            if (!p.title) { results.push({ title: p.title || 'بدون نام', success: false, error: 'نام کالا الزامی است' }); continue }
            if (!p.barcode || p.barcode.trim() === '') {
              const row = db.prepare("SELECT barcode FROM products WHERE barcode LIKE 'PRD-%' ORDER BY CAST(SUBSTR(barcode, 5) AS INTEGER) DESC LIMIT 1").get() as { barcode: string } | undefined
              const lastNum = row ? parseInt(row.barcode.replace('PRD-', '')) : 0
              p.barcode = `PRD-${String(lastNum + 1).padStart(6, '0')}`
            }
            const existing = db.prepare('SELECT id FROM products WHERE barcode = ?').get(p.barcode) as { id: number } | undefined
            if (existing) {
              db.prepare('UPDATE products SET title=?, category=?, unit=?, purchase_price=?, sale_price=?, stock=?, minStock=?, isLoose=? WHERE id=?').run(
                p.title, p.category || '', p.unit || 'number', p.purchase_price, p.sale_price, p.stock, p.minStock || 0, p.isLoose ? 1 : 0, existing.id
              )
              results.push({ title: p.title, success: true })
            } else {
              db.prepare('INSERT INTO products (barcode, title, category, unit, purchase_price, sale_price, stock, minStock, isActive) VALUES (?,?,?,?,?,?,?,?,1)').run(
                p.barcode, p.title, p.category || '', p.unit || 'number', p.purchase_price, p.sale_price, p.stock, p.minStock || 0
              )
              results.push({ title: p.title, success: true })
            }
          } catch (err) {
            results.push({ title: p.title || '?', success: false, error: err instanceof Error ? err.message : String(err) })
          }
        }
      })
      importTx()
      const successCount = results.filter(r => r.success).length
      return { success: true, data: { results, successCount, failCount: results.length - successCount } }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })

  // ─── Expiry Alerts ─────────────────────────────────────
  handleArg<{ withinDays?: number }, any[]>('products:expiring', (a) => products.getExpiringProducts(a.withinDays ?? 30))
  ipcMain.handle('products:markAlerted', (_event, a: { id: number }) => {
    products.markAlerted(a.id)
    return { success: true }
  })
  handle('products:resetAlerts', () => { products.resetAlerts(); return { success: true } })

  // ─── Product Profit Report ──────────────────────────────
  handleArg<{ startDate?: string; endDate?: string }, any[]>('products:profitReport', (a) => products.getProductProfitReport(a.startDate, a.endDate))

  // ─── Sales ──────────────────────────────────────────────
  ipcMain.handle('sales:create', (_event, a: SaleInput) => {
    try {
      const result = sales.createSale(a)
      const total = a.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
      auditRepo.createAuditEntry(null, 'create', 'sale', result.id, JSON.stringify({ total }))
      return { success: true, data: result }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  handleArg<{ id: number }, ReturnType<typeof sales.getSaleById>>('sales:getById', (a) => sales.getSaleById(a.id))
  handleArg<{ startDate: string; endDate: string }, ReturnType<typeof sales.getSalesByDateRange>>('sales:getByDateRange', (a) => sales.getSalesByDateRange(a.startDate, a.endDate))
  handleArg<{ date: string }, ReturnType<typeof sales.getDailySalesSummary>>('sales:dailySummary', (a) => sales.getDailySalesSummary(a.date))
  handleArg<{ startDate?: string; endDate?: string }, ReturnType<typeof sales.getUserPerformance>>('sales:userPerformance', (a) => sales.getUserPerformance(a.startDate, a.endDate))
  handleArg<{ startDate?: string; endDate?: string }, ReturnType<typeof sales.getTopProducts>>('sales:topProducts', (a) => sales.getTopProducts(a.startDate, a.endDate))

  // ─── Customers / Ledger ─────────────────────────────────
  handle('customers:getAll', () => customers.getAllCustomers())
  handleArg<{ id: number }, ReturnType<typeof customers.getCustomerById>>('customers:getById', (a) => customers.getCustomerById(a.id))
  handleArg<{ query: string }, ReturnType<typeof customers.searchCustomers>>('customers:search', (a) => customers.searchCustomers(a.query))
  handleArg<CustomerInput, ReturnType<typeof customers.createCustomer>>('customers:create', (a) => customers.createCustomer(a))
  handleArg<{ id: number; data: Partial<CustomerInput> }, ReturnType<typeof customers.updateCustomer>>('customers:update', (a) => customers.updateCustomer(a.id, a.data))
  handleArg<{ id: number }, any>('customers:delete', (a) => customers.deleteCustomerSoft(a.id))
  handle('customers:stats', () => customers.getCustomerStats())
  handleArg<{ id: number }, any>('customers:getWithStats', (a) => customers.getCustomerWithStats(a.id))
  handleArg<{ id: number }, any>('customers:purchaseHistory', (a) => customers.getCustomerPurchaseHistory(a.id))
  handle('customers:getAllWithStats', () => customers.getAllCustomersWithStats())
  handleArg<{ id: number }, any>('customers:deleteSoft', (a) => customers.deleteCustomerSoft(a.id))
  handleArg<{ entryId: number }, any>('customers:deleteLedgerEntry', (a) => customers.deleteLedgerEntry(a.entryId))
  ipcMain.handle('customers:charge', (_event, a: { customerId: number; amount: number; description?: string; images?: string[] }) => {
    if (!a.amount || a.amount === 0) return { success: false, error: 'مبلغ نمی‌تواند صفر باشد' }
    customers.updateCustomerBalance(a.customerId, a.amount)
    customers.addLedgerEntry(a.customerId, null, 'charge', a.amount, a.description || 'شارژ حساب', a.images)
    auditRepo.createAuditEntry(null, 'create', 'customer', a.customerId, JSON.stringify({ type: 'charge', amount: a.amount }))
    return true
  })
  ipcMain.handle('customers:pay', (_event, a: { customerId: number; amount: number; description?: string; images?: string[] }) => {
    if (!a.amount || a.amount <= 0) return { success: false, error: 'مبلغ باید مثبت باشد' }
    customers.updateCustomerBalance(a.customerId, a.amount)
    customers.addLedgerEntry(a.customerId, null, 'payment', a.amount, a.description || 'پرداخت بدهی', a.images)
    auditRepo.createAuditEntry(null, 'create', 'customer', a.customerId, JSON.stringify({ type: 'payment', amount: a.amount }))
    return true
  })
  handleArg<{ customerId: number }, ReturnType<typeof customers.getLedgerEntries>>('customers:ledger', (a) => customers.getLedgerEntries(a.customerId))

  ipcMain.handle('customers:saveImage', (_event, arg: { base64: string; customerId: number }) => {
    try {
      const imagesDir = join(app.getPath('userData'), 'customer-images')
      if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true })
      const ext = arg.base64.startsWith('data:image/png') ? '.png' : '.jpg'
      const filename = `customer-${arg.customerId}-${randomBytes(8).toString('hex')}${ext}`
      const base64Data = arg.base64.replace(/^data:image\/\w+;base64,/, '')
      writeFileSync(join(imagesDir, filename), Buffer.from(base64Data, 'base64'))
      return { success: true, data: filename }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })

  // ─── Expenses ───────────────────────────────────────────
  handle('expenses:getAll', () => expenses.getAllExpenses())
  handleArg<{ startDate: string; endDate: string }, ReturnType<typeof expenses.getExpensesByDateRange>>('expenses:getByDateRange', (a) => expenses.getExpensesByDateRange(a.startDate, a.endDate))
  ipcMain.handle('expenses:create', (_event, a: ExpenseInput) => {
    try {
      const result = expenses.createExpense(a)
      auditRepo.createAuditEntry(null, 'create', 'expense', result.id, JSON.stringify({ category: a.category, amount: a.amount }))
      return { success: true, data: result }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('expenses:delete', (_event, a: { id: number }) => {
    try {
      const result = expenses.deleteExpense(a.id)
      auditRepo.createAuditEntry(null, 'delete', 'expense', a.id)
      return { success: true, data: result }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  handle('expenses:categories', () => expenses.getExpenseCategories())
  handleArg<{ startDate?: string; endDate?: string }, number>('expenses:total', (a) => expenses.getTotalExpenses(a.startDate, a.endDate))

  ipcMain.handle('expenses:saveImage', (_event, arg: { base64: string; expenseId: number }) => {
    try {
      const imagesDir = join(app.getPath('userData'), 'expense-images')
      if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true })
      const ext = arg.base64.startsWith('data:image/png') ? '.png' : '.jpg'
      const filename = `expense-${arg.expenseId}-${randomBytes(8).toString('hex')}${ext}`
      const base64Data = arg.base64.replace(/^data:image\/\w+;base64,/, '')
      const filePath = join(imagesDir, filename)
      writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
      return { success: true, data: filename }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })

  // ─── Cash Register ──────────────────────────────────────
  handle('cashRegister:getToday', () => cashRegister.getTodayRegister())
  handleArg<{ amount: number }, void>('cashRegister:setOpening', (a) => cashRegister.setOpeningBalance(a.amount))
  handleArg<{ userId: number; closingBalance: number }, ReturnType<typeof cashRegister.closeRegister>>('cashRegister:close', (a) => cashRegister.closeRegister(a.userId, a.closingBalance))

  // ─── Suspended ──────────────────────────────────────────
  handleArg<{ userId: number; slotIndex: number; items: any[] }, ReturnType<typeof suspend.saveSuspended>>('suspend:save', (a) => suspend.saveSuspended(a.userId, a.slotIndex, a.items))
  handleArg<{ userId?: number }, ReturnType<typeof suspend.listSuspended>>('suspend:list', (a) => suspend.listSuspended(a.userId))
  handleArg<{ id: number }, ReturnType<typeof suspend.loadSuspended> | undefined>('suspend:load', (a) => suspend.loadSuspended(a.id))
  handleArg<{ id: number }, boolean>('suspend:delete', (a) => suspend.deleteSuspended(a.id))

  // ─── Settings ───────────────────────────────────────────
  handle('settings:getAll', () => settingsRepo.getAllSettings())
  handleArg<{ key: string }, string | null>('settings:get', (a) => settingsRepo.getSetting(a.key) || null)
  handleArg<{ key: string; value: string }, void>('settings:set', (a) => settingsRepo.setSetting(a.key, a.value))

  // ─── Print Settings ─────────────────────────────────────
  handle('printSettings:getAll', () => printSettings.getPrintSettings())
  handleArg<{ settings: Record<string, string> }, boolean>('printSettings:save', (a) => { printSettings.savePrintSettings(a.settings); return true })
  handle('printSettings:reset', () => { printSettings.resetPrintSettings(); return true })
  handleArg<{ type: string; base64: string }, { filename: string; path: string }>('printSettings:uploadAsset', (a) => printSettings.savePrintAsset(a.type, a.base64))
  handleArg<{ filename: string }, string | null>('printSettings:getAsset', (a) => printSettings.getPrintAsset(a.filename))

  // ─── Backup/Restore ─────────────────────────────────────
  ipcMain.handle('backup:export', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'ذخیره فایل پشتیبان',
      defaultPath: `pos-backup-${new Date().toISOString().split('T')[0]}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, error: 'cancelled' }
    try {
      // Checkpoint WAL + copy a fully consistent snapshot (raw copy can lose WAL frames)
      backupService.copyDatabaseTo(result.filePath)
      const hash = require('crypto').createHash('sha256').update(require('fs').readFileSync(result.filePath)).digest('hex')
      return { success: true, data: result.filePath, hash }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('backup:import', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'انتخاب فایل پشتیبان',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, error: 'cancelled' }
    // Use the full safe-restore path (integrity → pre-backup → close → copy →
    // clear WAL/SHM → reopen → migrate → validate) instead of overwriting an open DB.
    return backupService.restoreBackup(result.filePaths[0])
  })

  ipcMain.handle('backup:create', () => { try { return { success: true, data: backupService.createBackup() } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('backup:saveAs', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showSaveDialog(win!, {
        title: 'ذخیره نسخه پشتیبان',
        defaultPath: `hesabdari-backup-${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      })
      if (result.canceled || !result.filePath) return { success: false, error: 'cancelled' }
      backupService.copyDatabaseTo(result.filePath)
      return { success: true, data: result.filePath }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('backup:openFolder', () => {
    try {
      const dir = join(app.getPath('userData'), 'backups')
      shell.openPath(dir)
      return { success: true }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('backup:delete', (_event, arg: { name: string }) => {
    try {
      const { unlinkSync, existsSync } = require('fs')
      const { join } = require('path')
      const { app } = require('electron')
      const dir = join(app.getPath('userData'), 'backups')
      for (const f of ['db', 'db-wal', 'db-shm', 'meta.json']) {
        const file = join(dir, `${arg.name}.${f}`)
        if (existsSync(file)) unlinkSync(file)
      }
      return { success: true }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('backup:auto', () => { try { return { success: true, data: backupService.autoBackup() } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('backup:list', () => { try { return { success: true, data: backupService.listBackups() } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('backup:stats', () => { try { return { success: true, data: backupService.getBackupStats() } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('backup:integrity', (_event, arg: { path?: string }) => { try { return { success: true, data: backupService.checkIntegrity(arg?.path) } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('backup:verify', (_event, arg: { path: string }) => { try { return { success: true, data: backupService.verifyBackup(arg.path) } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('backup:restore', (_event, arg: { path: string }) => { try { return { success: true, data: backupService.restoreBackup(arg.path) } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('backup:cleanup', (_event, arg: { keepCount?: number }) => { try { return { success: true, data: backupService.cleanupBackups(arg?.keepCount || 30) } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  handleArg<{ path: string }, any>('backup:details', (a) => backupService.getBackupDetails(a.path))
  handleArg<{ path: string }, any>('backup:checkVersion', (a) => backupService.checkBackupVersion(a.path))
  handleArg<{ path: string }, any>('backup:tableStats', (a) => backupService.getTableStats(a.path))
  handle('backup:runTests', () => {
    return runBackupTests()
  })

  // ─── Enhanced Backup ─────────────────────────────────
  handle('backup:getSelectableTables', () => backupService.getSelectableTables())
  ipcMain.handle('backup:createWithOptions', (_event, a: { format: string; scope: string; tables?: string[]; filePath?: string; label?: string }) => {
    try {
      if (a.format === 'json') {
        let json: string
        if (a.scope === 'structure') {
          json = backupService.exportStructure()
        } else if (a.scope === 'selective' && a.tables) {
          json = backupService.exportSelectiveJson(a.tables)
        } else {
          json = backupService.exportAsJson()
        }
        if (a.filePath) {
          writeFileSync(a.filePath, json, 'utf-8')
          return { success: true, data: a.filePath }
        }
        const outPath = join(app.getPath('userData'), `backup-${Date.now()}.json`)
        writeFileSync(outPath, json, 'utf-8')
        return { success: true, data: outPath }
      } else {
        if (a.filePath) {
          backupService.copyDatabaseTo(a.filePath)
          return { success: true, data: a.filePath }
        }
        return { success: true, data: backupService.createBackup(a.label) }
      }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })

  // ─── Database Reset ────────────────────────────────
  ipcMain.handle('database:reset', async () => {
    try {
      closeDatabase()
      const fs = require('fs')
      const dbPath = join(app.getPath('userData'), 'pos.db')
      for (const suffix of ['', '-wal', '-shm']) {
        const p = dbPath + suffix
        if (fs.existsSync(p)) fs.unlinkSync(p)
      }
      return { success: true }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })

  handle('smartExport:runTests', () => {
    return runSmartExportTests()
  })

  handle('migration:runTests', () => {
    return runMigrationTests()
  })

  // ─── Sales Reports ──────────────────────────────────────
  handleArg<{ startDate?: string; endDate?: string; category?: string; limit?: number }, any[]>('reports:bestSelling', (a) => salesReports.getBestSellingProducts(a.startDate, a.endDate, a.category, a.limit))
  handleArg<{ startDate?: string; endDate?: string }, any[]>('reports:salesByHour', (a) => salesReports.getSalesByHour(a.startDate, a.endDate))
  handleArg<{ startDate?: string; endDate?: string }, any[]>('reports:salesByDayOfWeek', (a) => salesReports.getSalesByDayOfWeek(a.startDate, a.endDate))
  handleArg<{ currentStart: string; currentEnd: string; previousStart: string; previousEnd: string }, any>('reports:periodComparison', (a) => salesReports.getPeriodComparison(a.currentStart, a.currentEnd, a.previousStart, a.previousEnd))

  // ─── Customer Analytics ─────────────────────────────────
  handleArg<{ limit?: number }, any[]>('reports:bestCustomers', (a) => customerAnalytics.getBestCustomers(a.limit))
  handleArg<{ startDate?: string; endDate?: string }, any[]>('reports:categoryProfitMargin', (a) => customerAnalytics.getCategoryProfitMargin(a.startDate, a.endDate))
  handle('reports:customerPatterns', () => customerAnalytics.getCustomerPatterns())

  // ─── Cross-Sell Rules ───────────────────────────────────
  handle('crossSell:getAll', () => crossSellRules.getAllRules())
  handleArg<{ id: number }, any>('crossSell:getById', (a) => crossSellRules.getRuleById(a.id))
  ipcMain.handle('crossSell:create', (_event, a: any) => { try { return { success: true, data: crossSellRules.createRule(a) } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('crossSell:update', (_event, a: { id: number; data: any }) => ({ success: crossSellRules.updateRule(a.id, a.data) }))
  ipcMain.handle('crossSell:delete', (_event, a: { id: number }) => ({ success: crossSellRules.deleteRule(a.id) }))
  ipcMain.handle('crossSell:addItem', (_event, a: { ruleId: number; productId: number; quantity?: number; discountPercent?: number }) => { try { return { success: true, data: crossSellRules.addRuleItem(a.ruleId, a.productId, a.quantity, a.discountPercent) } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('crossSell:removeItem', (_event, a: { id: number }) => ({ success: crossSellRules.removeRuleItem(a.id) }))
  ipcMain.handle('crossSell:evaluate', (_event, a: { cartProductIds: number[]; cartTotal: number; cartCategories: string[] }) => ({ success: true, data: crossSellRules.evaluateRules(a.cartProductIds, a.cartTotal, a.cartCategories) }))

  // ─── Installments ──────────────────────────────────────
  handle('installments:getAll', () => installmentsRepo.getAllInstallments())
  handleArg<{ id: number }, any>('installments:getById', (a) => installmentsRepo.getInstallmentById(a.id))
  ipcMain.handle('installments:create', (_event, a: any) => { try { return { success: true, data: installmentsRepo.createInstallment(a) } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('installments:pay', (_event, a: { installmentPaymentId: number; amount: number; notes?: string }) => ({ success: installmentsRepo.recordPayment(a.installmentPaymentId, a.amount, a.notes) }))
  handle('installments:updateOverdue', () => ({ success: true, count: installmentsRepo.updateOverdueInstallments() }))
  handle('installments:getOverdue', () => installmentsRepo.getOverduePayments())

  // ─── Proformas ─────────────────────────────────────────
  handleArg<{ status?: string }, any[]>('proformas:getAll', (a) => proformasRepo.getAllProformas(a.status))
  handleArg<{ id: number }, any>('proformas:getById', (a) => proformasRepo.getProformaById(a.id))
  ipcMain.handle('proformas:create', (_event, a: any) => { try { return { success: true, data: proformasRepo.createProforma(a) } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('proformas:updateStatus', (_event, a: { id: number; status: string }) => ({ success: proformasRepo.updateProformaStatus(a.id, a.status) }))
  ipcMain.handle('proformas:convertToSale', (_event, a: { proformaId: number; userId: number; paymentMethod?: string }) => proformasRepo.convertToSale(a.proformaId, a.userId, a.paymentMethod))
  handle('proformas:expire', () => ({ success: true, count: proformasRepo.expireProformas() }))
  ipcMain.handle('proformas:delete', (_event, a: { id: number }) => ({ success: proformasRepo.deleteProforma(a.id) }))

  // ─── Service Tickets ───────────────────────────────────
  handleArg<{ status?: string }, any[]>('service:getAll', (a) => serviceTicketsRepo.getAllTickets(a.status))
  handleArg<{ id: number }, any>('service:getById', (a) => serviceTicketsRepo.getTicketById(a.id))
  ipcMain.handle('service:create', (_event, a: any) => { try { return { success: true, data: serviceTicketsRepo.createTicket(a) } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('service:updateStatus', (_event, a: { id: number; status: string; note?: string; changedBy?: string }) => ({ success: serviceTicketsRepo.updateTicketStatus(a.id, a.status, a.note, a.changedBy) }))
  ipcMain.handle('service:update', (_event, a: { id: number; data: any }) => ({ success: serviceTicketsRepo.updateTicket(a.id, a.data) }))
  ipcMain.handle('service:addPart', (_event, a: any) => { try { return { success: true, data: serviceTicketsRepo.addPart(a.ticketId, a.partName, a.partNumber, a.quantity, a.unitCost) } } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } } })
  ipcMain.handle('service:removePart', (_event, a: { id: number }) => ({ success: serviceTicketsRepo.removePart(a.id) }))
  handle('service:getReport', () => serviceTicketsRepo.getServiceReport())

  // ─── Customer Credit ───────────────────────────────────
  handle('credit:getAll', () => customerCreditRepo.getAllCredits())
  handleArg<{ customerId: number }, any>('credit:getByCustomerId', (a) => customerCreditRepo.getCreditByCustomerId(a.customerId))
  ipcMain.handle('credit:setLimit', (_event, a: { customerId: number; limit: number; performedBy?: string }) => ({ success: customerCreditRepo.setCreditLimit(a.customerId, a.limit, a.performedBy) }))
  ipcMain.handle('credit:block', (_event, a: { customerId: number; blockType: string; reason: string; performedBy?: string }) => ({ success: customerCreditRepo.blockCustomer(a.customerId, a.blockType, a.reason, a.performedBy) }))
  ipcMain.handle('credit:unblock', (_event, a: { customerId: number; reason?: string; performedBy?: string }) => ({ success: customerCreditRepo.unblockCustomer(a.customerId, a.reason, a.performedBy) }))
  ipcMain.handle('credit:requestUnblock', (_event, a: { customerId: number; note: string }) => ({ success: customerCreditRepo.requestUnblock(a.customerId, a.note) }))
  ipcMain.handle('credit:check', (_event, a: { customerId: number; amount: number }) => customerCreditRepo.checkCredit(a.customerId, a.amount))
  handleArg<{ customerId: number }, any[]>('credit:getHistory', (a) => customerCreditRepo.getCreditHistory(a.customerId))
  handle('credit:getBlocked', () => customerCreditRepo.getBlockedCustomers())
  handle('credit:getUnblockRequests', () => customerCreditRepo.getUnblockRequests())
  ipcMain.handle('credit:recalculateScore', (_event, a: { customerId: number }) => ({ success: true, score: customerCreditRepo.recalculateScore(a.customerId) }))

  // ─── Restore Points ────────────────────────────────────
  ipcMain.handle('restorePoints:create', (_event, a: { name: string; description?: string; createdBy?: string }) => {
    try { return { success: true, data: restorePointsRepo.createRestorePoint(a.name, a.description, a.createdBy) } }
    catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  handle('restorePoints:list', () => restorePointsRepo.listRestorePoints())
  handleArg<{ id: number }, any>('restorePoints:getById', (a) => restorePointsRepo.getRestorePointById(a.id))
  ipcMain.handle('restorePoints:delete', (_event, a: { id: number }) => ({ success: restorePointsRepo.deleteRestorePoint(a.id) }))
  ipcMain.handle('restorePoints:verify', (_event, a: { id: number }) => restorePointsRepo.verifyRestorePoint(a.id))
  ipcMain.handle('restorePoints:restore', (_event, a: { id: number }) => restorePointsRepo.restoreRestorePoint(a.id))
  handleArg<{ keepCount?: number }, any>('restorePoints:cleanup', (a) => restorePointsRepo.cleanupRestorePoints(a.keepCount || 10))
  handle('restorePoints:stats', () => restorePointsRepo.getRestorePointStats())

  // ─── Schema Migration ─────────────────────────────────
  handle('schema:getVersion', () => ({ version: schemaMigration.getSchemaVersion() }))
  handle('schema:dryRun', () => schemaMigration.dryRunMigrations())
  handle('schema:run', () => schemaMigration.runMigrations())
  handle('schema:history', () => schemaMigration.getMigrationHistory())
  handle('schema:validate', () => schemaMigration.validateAfterMigration())

  // ─── Dialog ────────────────────────────────────────
  ipcMain.handle('dialog:saveBackup', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'ذخیره پشتیبان در',
      defaultPath: `hesabdari-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, error: 'cancelled' }
    try {
      backupService.copyDatabaseTo(result.filePath)
      return { success: true, data: result.filePath }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })

  ipcMain.handle('dialog:openBackup', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'انتخاب فایل پشتیبان',
      filters: [{ name: 'SQLite Database', extensions: ['db', 'db-wal'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, error: 'cancelled' }
    return { success: true, data: result.filePaths[0] }
  })

  ipcMain.handle('dialog:openSmartImport', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'انتخاب فایل واردات',
      filters: [{ name: 'Smart Export', extensions: ['hze', 'json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, error: 'cancelled' }
    return { success: true, data: result.filePaths[0] }
  })

  // ─── Categories ─────────────────────────────────────
  handle('categories:getAll', () => categoriesRepo.getAllCategories())
  handle('categories:getTree', () => categoriesRepo.getCategoryTree())
  handleArg<{ name: string; parentId?: number }, any>('categories:create', (a) => categoriesRepo.createCategory(a.name, a.parentId))
  handleArg<{ id: number; data: { name?: string; slug?: string; isActive?: boolean } }, boolean>('categories:update', (a) => categoriesRepo.updateCategory(a.id, a.data))
  handleArg<{ id: number }, any>('categories:delete', (a) => {
    const result = categoriesRepo.deleteCategory(a.id)
    return result
  })
  handleArg<{ id: number }, boolean>('categories:toggleActive', (a) => categoriesRepo.toggleCategoryActive(a.id))
  handleArg<{ id: number }, any>('categories:descendants', (a) => ({ ids: categoriesRepo.getCategoryDescendantIds(a.id) }))
  handleArg<{ parentId: number }, any[]>('categories:getSubcategories', (a) => categoriesRepo.getSubcategories(a.parentId))

  // ─── Brands ────────────────────────────────────────────
  ipcMain.handle('brands:getAll', () => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM brands WHERE isActive = 1 ORDER BY name').all()
  })
  ipcMain.handle('brands:create', (_event, a: { name: string; description?: string }) => {
    const db = getDatabase()
    const r = db.prepare('INSERT INTO brands (name, description) VALUES (?, ?)').run(a.name, a.description || '')
    return { id: r.lastInsertRowid, name: a.name }
  })
  ipcMain.handle('brands:update', (_event, a: { id: number; name?: string; description?: string }) => {
    const db = getDatabase()
    const updates: string[] = []
    const params: any[] = []
    if (a.name !== undefined) { updates.push('name = ?'); params.push(a.name) }
    if (a.description !== undefined) { updates.push('description = ?'); params.push(a.description) }
    if (updates.length === 0) return false
    params.push(a.id)
    db.prepare(`UPDATE brands SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    return true
  })
  ipcMain.handle('brands:delete', (_event, a: { id: number }) => {
    const db = getDatabase()
    db.prepare('UPDATE brands SET isActive = 0 WHERE id = ?').run(a.id)
    return true
  })

  // ─── Inventory Adjustments ─────────────────────────────
  ipcMain.handle('inventory:create', (_event, a: { productId: number; newStock: number; reason: string; adjustmentType: string; createdBy?: string; createdAt?: string }) => {
    try {
      const result = inventoryAdjRepo.createAdjustment(a)
      auditRepo.createAuditEntry(null, 'create', 'inventory_adjustment', result.id, JSON.stringify({ productId: a.productId, newStock: a.newStock, reason: a.reason }))
      return { success: true, data: result }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  handleArg<{ productId?: number; adjustmentType?: string; dateFrom?: string; dateTo?: string; limit?: number }, any[]>('inventory:getAll', (a) => inventoryAdjRepo.getAdjustments(a))
  handleArg<{ id: number }, any>('inventory:getById', (a) => inventoryAdjRepo.getAdjustmentById(a.id))

  // ─── Audit Log ─────────────────────────────────────
  handleArg<{ entityType?: string; action?: string; userId?: number; limit?: number; startDate?: string; endDate?: string }, any>('audit:getAll', (a) => auditRepo.getAuditLog({ entityType: a.entityType, action: a.action, userId: a.userId, limit: a.limit || 100, startDate: a.startDate, endDate: a.endDate }))
  handleArg<{ entityType: string; entityId: number }, any>('audit:getForEntity', (a) => auditRepo.getAuditForEntity(a.entityType, a.entityId))
  handle('audit:stats', () => auditRepo.getAuditStats())
  handleArg<{ retentionDays?: number }, any>('audit:cleanup', (a) => auditRepo.cleanupAuditLogs(a.retentionDays || 365))
  handleArg<{ limit?: number }, any[]>('audit:recent', (a) => auditRepo.getRecentActivity(a.limit || 20))

  // ─── Returns ─────────────────────────────────────
  ipcMain.handle('returns:create', (_event, a: { saleId: number; userId: number; productId: number; quantity: number; reason: string; refundAmount: number; isDamaged?: boolean }) => {
    try {
      const result = returnsRepo.createReturn(a.saleId, a.userId, a.productId, a.quantity, a.reason, a.refundAmount, a.isDamaged)
      auditRepo.createAuditEntry(a.userId, 'return', 'return', result.id, JSON.stringify({ saleId: a.saleId, productId: a.productId, quantity: a.quantity, refundAmount: a.refundAmount }))
      return { success: true, data: result }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  handleArg<{ limit?: number }, any>('returns:list', (a) => returnsRepo.getReturns(a.limit || 100))
  handle('returns:stats', () => returnsRepo.getReturnStats())

  // ─── Accounts (Chart of Accounts) ────────────────────
  handle('accounts:getAll', () => accountsRepo.getAllAccounts())
  handle('accounts:getTree', () => accountsRepo.getAccountTree())
  handleArg<{ id: number }, any>('accounts:getById', (a) => accountsRepo.getAccountById(a.id))
  handleArg<{ type: string }, any>('accounts:getByType', (a) => accountsRepo.getAccountsByType(a.type as any))
  handleArg<{ code: string; name: string; type: string; parentId?: number | null; description?: string }, any>('accounts:create', (a) => accountsRepo.createAccount(a as any))
  handleArg<{ id: number; data: { code?: string; name?: string; type?: string; parentId?: number | null; description?: string } }, any>('accounts:update', (a) => accountsRepo.updateAccount(a.id, a.data as any))
  handleArg<{ id: number }, boolean>('accounts:delete', (a) => accountsRepo.deleteAccount(a.id))
  handleArg<{ id: number }, boolean>('accounts:toggleActive', (a) => accountsRepo.toggleAccountActive(a.id))

  // ─── Journal Entries ─────────────────────────────────
  handleArg<{ startDate?: string; endDate?: string; referenceType?: string; limit?: number; offset?: number }, any>('journal:entries', (a) => journalRepo.getJournalEntries(a))
  handleArg<{ id: number }, any>('journal:getById', (a) => journalRepo.getJournalEntryById(a.id))
  handleArg<{ entryDate: string; description: string; lines: { accountId: number; debit: number; credit: number; description?: string }[] }, any>('journal:create', (a) => journalRepo.createJournalEntry({ ...a, referenceType: 'manual' }))
  handleArg<{ startDate?: string; endDate?: string }, any>('journal:trialBalance', (a) => journalRepo.getTrialBalance(a.startDate, a.endDate))
  handleArg<{ accountId: number; startDate?: string; endDate?: string }, any>('journal:ledger', (a) => journalRepo.getGeneralLedger(a.accountId, a.startDate, a.endDate))
  handleArg<{ startDate?: string; endDate?: string }, any>('reports:cashFlow', (a) => journalRepo.generateCashFlow(a.startDate, a.endDate))

  // ─── Financial Reports ───────────────────────────────
  handleArg<{ startDate?: string; endDate?: string }, any>('reports:profitLoss', (a) => reportsRepo.generateProfitLoss(a.startDate, a.endDate))
  handleArg<{ asOfDate?: string }, any>('reports:balanceSheet', (a) => reportsRepo.generateBalanceSheet(a.asOfDate))
  handle('reports:arAging', () => reportsRepo.generateARAging())

  // ─── Fiscal Periods ──────────────────────────────────
  handle('periods:getAll', () => periodsRepo.getAllPeriods())
  handle('periods:getActive', () => periodsRepo.getActivePeriod())
  handleArg<{ id: number; userId: number }, boolean>('periods:close', (a) => periodsRepo.closePeriod(a.id, a.userId))
  handleArg<{ id: number }, boolean>('periods:reopen', (a) => periodsRepo.reopenPeriod(a.id))
  ipcMain.handle('periods:create', (_event, a: { name: string; startDate: string; endDate: string }) => {
    try {
      const db = getDatabase()
      db.prepare('INSERT INTO fiscal_periods (name, startDate, endDate) VALUES (?, ?, ?)').run(a.name, a.startDate, a.endDate)
      return { success: true }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })

  // ─── Accounting Migration ────────────────────────────
  handle('accounting:migrate', () => {
    const db = getDatabase()
    const existingJE = db.prepare('SELECT COUNT(*) as c FROM journal_entries').get() as { c: number }
    if (existingJE.c > 0) return false

    // Backfill sales
    const allSales = db.prepare('SELECT * FROM sales').all() as any[]
    const allSaleItems = db.prepare('SELECT * FROM sale_items').all() as any[]
    for (const sale of allSales) {
      const items = allSaleItems.filter((si: any) => si.saleId === sale.id)
      journalRepo.postSaleJournal(sale.id, sale.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10), {
        items: items.map((i: any) => ({ purchasePrice: i.purchasePrice, quantity: i.quantity })),
        total_amount: sale.total_amount, paymentMethod: sale.paymentMethod
      })
    }
    // Backfill expenses
    const allExpenses = db.prepare('SELECT * FROM expenses').all() as any[]
    for (const exp of allExpenses) {
      journalRepo.postExpenseJournal(exp.id, exp.date || new Date().toISOString().slice(0, 10), exp.amount, exp.category)
    }
    // Backfill returns
    const allReturns = db.prepare('SELECT * FROM returns').all() as any[]
    for (const ret of allReturns) {
      journalRepo.postReturnJournal(ret.id, ret.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10), ret.refundAmount)
    }
    return true
  })

  handle('accounting:seedDemo', () => seedRepo.seedDemoData())
  handle('suppliers:getAll', () => suppliersRepo.getAllSuppliers())
  ipcMain.handle('suppliers:getById', (_e, a: { id: number }) => ({ success: true, data: suppliersRepo.getSupplierById(a.id) }))
  ipcMain.handle('suppliers:search', (_e, a: { query: string }) => ({ success: true, data: suppliersRepo.searchSuppliers(a.query) }))
  ipcMain.handle('suppliers:create', (_e, a: any) => ({ success: true, data: suppliersRepo.createSupplier(a) }))
  ipcMain.handle('suppliers:update', (_e, a: { id: number; data: any }) => ({ success: true, data: suppliersRepo.updateSupplier(a.id, a.data) }))
  ipcMain.handle('suppliers:delete', (_e, a: { id: number }) => ({ success: true, data: suppliersRepo.deleteSupplier(a.id) }))
  handle('suppliers:stats', () => suppliersRepo.getSupplierStats())
  ipcMain.handle('suppliers:ledger', (_e, a: { supplierId: number }) => ({ success: true, data: suppliersRepo.getSupplierLedgerEntries(a.supplierId) }))
  ipcMain.handle('suppliers:deleteLedgerEntry', (_e, a: { entryId: number }) => ({ success: true, data: suppliersRepo.deleteSupplierLedgerEntry(a.entryId) }))

  ipcMain.handle('suppliers:pay', (_event, a: { supplierId: number; amount: number; description?: string; purchaseId?: number }) => {
    return { success: true, data: purchasesRepo.paySupplier(a.supplierId, a.amount, a.description, a.purchaseId) }
  })

  ipcMain.handle('suppliers:addDebt', (_event, a: { supplierId: number; amount: number; description?: string; images?: string[] }) => {
    if (!a.amount || a.amount <= 0) return { success: false, error: 'مبلغ باید مثبت باشد' }
    const db = getDatabase()
    db.prepare('UPDATE suppliers SET balance = balance + ? WHERE id = ?').run(a.amount, a.supplierId)
    db.prepare('INSERT INTO supplier_ledger (supplierId, type, amount, description, images) VALUES (?, ?, ?, ?, ?)').run(a.supplierId, 'debt', a.amount, a.description || 'ثبت بدهی به تأمین‌کننده', JSON.stringify(a.images || []))
    return { success: true }
  })

  // ─── Supplier Debts — register, pay, and query supplier debt records ──
  ipcMain.handle('supplierDebts:getBySupplier', (_e, a: { supplierId: number }) => {
    const db = getDatabase()
    return { success: true, data: db.prepare('SELECT * FROM supplier_debts WHERE supplierId = ? ORDER BY date DESC').all(a.supplierId) }
  })
  // Register supplier debt: posts journal entry (Debit Purchases, Credit Accounts Payable)
  ipcMain.handle('supplierDebts:create', (_e, a: { supplierId: number; amount: number; date: string; description?: string; reference?: string }) => {
    if (!a.amount || a.amount <= 0) return { success: false, error: 'مبلغ باید مثبت باشد' }
    const db = getDatabase()
    const r = db.prepare('INSERT INTO supplier_debts (supplierId, amount, date, description, reference) VALUES (?, ?, ?, ?, ?)').run(a.supplierId, a.amount, a.date, a.description || '', a.reference || '')
    const supplier = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(a.supplierId) as any
    // Journal: Debit Purchases(5100), Credit Accounts Payable(2100)
    const purchaseAcct = db.prepare("SELECT id FROM accounts WHERE code = '5100'").get() as any
    const apAcct = db.prepare("SELECT id FROM accounts WHERE code = '2100'").get() as any
    if (purchaseAcct && apAcct) {
      const entry = db.prepare('INSERT INTO journal_entries (entryDate, description, referenceType, referenceId) VALUES (?, ?, ?, ?)').run(a.date, `بدهی به تأمین‌کننده: ${supplier?.name || a.supplierId}`, 'debt', r.lastInsertRowid)
      db.prepare('INSERT INTO journal_entry_lines (entryId, accountId, debit, credit) VALUES (?, ?, ?, ?)').run(entry.lastInsertRowid, purchaseAcct.id, a.amount, 0)
      db.prepare('INSERT INTO journal_entry_lines (entryId, accountId, debit, credit) VALUES (?, ?, ?, ?)').run(entry.lastInsertRowid, apAcct.id, 0, a.amount)
    }
    return { success: true, data: { id: r.lastInsertRowid } }
  })

  // Pay supplier debt: posts journal entry (Debit Accounts Payable, Credit Bank/Cash)
  ipcMain.handle('supplierDebts:pay', (_e, a: { debtId: number; amount: number; paymentDate: string; method?: string; reference?: string }) => {
    if (!a.amount || a.amount <= 0) return { success: false, error: 'مبلغ باید مثبت باشد' }
    const db = getDatabase()
    const debt = db.prepare('SELECT * FROM supplier_debts WHERE id = ?').get(a.debtId) as any
    if (!debt) return { success: false, error: 'بدهی یافت نشد' }
    const newPaid = debt.paidAmount + a.amount
    const newStatus = newPaid >= debt.amount ? 'paid' : 'partial'
    db.prepare('UPDATE supplier_debts SET paidAmount = ?, status = ? WHERE id = ?').run(newPaid, newStatus, a.debtId)
    db.prepare('INSERT INTO supplier_debt_payments (debtId, amount, paymentDate, method, reference) VALUES (?, ?, ?, ?, ?)').run(a.debtId, a.amount, a.paymentDate, a.method || 'cash', a.reference || '')
    db.prepare('UPDATE suppliers SET balance = balance - ? WHERE id = ?').run(a.amount, debt.supplierId)
    // Journal: Debit Accounts Payable(2100), Credit Bank(1200)
    const apAcct = db.prepare("SELECT id FROM accounts WHERE code = '2100'").get() as any
    const bankAcct = db.prepare("SELECT id FROM accounts WHERE code = '1200'").get() as any
    if (apAcct && bankAcct) {
      const supplier = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(debt.supplierId) as any
      const entry = db.prepare('INSERT INTO journal_entries (entryDate, description, referenceType, referenceId) VALUES (?, ?, ?, ?)').run(a.paymentDate, `پرداخت بدهی به تأمین‌کننده: ${supplier?.name || debt.supplierId}`, 'debt', a.debtId)
      db.prepare('INSERT INTO journal_entry_lines (entryId, accountId, debit, credit) VALUES (?, ?, ?, ?)').run(entry.lastInsertRowid, apAcct.id, a.amount, 0)
      db.prepare('INSERT INTO journal_entry_lines (entryId, accountId, debit, credit) VALUES (?, ?, ?, ?)').run(entry.lastInsertRowid, bankAcct.id, 0, a.amount)
    }
    return { success: true }
  })
  ipcMain.handle('supplierDebts:delete', (_e, a: { debtId: number }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM supplier_debts WHERE id = ?').run(a.debtId)
    return { success: true }
  })
  ipcMain.handle('supplierDebts:stats', (_e, a: { supplierId: number }) => {
    const db = getDatabase()
    const r = db.prepare('SELECT COALESCE(SUM(amount), 0) as t, COALESCE(SUM(paidAmount), 0) as p FROM supplier_debts WHERE supplierId = ?').get(a.supplierId) as any
    return { success: true, data: { totalDebt: r.t, totalPaid: r.p, balance: r.t - r.p } }
  })

  // ─── Bank Accounts ──────────────────────────────────────
  ipcMain.handle('bankAccounts:getAll', () => {
    const db = getDatabase()
    return { success: true, data: db.prepare('SELECT * FROM bank_accounts ORDER BY name').all() }
  })
  ipcMain.handle('bankAccounts:create', (_e, a: any) => {
    const db = getDatabase()
    const r = db.prepare('INSERT INTO bank_accounts (name, account_number, bank_name, branch, account_type, initial_balance, current_balance, iban, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(a.name, a.account_number || '', a.bank_name || '', a.branch || '', a.account_type || 'current', a.initial_balance || 0, a.initial_balance || 0, a.iban || '', a.notes || '')
    return { success: true, data: { id: r.lastInsertRowid } }
  })
  ipcMain.handle('bankAccounts:update', (_e, a: { id: number; data: any }) => {
    const db = getDatabase()
    const u = a.data; const fields: string[] = []; const params: any[] = []
    for (const k of ['name', 'account_number', 'bank_name', 'branch', 'account_type', 'iban', 'notes', 'status']) { if (u[k] !== undefined) { fields.push(`${k} = ?`); params.push(u[k]) } }
    if (fields.length === 0) return { success: false }
    fields.push("updatedAt = datetime('now','localtime')"); params.push(a.id)
    db.prepare(`UPDATE bank_accounts SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return { success: true }
  })
  ipcMain.handle('bankAccounts:delete', (_e, a: { id: number }) => {
    const db = getDatabase()
    db.prepare('UPDATE bank_accounts SET status = ? WHERE id = ?').run('inactive', a.id)
    return { success: true }
  })
  ipcMain.handle('bankAccounts:deposit', (_e, a: { accountId: number; amount: number; date: string; description?: string }) => {
    if (!a.amount || a.amount <= 0) return { success: false, error: 'مبلغ باید مثبت باشد' }
    const db = getDatabase()
    const acct = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(a.accountId) as any
    if (!acct) return { success: false, error: 'حساب یافت نشد' }
    const newBalance = acct.current_balance + a.amount
    db.prepare('UPDATE bank_accounts SET current_balance = ? WHERE id = ?').run(newBalance, a.accountId)
    db.prepare('INSERT INTO bank_transactions (bankAccountId, transactionDate, type, amount, balanceAfter, description) VALUES (?, ?, ?, ?, ?, ?)').run(a.accountId, a.date, 'deposit', a.amount, newBalance, a.description || 'واریز')
    return { success: true, data: { newBalance } }
  })
  ipcMain.handle('bankAccounts:withdraw', (_e, a: { accountId: number; amount: number; date: string; description?: string }) => {
    if (!a.amount || a.amount <= 0) return { success: false, error: 'مبلغ باید مثبت باشد' }
    const db = getDatabase()
    const acct = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(a.accountId) as any
    if (!acct) return { success: false, error: 'حساب یافت نشد' }
    if (acct.current_balance < a.amount) return { success: false, error: 'موجودی کافی نیست' }
    const newBalance = acct.current_balance - a.amount
    db.prepare('UPDATE bank_accounts SET current_balance = ? WHERE id = ?').run(newBalance, a.accountId)
    db.prepare('INSERT INTO bank_transactions (bankAccountId, transactionDate, type, amount, balanceAfter, description) VALUES (?, ?, ?, ?, ?, ?)').run(a.accountId, a.date, 'withdrawal', a.amount, newBalance, a.description || 'برداشت')
    return { success: true, data: { newBalance } }
  })
  ipcMain.handle('bankAccounts:transfer', (_e, a: { fromId: number; toId: number; amount: number; date: string; description?: string }) => {
    if (!a.amount || a.amount <= 0) return { success: false, error: 'مبلغ باید مثبت باشد' }
    const db = getDatabase()
    const from = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(a.fromId) as any
    if (!from) return { success: false, error: 'حساب مبدأ یافت نشد' }
    if (from.current_balance < a.amount) return { success: false, error: 'موجودی مبدأ کافی نیست' }
    const to = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(a.toId) as any
    if (!to) return { success: false, error: 'حساب مقصد یافت نشد' }
    db.prepare('UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?').run(a.amount, a.fromId)
    db.prepare('UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?').run(a.amount, a.toId)
    const fromBal = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = ?').get(a.fromId) as any
    const toBal = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = ?').get(a.toId) as any
    db.prepare('INSERT INTO bank_transactions (bankAccountId, transactionDate, type, amount, balanceAfter, description) VALUES (?, ?, ?, ?, ?, ?)').run(a.fromId, a.date, 'transfer', a.amount, fromBal.current_balance, `انتقال به ${to.name}`)
    db.prepare('INSERT INTO bank_transactions (bankAccountId, transactionDate, type, amount, balanceAfter, description) VALUES (?, ?, ?, ?, ?, ?)').run(a.toId, a.date, 'transfer', a.amount, toBal.current_balance, `انتقال از ${from.name}`)
    return { success: true }
  })
  ipcMain.handle('bankAccounts:transactions', (_e, a: { accountId: number }) => {
    const db = getDatabase()
    return { success: true, data: db.prepare('SELECT * FROM bank_transactions WHERE bankAccountId = ? ORDER BY transactionDate DESC').all(a.accountId) }
  })

  // ─── Employees ──────────────────────────────────────────
  ipcMain.handle('employees:getAll', () => {
    const db = getDatabase()
    return { success: true, data: db.prepare('SELECT * FROM employees ORDER BY full_name').all() }
  })
  ipcMain.handle('employees:create', (_e, a: any) => {
    const db = getDatabase()
    const r = db.prepare('INSERT INTO employees (full_name, employeeCode, nationalId, position, department, hireDate, baseSalary, salaryType, phone, bankAccount, accountNumber, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(a.full_name, a.employeeCode || '', a.nationalId || '', a.position || '', a.department || '', a.hireDate || '', a.baseSalary || 0, a.salaryType || 'monthly', a.phone || '', a.bankAccount || '', a.accountNumber || '', a.notes || '')
    return { success: true, data: { id: r.lastInsertRowid } }
  })
  ipcMain.handle('employees:update', (_e, a: { id: number; data: any }) => {
    const db = getDatabase()
    const u = a.data; const fields: string[] = []; const params: any[] = []
    for (const k of ['full_name', 'employeeCode', 'nationalId', 'position', 'department', 'hireDate', 'baseSalary', 'salaryType', 'phone', 'bankAccount', 'accountNumber', 'notes', 'status']) { if (u[k] !== undefined) { fields.push(`${k} = ?`); params.push(u[k]) } }
    if (fields.length === 0) return { success: false }
    fields.push("updatedAt = datetime('now','localtime')"); params.push(a.id)
    db.prepare(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return { success: true }
  })
  ipcMain.handle('employees:delete', (_e, a: { id: number }) => {
    const db = getDatabase()
    db.prepare('UPDATE employees SET status = ? WHERE id = ?').run('inactive', a.id)
    return { success: true }
  })
  // Process payroll: netSalary = base + bonuses + overtime - deductions - tax - insurance
  ipcMain.handle('employees:payroll', (_e, a: { employeeId: number; paymentDate: string; period: string; baseSalary: number; bonuses?: number; deductions?: number; overtimeHours?: number; overtimeRate?: number; taxAmount?: number; insuranceAmount?: number; paymentMethod?: string }) => {
    const db = getDatabase()
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(a.employeeId) as any
    if (!emp) return { success: false, error: 'کارمند یافت نشد' }
    const bonuses = a.bonuses || 0
    const deductions = a.deductions || 0
    const otHours = a.overtimeHours || 0
    const otRate = a.overtimeRate || 0
    const otAmount = otHours * otRate
    const tax = a.taxAmount || 0
    const insurance = a.insuranceAmount || 0
    const base = a.baseSalary || emp.baseSalary
    const netSalary = base + bonuses + otAmount - deductions - tax - insurance
    const r = db.prepare('INSERT INTO salary_payments (employeeId, paymentDate, period, baseSalary, bonuses, deductions, netSalary, overtimeHours, overtimeRate, overtimeAmount, taxAmount, insuranceAmount, paymentMethod, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(a.employeeId, a.paymentDate, a.period, base, bonuses, deductions, netSalary, otHours, otRate, otAmount, tax, insurance, a.paymentMethod || 'cash', 'paid')
    // Journal: Debit Salaries Expense(6300), Credit Bank(1200)
    const salaryAcct = db.prepare("SELECT id FROM accounts WHERE code = '6300'").get() as any
    const bankAcct = db.prepare("SELECT id FROM accounts WHERE code = '1200'").get() as any
    if (salaryAcct && bankAcct && netSalary > 0) {
      const entry = db.prepare('INSERT INTO journal_entries (entryDate, description, referenceType, referenceId) VALUES (?, ?, ?, ?)').run(a.paymentDate, `حقوق ${emp.full_name} — ${a.period}`, 'salary', r.lastInsertRowid)
      db.prepare('INSERT INTO journal_entry_lines (entryId, accountId, debit, credit) VALUES (?, ?, ?, ?)').run(entry.lastInsertRowid, salaryAcct.id, netSalary, 0)
      db.prepare('INSERT INTO journal_entry_lines (entryId, accountId, debit, credit) VALUES (?, ?, ?, ?)').run(entry.lastInsertRowid, bankAcct.id, 0, netSalary)
    }
    return { success: true, data: { id: r.lastInsertRowid, netSalary } }
  })
  ipcMain.handle('employees:getPayroll', (_e, a: { employeeId: number }) => {
    const db = getDatabase()
    return { success: true, data: db.prepare('SELECT * FROM salary_payments WHERE employeeId = ? ORDER BY paymentDate DESC').all(a.employeeId) }
  })
  ipcMain.handle('employees:bulkPayroll', (_e, a: { employeeIds: number[]; paymentDate: string; period: string }) => {
    const db = getDatabase()
    const results: any[] = []
    for (const empId of a.employeeIds) {
      const emp = db.prepare('SELECT * FROM employees WHERE id = ? AND status = ?').get(empId, 'active') as any
      if (!emp) continue
      const base = emp.baseSalary
      const netSalary = base
      const r = db.prepare('INSERT INTO salary_payments (employeeId, paymentDate, period, baseSalary, netSalary, paymentMethod, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(empId, a.paymentDate, a.period, base, netSalary, 'bank_transfer', 'paid')
      const salaryAcct = db.prepare("SELECT id FROM accounts WHERE code = '6300'").get() as any
      const bankAcct = db.prepare("SELECT id FROM accounts WHERE code = '1200'").get() as any
      if (salaryAcct && bankAcct && netSalary > 0) {
        const entry = db.prepare('INSERT INTO journal_entries (entryDate, description, referenceType, referenceId) VALUES (?, ?, ?, ?)').run(a.paymentDate, `حقوق ${emp.full_name} — ${a.period}`, 'salary', r.lastInsertRowid)
        db.prepare('INSERT INTO journal_entry_lines (entryId, accountId, debit, credit) VALUES (?, ?, ?, ?)').run(entry.lastInsertRowid, salaryAcct.id, netSalary, 0)
        db.prepare('INSERT INTO journal_entry_lines (entryId, accountId, debit, credit) VALUES (?, ?, ?, ?)').run(entry.lastInsertRowid, bankAcct.id, 0, netSalary)
      }
      results.push({ id: empId, name: emp.full_name, netSalary })
    }
    return { success: true, data: results }
  })

  // ─── Purchases ──────────────────────────────────────────
  handle('purchases:getAll', () => purchasesRepo.getAllPurchases())
  ipcMain.handle('purchases:getById', (_e, a: { id: number }) => ({ success: true, data: purchasesRepo.getPurchaseById(a.id) }))
  ipcMain.handle('purchases:getBySupplier', (_e, a: { supplierId: number }) => ({ success: true, data: purchasesRepo.getPurchasesBySupplier(a.supplierId) }))
  ipcMain.handle('purchases:create', (_e, a: { input: any }) => ({ success: true, data: purchasesRepo.createPurchase(a.input) }))
  handle('purchases:stats', () => purchasesRepo.getPurchaseStats())
  ipcMain.handle('purchases:return', (_e, a: { purchaseId: number; items: any[] }) => ({ success: true, data: purchasesRepo.returnPurchase(a.purchaseId, a.items) }))

  // ─── Price History ──────────────────────────────────────
  ipcMain.handle('priceHistory:get', (_e, a: { productId?: number; priceType?: string; startDate?: string; endDate?: string }) => ({ success: true, data: priceHistoryRepo.getPriceHistory(a.productId, a.priceType, a.startDate, a.endDate) }))
  ipcMain.handle('priceHistory:latest', () => ({ success: true, data: priceHistoryRepo.getLatestPrices() }))
  ipcMain.handle('priceHistory:byProduct', (_e, a: { productId: number }) => ({ success: true, data: priceHistoryRepo.getPriceHistoryByProduct(a.productId) }))

  // ─── Smart Export/Import ──────────────────────────────────
  handle('smartExport:modules', () => smartExportService.getExportModuleList())
  handle('smartExport:presets', () => smartExportService.getExportPresets())
  handleArg('smartExport:dependencies', (modules: string[]) => ({
    dependencies: smartExportService.getModuleDependencies(modules as any),
    warnings: smartExportService.getModuleWarnings(modules as any),
  }))

  handleArg('smartExport:execute', (arg: { options: any; userName?: string }) => {
    const result = smartExportService.smartExport(arg.options, arg.userName || 'system')
    if (result.success && result.data) {
      const defaultName = `smart-export-${new Date().toISOString().slice(0, 10)}.hze`
      const win = BrowserWindow.getFocusedWindow()
      const savedPath = dialog.showSaveDialogSync(win || BrowserWindow.getAllWindows()[0], {
        defaultPath: defaultName,
        filters: [{ name: 'Smart Export', extensions: ['hze', 'json'] }],
      })
      if (savedPath) {
        smartExportService.saveExportFile(result.data, savedPath)
        return { success: true, data: { ...result.data, filePath: savedPath } }
      }
      return { success: true, data: result.data }
    }
    return result
  })

  handleArg('smartExport:save', (arg: { data: any; filePath: string }) => {
    smartExportService.saveExportFile(arg.data, arg.filePath)
    return true
  })

  handleArg('smartImport:preview', (arg: { filePath: string }) => {
    const data = smartExportService.loadExportFile(arg.filePath)
    const signature = smartExportService.verifySignature(data)
    return { data, signature }
  })

  handleArg('smartImport:execute', (arg: { data: any; options: any; userName?: string }) => {
    // Migrate old file versions first so the data aligns with the current schema
    const migrated = migrationService.migrateData(arg.data)
    const finalData = migrated.migrated ? migrated.data : arg.data
    return smartExportService.smartImport(finalData, arg.options, arg.userName || 'user')
  })

  handleArg('smartImport:validate', (arg: { filePath: string }) => {
    try {
      const data = smartExportService.loadExportFile(arg.filePath)
      const signature = smartExportService.verifySignature(data)
      return { valid: true, modules: data.modules.map((m: any) => ({ module: m.module, recordCount: m.recordCount })), signature, encrypted: data.encrypted }
    } catch (err: any) {
      return { valid: false, error: err.message }
    }
  })

  // ─── Version Compatibility / Migration ──────────────────
  handle('migration:version', () => migrationService.getCurrentVersion())
  handle('migration:matrix', () => migrationService.getCompatibilityMatrix())

  handleArg('migration:check', (arg: { filePath: string }) => {
    try {
      const data = smartExportService.loadExportFile(arg.filePath)
      return migrationService.checkCompatibility(data)
    } catch (err: any) {
      return { compatible: false, errors: [err.message] }
    }
  })

  handleArg('migration:migrate', (arg: { filePath: string }) => {
    try {
      const data = smartExportService.loadExportFile(arg.filePath)
      return migrationService.migrateData(data)
    } catch (err: any) {
      return { data: null, migrated: false, changes: [], error: err.message }
    }
  })

  handleArg('migration:dryRun', (arg: { filePath: string; options: any }) => {
    try {
      const data = smartExportService.loadExportFile(arg.filePath)
      return migrationService.dryRunImport(data, arg.options)
    } catch (err: any) {
      return { compatible: false, error: err.message }
    }
  })

  handle('migration:preBackup', () => {
    return migrationService.preImportBackup()
  })

  handleArg('migration:smartImport', (arg: { filePath: string; options: any; userName?: string }) => {
    try {
      const data = smartExportService.loadExportFile(arg.filePath)
      const migrated = migrationService.migrateData(data)
      const finalData = migrated.migrated ? migrated.data : data
      return smartExportService.smartImport(finalData, arg.options, arg.userName || 'user')
    } catch (err: any) {
      return { success: false, errors: [{ table: 'general', error: err.message }] }
    }
  })
}
