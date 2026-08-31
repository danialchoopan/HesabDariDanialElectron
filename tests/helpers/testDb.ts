/**
 * Test Database Helper — creates isolated in-memory SQLite for tests.
 * Uses sql.js (pure JS) wrapped to mimic better-sqlite3 API.
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'

let SQL: any

/**
 * Creates an isolated in-memory SQLite database for testing.
 * Uses sql.js (WASM-based) wrapped to mimic the better-sqlite3 API.
 * Tables created: users, products, customers, categories, sales, sale_items,
 * customer_ledger, expenses, settings, audit_log, accounts, journal_entries,
 * journal_entry_lines, returns, price_history, inventory_adjustments,
 * fiscal_periods, cross_sell_rules, installments, proformas, service_tickets,
 * customer_credit, migration_history. Also seeds a default chart of accounts.
 */
export async function createTestDb(): Promise<any> {
  if (!SQL) SQL = await initSqlJs()
  const sqlDb = new SQL.Database()

  // sql.js uses a different API than better-sqlite3; this wrapper
  // translates the familiar exec/prepare/all/get/run methods.
  const db = {
    _sql: sqlDb as SqlJsDatabase,
    exec(sql: string) { sqlDb.run(sql) },
    pragma(stmt: string): any[] {
      // Mimic better-sqlite3 db.pragma(): prepends PRAGMA and returns array of rows
      const sql = /^\s*pragma\b/i.test(stmt) ? stmt : `PRAGMA ${stmt}`
      try {
        const res = sqlDb.exec(sql)
        if (!res || res.length === 0) return []
        const { columns, values } = res[0]
        return values.map((v: any[]) => Object.fromEntries(columns.map((c: string, i: number) => [c, v[i]])))
      } catch {
        return []
      }
    },
    transaction(fn: () => any) {
      return () => {
        sqlDb.run('BEGIN TRANSACTION')
        try {
          const result = fn()
          sqlDb.run('COMMIT')
          return result
        } catch (e) {
          sqlDb.run('ROLLBACK')
          throw e
        }
      }
    },
    prepare(sql: string) {
      return {
        run(...params: any[]) {
          sqlDb.run(sql, params)
          const idRow = sqlDb.exec('SELECT last_insert_rowid() as id')
          const lastId = idRow.length > 0 ? idRow[0].values[0][0] : 0
          const changes = sqlDb.getRowsModified()
          return { changes, lastInsertRowid: lastId }
        },
        all(...params: any[]) {
          const stmt = sqlDb.prepare(sql)
          stmt.bind(params)
          const rows: any[] = []
          while (stmt.step()) {
            const cols = stmt.getColumnNames()
            const vals = stmt.get()
            const row: any = {}
            cols.forEach((c: string, i: number) => row[c] = vals[i])
            rows.push(row)
          }
          stmt.free()
          return rows
        },
        get(...params: any[]) {
          const rows = (this as any).all(...params)
          return rows.length > 0 ? rows[0] : undefined
        },
      }
    },
  }

  // Create all tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, pin_code TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'cashier', permissions TEXT DEFAULT '{}', lastLoginAt TEXT DEFAULT '', lastActivityAt TEXT DEFAULT '', isActive INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, barcode TEXT UNIQUE, title TEXT NOT NULL, description TEXT DEFAULT '', imageBase64 TEXT DEFAULT '', category TEXT NOT NULL DEFAULT '', subcategory TEXT DEFAULT '', unit TEXT NOT NULL DEFAULT 'number', purchase_price REAL NOT NULL DEFAULT 0, sale_price REAL NOT NULL DEFAULT 0, stock REAL NOT NULL DEFAULT 0, minStock REAL NOT NULL DEFAULT 0, isLoose INTEGER NOT NULL DEFAULT 0, isActive INTEGER NOT NULL DEFAULT 1, isSellable INTEGER NOT NULL DEFAULT 1, has_expiry INTEGER NOT NULL DEFAULT 0, expiry_date TEXT DEFAULT '', expiry_alert_days INTEGER NOT NULL DEFAULT 30, last_alerted INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL DEFAULT '', brand_id INTEGER DEFAULT NULL, profit_percentage REAL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', balance REAL NOT NULL DEFAULT 0, address TEXT DEFAULT '', notes TEXT DEFAULT '', customerType TEXT DEFAULT 'real', description TEXT DEFAULT '', imageBase64 TEXT DEFAULT '', totalSpent REAL DEFAULT 0, totalPurchases INTEGER DEFAULT 0, is_blocked INTEGER DEFAULT 0, isActive INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT DEFAULT '', level INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, parent_id INTEGER DEFAULT NULL, createdAt TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, invoiceNumber TEXT UNIQUE NOT NULL, userId INTEGER NOT NULL, customerId INTEGER, subtotal REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL DEFAULT 0, totalNetProfit REAL NOT NULL DEFAULT 0, paymentMethod TEXT NOT NULL DEFAULT 'cash', customerPaid REAL NOT NULL DEFAULT 0, changeAmount REAL NOT NULL DEFAULT 0, description TEXT DEFAULT '', invoiceDescription TEXT DEFAULT '', manualCustomerName TEXT DEFAULT '', saleType TEXT DEFAULT 'in-person', saleDate TEXT NOT NULL DEFAULT '', affectsInventory INTEGER NOT NULL DEFAULT 1, shipping_cost REAL DEFAULT 0, shipping_tax REAL DEFAULT 0, shipping_provider TEXT DEFAULT '', tracking_number TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS sale_items (id INTEGER PRIMARY KEY AUTOINCREMENT, saleId INTEGER NOT NULL, productId INTEGER NOT NULL, productTitle TEXT NOT NULL, quantity REAL NOT NULL, unitPrice REAL NOT NULL, purchasePrice REAL NOT NULL DEFAULT 0, subtotal REAL NOT NULL, netProfit REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS customer_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, customerId INTEGER NOT NULL, saleId INTEGER, type TEXT NOT NULL, amount REAL NOT NULL, description TEXT NOT NULL DEFAULT '', images TEXT DEFAULT '[]', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, imageBase64 TEXT DEFAULT '', images TEXT DEFAULT '[]', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, userName TEXT DEFAULT '', action TEXT NOT NULL, entityType TEXT NOT NULL, entityId INTEGER, details TEXT, beforeValue TEXT, afterValue TEXT, ip TEXT DEFAULT '', createdAt TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, parentId INTEGER DEFAULT NULL, isActive INTEGER NOT NULL DEFAULT 1, description TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS journal_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, entryDate TEXT NOT NULL, description TEXT NOT NULL, referenceType TEXT, referenceId INTEGER, fiscalPeriodId INTEGER, isPosted INTEGER NOT NULL DEFAULT 1, createdBy INTEGER, createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS journal_entry_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, entryId INTEGER NOT NULL, accountId INTEGER NOT NULL, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, description TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS returns (id INTEGER PRIMARY KEY AUTOINCREMENT, saleId INTEGER, userId INTEGER, productId INTEGER, quantity INTEGER, reason TEXT, refundAmount REAL, status TEXT DEFAULT 'pending', isDamaged INTEGER DEFAULT 0, createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, productId INTEGER NOT NULL, priceType TEXT NOT NULL, oldPrice REAL NOT NULL DEFAULT 0, newPrice REAL NOT NULL, changedBy TEXT DEFAULT 'system', changedAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS inventory_adjustments (id INTEGER PRIMARY KEY AUTOINCREMENT, productId INTEGER NOT NULL, previousStock REAL NOT NULL, newStock REAL NOT NULL, adjustmentQty REAL NOT NULL, reason TEXT DEFAULT '', adjustmentType TEXT NOT NULL DEFAULT 'manual', createdBy TEXT DEFAULT 'admin', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS fiscal_periods (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT NOT NULL, isClosed INTEGER NOT NULL DEFAULT 0, closedAt TEXT, closedBy INTEGER, createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS cross_sell_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, triggerType TEXT NOT NULL DEFAULT 'product', triggerValue TEXT NOT NULL DEFAULT '', triggerCondition TEXT DEFAULT '>=', triggerThreshold REAL DEFAULT 0, ruleType TEXT NOT NULL DEFAULT 'mandatory', priority INTEGER NOT NULL DEFAULT 0, isActive INTEGER NOT NULL DEFAULT 1, createdBy TEXT DEFAULT 'admin', createdAt TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS installments (id INTEGER PRIMARY KEY AUTOINCREMENT, installmentNumber TEXT UNIQUE NOT NULL, saleId INTEGER, customerId INTEGER, totalAmount REAL NOT NULL DEFAULT 0, downPayment REAL NOT NULL DEFAULT 0, installmentCount INTEGER NOT NULL DEFAULT 2, monthlyAmount REAL NOT NULL DEFAULT 0, penaltyPercent REAL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', startDate TEXT NOT NULL DEFAULT '', notes TEXT DEFAULT '', createdBy TEXT DEFAULT 'admin', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS proformas (id INTEGER PRIMARY KEY AUTOINCREMENT, proformaNumber TEXT UNIQUE NOT NULL, customerId INTEGER, userId INTEGER, subtotal REAL NOT NULL DEFAULT 0, totalAmount REAL NOT NULL DEFAULT 0, taxRate REAL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', validUntil TEXT NOT NULL, notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS service_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, ticketNumber TEXT UNIQUE NOT NULL, customerId INTEGER, productId INTEGER, serialNumber TEXT, warrantyClaim INTEGER DEFAULT 0, warrantyStartDate TEXT, warrantyEndDate TEXT, status TEXT NOT NULL DEFAULT 'pending', priority TEXT DEFAULT 'medium', problemDescription TEXT NOT NULL, diagnosis TEXT DEFAULT '', technician TEXT DEFAULT '', partsCost REAL DEFAULT 0, laborCost REAL DEFAULT 0, totalCost REAL DEFAULT 0, createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS customer_credit (id INTEGER PRIMARY KEY AUTOINCREMENT, customerId INTEGER UNIQUE, creditLimit REAL DEFAULT 0, currentDebt REAL DEFAULT 0, creditScore INTEGER DEFAULT 100, isBlocked INTEGER DEFAULT 0, notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS migration_history (id INTEGER PRIMARY KEY AUTOINCREMENT, fromVersion TEXT NOT NULL, toVersion TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'applied', errorMessage TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS brands (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', isActive INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT DEFAULT '', address TEXT DEFAULT '', notes TEXT DEFAULT '', balance REAL DEFAULT 0, isActive INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS supplier_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, supplierId INTEGER NOT NULL, purchaseId INTEGER, type TEXT NOT NULL, amount REAL NOT NULL, description TEXT DEFAULT '', images TEXT DEFAULT '[]', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, invoiceNumber TEXT UNIQUE NOT NULL, supplierId INTEGER NOT NULL, subtotal REAL NOT NULL DEFAULT 0, taxAmount REAL NOT NULL DEFAULT 0, discountAmount REAL NOT NULL DEFAULT 0, totalAmount REAL NOT NULL DEFAULT 0, paidAmount REAL NOT NULL DEFAULT 0, paymentMethod TEXT NOT NULL DEFAULT 'credit', status TEXT NOT NULL DEFAULT 'pending', notes TEXT DEFAULT '', purchaseDate TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS purchase_items (id INTEGER PRIMARY KEY AUTOINCREMENT, purchaseId INTEGER NOT NULL, productId INTEGER NOT NULL, productTitle TEXT NOT NULL, quantity REAL NOT NULL, unitCost REAL NOT NULL, subtotal REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS supplier_debts (id INTEGER PRIMARY KEY AUTOINCREMENT, supplierId INTEGER NOT NULL, amount REAL NOT NULL, paidAmount REAL NOT NULL DEFAULT 0, date TEXT NOT NULL, description TEXT DEFAULT '', reference TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS supplier_debt_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, debtId INTEGER NOT NULL, amount REAL NOT NULL, paymentDate TEXT NOT NULL, method TEXT DEFAULT 'cash', reference TEXT DEFAULT '', notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS bank_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, account_number TEXT DEFAULT '', bank_name TEXT DEFAULT '', branch TEXT DEFAULT '', account_type TEXT DEFAULT 'current', initial_balance REAL DEFAULT 0, current_balance REAL DEFAULT 0, currency TEXT DEFAULT 'IRR', iban TEXT DEFAULT '', swift_code TEXT DEFAULT '', status TEXT DEFAULT 'active', notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS bank_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, bankAccountId INTEGER NOT NULL, transactionDate TEXT NOT NULL, description TEXT DEFAULT '', type TEXT NOT NULL DEFAULT 'deposit', amount REAL NOT NULL DEFAULT 0, balanceAfter REAL DEFAULT 0, reference TEXT DEFAULT '', relatedTo TEXT DEFAULT '', status TEXT DEFAULT 'cleared', notes TEXT DEFAULT '', createdBy TEXT DEFAULT 'admin', createdAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, employeeCode TEXT DEFAULT '', nationalId TEXT DEFAULT '', position TEXT DEFAULT '', department TEXT DEFAULT '', hireDate TEXT DEFAULT '', status TEXT DEFAULT 'active', baseSalary REAL DEFAULT 0, salaryType TEXT DEFAULT 'monthly', bankAccount TEXT DEFAULT '', accountNumber TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', address TEXT DEFAULT '', notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS salary_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, employeeId INTEGER NOT NULL, paymentDate TEXT NOT NULL, period TEXT DEFAULT '', baseSalary REAL DEFAULT 0, bonuses REAL DEFAULT 0, deductions REAL DEFAULT 0, netSalary REAL DEFAULT 0, overtimeHours REAL DEFAULT 0, overtimeRate REAL DEFAULT 0, overtimeAmount REAL DEFAULT 0, taxAmount REAL DEFAULT 0, insuranceAmount REAL DEFAULT 0, otherDeductions REAL DEFAULT 0, paymentMethod TEXT DEFAULT 'cash', referenceNumber TEXT DEFAULT '', bankAccountId INTEGER, status TEXT DEFAULT 'paid', notes TEXT DEFAULT '', createdBy TEXT DEFAULT 'admin', createdAt TEXT NOT NULL DEFAULT '');
  `)

  // Seed chart of accounts
  const accounts: [string, string, string, number | null][] = [
    ['1100', 'صندوق نقدی', 'asset', null], ['1200', 'بانک', 'asset', null],
    ['1300', 'موجودی کالا', 'asset', null], ['1400', 'حساب‌های دریافتنی', 'asset', null],
    ['2100', 'حساب‌های پرداختنی', 'liability', null],
    ['3100', 'سرمایه صاحب کسب‌وکار', 'equity', null], ['3200', 'سود انباشته', 'equity', null],
    ['4100', 'درآمدها', 'income', null],
    ['5100', 'بهای تمام شده کالای فروش رفته', 'expense', null],
    ['6100', 'اجاره', 'expense', null], ['6200', 'قبوض', 'expense', null],
    ['6300', 'حقوق', 'expense', null], ['6400', 'لوازم', 'expense', null],
    ['6500', 'تعمیرات', 'expense', null], ['6600', 'حمل‌ونقل', 'expense', null],
    ['6700', 'سایر هزینه‌ها', 'expense', null],
  ]
  for (const [code, name, type, parentId] of accounts) {
    db.prepare('INSERT INTO accounts (code, name, type, parentId) VALUES (?, ?, ?, ?)').run(code, name, type, parentId)
  }

  return db
}
