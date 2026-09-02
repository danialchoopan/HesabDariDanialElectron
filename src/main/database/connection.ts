/**
 * Database connection — SQLite singleton with auto-initialization and schema migration.
 *
 * This module manages the entire database lifecycle:
 *   1. Opens pos.db as a singleton via better-sqlite3
 *   2. Sets WAL mode, foreign keys, busy timeout
 *   3. Runs initializeDatabase() — CREATE TABLE IF NOT EXISTS for all 20+ tables
 *   4. Runs migrateSchema() — ALTER TABLE ADD COLUMN for any missing columns
 *   5. Seeds chart of accounts if empty
 *
 * All columns are defined inline in CREATE TABLE (no separate ALTER TABLE DDL).
 * migrateSchema() handles upgrading old databases by detecting and adding
 * new columns with safe defaults. This is idempotent — no-op after first run.
 *
 * Key exports:
 *   - getDatabase(): returns the singleton DB instance
 *   - closeDatabase(): closes the connection (called on app quit)
 *   - isFirstRun(): checks if setup wizard has been completed
 *   - hashPin(): SHA-256 hash for user PIN codes
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { createHash } from 'crypto'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'pos.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')
    initializeDatabase(db)
    migrateSchema(db)
  }
  return db
}

export function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex')
}

/**
 * Auto-migration: detects missing columns/tables on startup and adds them safely.
 * Uses PRAGMA table_info() to check existing columns, then ALTER TABLE ADD COLUMN
 * for any missing ones. Idempotent — runs on every startup but is a no-op after first migration.
 */
function migrateSchema(database: Database.Database): void {
  const expectedColumns: Record<string, { name: string; type: string; defaultValue: string }[]> = {
    products: [
      { name: 'subcategory', type: 'TEXT', defaultValue: "''" },
      { name: 'isSellable', type: 'INTEGER', defaultValue: '1' },
      { name: 'expiry_date', type: 'TEXT', defaultValue: "''" },
      { name: 'expiry_alert_days', type: 'INTEGER', defaultValue: '30' },
      { name: 'last_alerted', type: 'INTEGER', defaultValue: '0' },
      { name: 'has_expiry', type: 'INTEGER', defaultValue: '0' },
      { name: 'brand_id', type: 'INTEGER', defaultValue: 'NULL' },
      { name: 'profit_percentage', type: 'REAL', defaultValue: '0' },
    ],
    sales: [
      { name: 'saleDate', type: 'TEXT', defaultValue: "datetime('now', 'localtime')" },
      { name: 'affectsInventory', type: 'INTEGER', defaultValue: '1' },
      // Shipping fields added for online order delivery tracking
      { name: 'shipping_cost', type: 'REAL', defaultValue: '0' },
      { name: 'shipping_tax', type: 'REAL', defaultValue: '0' },
      { name: 'shipping_provider', type: 'TEXT', defaultValue: "''" },
      { name: 'tracking_number', type: 'TEXT', defaultValue: "''" },
    ],
    customers: [
      { name: 'is_blocked', type: 'INTEGER', defaultValue: '0' },
    ],
    users: [
      { name: 'permissions', type: 'TEXT', defaultValue: "'{}'" },
      { name: 'lastLoginAt', type: 'TEXT', defaultValue: "''" },
      { name: 'lastActivityAt', type: 'TEXT', defaultValue: "''" },
    ],
    returns: [
      { name: 'isDamaged', type: 'INTEGER', defaultValue: '0' },
    ],
    audit_log: [
      { name: 'userName', type: 'TEXT', defaultValue: "''" },
      { name: 'beforeValue', type: 'TEXT', defaultValue: "''" },
      { name: 'afterValue', type: 'TEXT', defaultValue: "''" },
      { name: 'ip', type: 'TEXT', defaultValue: "''" },
    ],
  }

  let migrationCount = 0
  for (const [tableName, columns] of Object.entries(expectedColumns)) {
    try {
      const existing = database.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
      const existingNames = new Set(existing.map(c => c.name))
      for (const col of columns) {
        if (!existingNames.has(col.name)) {
          try {
            database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.defaultValue}`)
            migrationCount++
            console.log(`[Migration] Added ${tableName}.${col.name}`)
          } catch (e) {
            console.warn(`[Migration] Failed to add ${tableName}.${col.name}:`, e)
          }
        }
      }
    } catch (e) {
      // Table might not exist yet — skip silently
    }
  }
  if (migrationCount > 0) {
    console.log(`[Migration] ${migrationCount} columns added`)
  }

  // Ensure bank + employee tables exist
  try {
    database.exec(`CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, account_number TEXT DEFAULT '',
      bank_name TEXT DEFAULT '', branch TEXT DEFAULT '', account_type TEXT DEFAULT 'current',
      initial_balance REAL DEFAULT 0, current_balance REAL DEFAULT 0, currency TEXT DEFAULT 'IRR',
      iban TEXT DEFAULT '', swift_code TEXT DEFAULT '', status TEXT DEFAULT 'active',
      notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`)
    database.exec(`CREATE TABLE IF NOT EXISTS bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, bankAccountId INTEGER NOT NULL,
      transactionDate TEXT NOT NULL, description TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'deposit', amount REAL NOT NULL DEFAULT 0,
      balanceAfter REAL DEFAULT 0, reference TEXT DEFAULT '',
      relatedTo TEXT DEFAULT '', status TEXT DEFAULT 'cleared',
      notes TEXT DEFAULT '', createdBy TEXT DEFAULT 'admin',
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (bankAccountId) REFERENCES bank_accounts(id)
    )`)
    database.exec(`CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL,
      employeeCode TEXT DEFAULT '', nationalId TEXT DEFAULT '',
      position TEXT DEFAULT '', department TEXT DEFAULT '',
      hireDate TEXT DEFAULT '', status TEXT DEFAULT 'active',
      baseSalary REAL DEFAULT 0, salaryType TEXT DEFAULT 'monthly',
      bankAccount TEXT DEFAULT '', accountNumber TEXT DEFAULT '',
      phone TEXT DEFAULT '', email TEXT DEFAULT '',
      address TEXT DEFAULT '', notes TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`)
    database.exec(`CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employeeId INTEGER NOT NULL,
      paymentDate TEXT NOT NULL, period TEXT DEFAULT '',
      baseSalary REAL DEFAULT 0, bonuses REAL DEFAULT 0,
      deductions REAL DEFAULT 0, netSalary REAL DEFAULT 0,
      overtimeHours REAL DEFAULT 0, overtimeRate REAL DEFAULT 0,
      overtimeAmount REAL DEFAULT 0, taxAmount REAL DEFAULT 0,
      insuranceAmount REAL DEFAULT 0, otherDeductions REAL DEFAULT 0,
      paymentMethod TEXT DEFAULT 'cash', referenceNumber TEXT DEFAULT '',
      bankAccountId INTEGER, status TEXT DEFAULT 'paid',
      notes TEXT DEFAULT '', createdBy TEXT DEFAULT 'admin',
      createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (employeeId) REFERENCES employees(id)
    )`)
    console.log('[Migration] bank/employee tables ensured')
  } catch (e) {
    console.warn('[Migration] bank/employee tables skipped:', e)
  }
  // Ensure supplier_debts + payment history tables exist
  try {
    database.exec(`CREATE TABLE IF NOT EXISTS supplier_debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, supplierId INTEGER NOT NULL,
      amount REAL NOT NULL, paidAmount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL, description TEXT DEFAULT '',
      reference TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (supplierId) REFERENCES suppliers(id)
    )`)
    database.exec(`CREATE TABLE IF NOT EXISTS supplier_debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, debtId INTEGER NOT NULL,
      amount REAL NOT NULL, paymentDate TEXT NOT NULL,
      method TEXT DEFAULT 'cash', reference TEXT DEFAULT '',
      notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (debtId) REFERENCES supplier_debts(id)
    )`)
    console.log('[Migration] supplier_debts tables ensured')
  } catch (e) {
    console.warn('[Migration] supplier_debts creation skipped:', e)
  }
  // Ensure brands table exists for product brand organization
  try {
    database.exec(`CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )`)
    console.log('[Migration] brands table ensured')
  } catch (e) {
    console.warn('[Migration] brands table creation skipped:', e)
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function isFirstRun(): boolean {
  const db = getDatabase()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'isSetupComplete'").get() as { value: string } | undefined
  return !row || row.value !== 'true'
}

function initializeDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin_code TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier' CHECK(role IN ('admin', 'cashier')),
      permissions TEXT DEFAULT '{}',
      lastLoginAt TEXT DEFAULT '',
      lastActivityAt TEXT DEFAULT '',
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      imageBase64 TEXT DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      subcategory TEXT DEFAULT '',
      unit TEXT NOT NULL DEFAULT 'number' CHECK(unit IN ('number', 'weight')),
      purchase_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      stock REAL NOT NULL DEFAULT 0,
      minStock REAL NOT NULL DEFAULT 0,
      isLoose INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      isSellable INTEGER NOT NULL DEFAULT 1,
      has_expiry INTEGER NOT NULL DEFAULT 0,
      expiry_date TEXT DEFAULT '',
      expiry_alert_days INTEGER NOT NULL DEFAULT 30,
      last_alerted INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      brand_id INTEGER DEFAULT NULL,
      profit_percentage REAL DEFAULT 0,
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_title ON products(title);
    CREATE INDEX IF NOT EXISTS idx_products_isLoose ON products(isLoose);
    CREATE INDEX IF NOT EXISTS idx_products_expiry ON products(has_expiry, expiry_date);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      balance REAL NOT NULL DEFAULT 0,
      address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      customerType TEXT DEFAULT 'real',
      description TEXT DEFAULT '',
      imageBase64 TEXT DEFAULT '',
      totalSpent REAL DEFAULT 0,
      totalPurchases INTEGER DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT DEFAULT '',
      level INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      parent_id INTEGER DEFAULT NULL,
      createdAt TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT UNIQUE NOT NULL,
      userId INTEGER NOT NULL,
      customerId INTEGER,
      subtotal REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      totalNetProfit REAL NOT NULL DEFAULT 0,
      paymentMethod TEXT NOT NULL DEFAULT 'cash' CHECK(paymentMethod IN ('cash', 'card', 'ledger')),
      customerPaid REAL NOT NULL DEFAULT 0,
      changeAmount REAL NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      invoiceDescription TEXT DEFAULT '',
      manualCustomerName TEXT DEFAULT '',
      saleType TEXT DEFAULT 'in-person',
      saleDate TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      affectsInventory INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (customerId) REFERENCES customers(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sales_createdAt ON sales(createdAt);
    CREATE INDEX IF NOT EXISTS idx_sales_userId ON sales(userId);
    CREATE INDEX IF NOT EXISTS idx_sales_customerId ON sales(customerId);

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saleId INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      productTitle TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitPrice REAL NOT NULL,
      purchasePrice REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL,
      netProfit REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sale_items_saleId ON sale_items(saleId);

    -- Split/mixed payments for a single sale (e.g. cash + card-to-card + debt).
    -- sales.paymentMethod keeps the PRIMARY channel for backwards compatibility;
    -- the full breakdown lives here. One row per method used on the sale.
    CREATE TABLE IF NOT EXISTS sale_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saleId INTEGER NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('cash', 'card', 'card_to_card', 'ledger')),
      amount REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sale_payments_saleId ON sale_payments(saleId);

    CREATE TABLE IF NOT EXISTS customer_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL,
      saleId INTEGER,
      type TEXT NOT NULL CHECK(type IN ('charge', 'payment', 'sale', 'debt')),
      amount REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      images TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customerId) REFERENCES customers(id),
      FOREIGN KEY (saleId) REFERENCES sales(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_customerId ON customer_ledger(customerId);

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      imageBase64 TEXT DEFAULT '',
      images TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

    CREATE TABLE IF NOT EXISTS suspended_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      slotIndex INTEGER NOT NULL DEFAULT 0,
      items_json TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_suspended_user_slot ON suspended_invoices(userId, slotIndex);

    CREATE TABLE IF NOT EXISTS cash_register (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      openingBalance REAL NOT NULL DEFAULT 0,
      totalCashIn REAL NOT NULL DEFAULT 0,
      totalCashOut REAL NOT NULL DEFAULT 0,
      closingBalance REAL DEFAULT 0,
      isClosed INTEGER NOT NULL DEFAULT 0,
      closedAt TEXT,
      closedBy INTEGER,
      FOREIGN KEY (closedBy) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      userName TEXT DEFAULT '',
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId INTEGER,
      details TEXT,
      beforeValue TEXT,
      afterValue TEXT,
      ip TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entityType, entityId);
    CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(createdAt);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

    CREATE TABLE IF NOT EXISTS restore_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      dbPath TEXT NOT NULL,
      dbHash TEXT DEFAULT '',
      dbSize INTEGER DEFAULT 0,
      tablesIncluded TEXT DEFAULT 'all',
      createdBy TEXT DEFAULT 'admin',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_restore_points_createdAt ON restore_points(createdAt);

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saleId INTEGER,
      userId INTEGER,
      productId INTEGER,
      quantity INTEGER,
      reason TEXT,
      refundAmount REAL,
      status TEXT DEFAULT 'pending',
      isDamaged INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (saleId) REFERENCES sales(id),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(saleId);
    CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);

    CREATE TABLE IF NOT EXISTS fiscal_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      isClosed INTEGER NOT NULL DEFAULT 0,
      closedAt TEXT,
      closedBy INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (closedBy) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('asset', 'liability', 'equity', 'income', 'expense')),
      parentId INTEGER DEFAULT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      description TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (parentId) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
    CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(code);

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entryDate TEXT NOT NULL,
      description TEXT NOT NULL,
      referenceType TEXT,
      referenceId INTEGER,
      fiscalPeriodId INTEGER,
      isPosted INTEGER NOT NULL DEFAULT 1,
      createdBy INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (fiscalPeriodId) REFERENCES fiscal_periods(id),
      FOREIGN KEY (createdBy) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(entryDate);
    CREATE INDEX IF NOT EXISTS idx_journal_ref ON journal_entries(referenceType, referenceId);

    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entryId INTEGER NOT NULL,
      accountId INTEGER NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      FOREIGN KEY (entryId) REFERENCES journal_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (accountId) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_entry_lines(entryId);
    CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_entry_lines(accountId);

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL,
      priceType TEXT NOT NULL CHECK(priceType IN ('sale', 'purchase')),
      oldPrice REAL NOT NULL DEFAULT 0,
      newPrice REAL NOT NULL,
      changedBy TEXT DEFAULT 'system',
      changedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (productId) REFERENCES products(id)
    );
    CREATE INDEX IF NOT EXISTS idx_price_history_productId ON price_history(productId);

    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL,
      previousStock REAL NOT NULL,
      newStock REAL NOT NULL,
      adjustmentQty REAL NOT NULL,
      reason TEXT DEFAULT '',
      adjustmentType TEXT NOT NULL DEFAULT 'manual' CHECK(adjustmentType IN ('manual', 'reconciliation', 'damage', 'count', 'other')),
      createdBy TEXT DEFAULT 'admin',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (productId) REFERENCES products(id)
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_productId ON inventory_adjustments(productId);

    -- Cross-sell / mandatory product rules
    CREATE TABLE IF NOT EXISTS cross_sell_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      triggerType TEXT NOT NULL DEFAULT 'product' CHECK(triggerType IN ('product', 'category', 'price', 'quantity')),
      triggerValue TEXT NOT NULL DEFAULT '',
      triggerCondition TEXT DEFAULT '>=',
      triggerThreshold REAL DEFAULT 0,
      ruleType TEXT NOT NULL DEFAULT 'mandatory' CHECK(ruleType IN ('mandatory', 'optional', 'recommended')),
      priority INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdBy TEXT DEFAULT 'admin',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS cross_sell_rule_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ruleId INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      discountPercent REAL DEFAULT 0,
      FOREIGN KEY (ruleId) REFERENCES cross_sell_rules(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    -- Installment sales
    CREATE TABLE IF NOT EXISTS installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      installmentNumber TEXT UNIQUE NOT NULL,
      saleId INTEGER,
      customerId INTEGER,
      totalAmount REAL NOT NULL DEFAULT 0,
      downPayment REAL NOT NULL DEFAULT 0,
      installmentCount INTEGER NOT NULL DEFAULT 2,
      monthlyAmount REAL NOT NULL DEFAULT 0,
      penaltyPercent REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'overdue', 'cancelled')),
      startDate TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      notes TEXT DEFAULT '',
      createdBy TEXT DEFAULT 'admin',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (saleId) REFERENCES sales(id),
      FOREIGN KEY (customerId) REFERENCES customers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_installments_customerId ON installments(customerId);

    CREATE TABLE IF NOT EXISTS installment_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      installmentId INTEGER NOT NULL,
      installmentNumber INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      dueDate TEXT NOT NULL,
      paidDate TEXT DEFAULT NULL,
      penaltyAmount REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'overdue', 'partial')),
      notes TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (installmentId) REFERENCES installments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_installment_payments_installmentId ON installment_payments(installmentId);
    CREATE INDEX IF NOT EXISTS idx_installment_payments_dueDate ON installment_payments(dueDate);

    -- Proforma invoices
    CREATE TABLE IF NOT EXISTS proformas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proformaNumber TEXT UNIQUE NOT NULL,
      customerId INTEGER,
      userId INTEGER NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      totalAmount REAL NOT NULL DEFAULT 0,
      taxRate REAL DEFAULT 0,
      taxAmount REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'converted', 'expired')),
      validUntil TEXT NOT NULL,
      saleId INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customerId) REFERENCES customers(id),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (saleId) REFERENCES sales(id)
    );
    CREATE INDEX IF NOT EXISTS idx_proformas_status ON proformas(status);
    CREATE INDEX IF NOT EXISTS idx_proformas_customerId ON proformas(customerId);

    CREATE TABLE IF NOT EXISTS proforma_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proformaId INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      productTitle TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitPrice REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (proformaId) REFERENCES proformas(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    -- Warranty & Repair Service Management
    CREATE TABLE IF NOT EXISTS service_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticketNumber TEXT UNIQUE NOT NULL,
      customerId INTEGER,
      productId INTEGER,
      serialNumber TEXT DEFAULT '',
      warrantyClaim INTEGER NOT NULL DEFAULT 0,
      warrantyStartDate TEXT DEFAULT '',
      warrantyEndDate TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','diagnosing','awaiting_parts','in_repair','completed','returned','cancelled')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
      problemDescription TEXT DEFAULT '',
      diagnosis TEXT DEFAULT '',
      estimatedCompletion TEXT DEFAULT '',
      technician TEXT DEFAULT '',
      partsCost REAL DEFAULT 0,
      laborCost REAL DEFAULT 0,
      shippingCost REAL DEFAULT 0,
      totalCost REAL DEFAULT 0,
      customerNotified INTEGER DEFAULT 0,
      userId INTEGER DEFAULT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customerId) REFERENCES customers(id),
      FOREIGN KEY (productId) REFERENCES products(id)
    );
    CREATE INDEX IF NOT EXISTS idx_service_tickets_customerId ON service_tickets(customerId);
    CREATE INDEX IF NOT EXISTS idx_service_tickets_status ON service_tickets(status);

    CREATE TABLE IF NOT EXISTS service_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticketId INTEGER NOT NULL,
      partName TEXT NOT NULL,
      partNumber TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      unitCost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (ticketId) REFERENCES service_tickets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS service_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticketId INTEGER NOT NULL,
      fromStatus TEXT DEFAULT '',
      toStatus TEXT NOT NULL,
      note TEXT DEFAULT '',
      changedBy TEXT DEFAULT 'admin',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (ticketId) REFERENCES service_tickets(id) ON DELETE CASCADE
    );

    -- Customer Credit Management
    CREATE TABLE IF NOT EXISTS customer_credit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER UNIQUE NOT NULL,
      creditLimit REAL NOT NULL DEFAULT 0,
      currentDebt REAL NOT NULL DEFAULT 0,
      creditScore INTEGER NOT NULL DEFAULT 100,
      isBlocked INTEGER NOT NULL DEFAULT 0,
      blockReason TEXT DEFAULT '',
      blockType TEXT DEFAULT '' CHECK(blockType IN ('','credit','fraud','inactive','other')),
      blockedAt TEXT DEFAULT NULL,
      blockedBy TEXT DEFAULT NULL,
      unblockRequested INTEGER NOT NULL DEFAULT 0,
      unblockNote TEXT DEFAULT '',
      lastPaymentDate TEXT DEFAULT NULL,
      paymentDelayDays INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customerId) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS credit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('block','unblock','limit_change','payment','score_change')),
      oldValue TEXT DEFAULT '',
      newValue TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      performedBy TEXT DEFAULT 'admin',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (customerId) REFERENCES customers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_credit_history_customerId ON credit_history(customerId);

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      company TEXT DEFAULT '',
      taxId TEXT DEFAULT '',
      balance REAL NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
    CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone);

    CREATE TABLE IF NOT EXISTS supplier_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierId INTEGER NOT NULL,
      purchaseId INTEGER,
      type TEXT NOT NULL CHECK(type IN ('purchase', 'payment', 'return', 'debt', 'adjustment')),
      amount REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (supplierId) REFERENCES suppliers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplierId ON supplier_ledger(supplierId);

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT UNIQUE NOT NULL,
      supplierId INTEGER NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      taxAmount REAL NOT NULL DEFAULT 0,
      discountAmount REAL NOT NULL DEFAULT 0,
      totalAmount REAL NOT NULL DEFAULT 0,
      paidAmount REAL NOT NULL DEFAULT 0,
      paymentMethod TEXT NOT NULL DEFAULT 'credit' CHECK(paymentMethod IN ('cash', 'credit', 'partial')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'received', 'invoiced', 'paid')),
      notes TEXT DEFAULT '',
      purchaseDate TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (supplierId) REFERENCES suppliers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_purchases_supplierId ON purchases(supplierId);
    CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchaseDate);

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchaseId INTEGER NOT NULL,
      productId INTEGER NOT NULL,
      productTitle TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitCost REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (purchaseId) REFERENCES purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id)
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchaseId ON purchase_items(purchaseId);
  `)

  const defaults: Record<string, string> = {
    storeName: 'فروشگاه من',
    storeAddress: '',
    storePhone: '',
    receiptFooter: 'با تشکر از خرید شما',
    currency: 'تومان',
    autoRounding: '500',
    isSetupComplete: 'false',
  }
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(defaults)) {
    insert.run(k, v)
  }

  // Seed chart of accounts if empty
  const accountCount = (db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number }).count
  if (accountCount === 0) {
    const insertAccount = db.prepare('INSERT INTO accounts (code, name, type, parentId) VALUES (?, ?, ?, ?)')
    const accounts: [string, string, string, number | null][] = [
      ['1000', 'دارایی\u200cهای جاری', 'asset', null],
      ['1100', 'صندوق نقدی', 'asset', null],
      ['1200', 'بانک', 'asset', null],
      ['1300', 'موجودی کالا', 'asset', null],
      ['1400', 'حساب\u200cهای دریافتنی', 'asset', null],
      ['2000', 'بدهی\u200cهای جاری', 'liability', null],
      ['2100', 'حساب\u200cهای پرداختنی', 'liability', null],
      ['3000', 'سرمایه', 'equity', null],
      ['3100', 'سرمایه صاحب کسب\u200cوکار', 'equity', null],
      ['3200', 'سود انباشته', 'equity', null],
      ['4000', 'درآمدها', 'income', null],
      ['4100', 'فروش کالا', 'income', null],
      ['5000', 'بهای تمام شده کالا', 'expense', null],
      ['5100', 'بهای تمام شده فروش', 'expense', null],
      ['6000', 'هزینه\u200cهای عملیاتی', 'expense', null],
      ['6100', 'اجاره', 'expense', null],
      ['6200', 'قبوض', 'expense', null],
      ['6300', 'حقوق و دستمزد', 'expense', null],
      ['6400', 'لوازم و ملزومات', 'expense', null],
      ['6500', 'تعمیرات', 'expense', null],
      ['6600', 'حمل\u200cونقل', 'expense', null],
      ['6700', 'سایر هزینه\u200cها', 'expense', null],
    ]
    const seedAccounts = db.transaction(() => {
      const ids: Record<string, number> = {}
      for (const [code, name, type, _parent] of accounts) {
        const r = insertAccount.run(code, name, type, null)
        ids[code] = r.lastInsertRowid as number
      }
      const updateParent = db.prepare('UPDATE accounts SET parentId = ? WHERE id = ?')
      updateParent.run(ids['1000'], ids['1100'])
      updateParent.run(ids['1000'], ids['1200'])
      updateParent.run(ids['1000'], ids['1300'])
      updateParent.run(ids['1000'], ids['1400'])
      updateParent.run(ids['2000'], ids['2100'])
      updateParent.run(ids['3000'], ids['3100'])
      updateParent.run(ids['3000'], ids['3200'])
      updateParent.run(ids['4000'], ids['4100'])
      updateParent.run(ids['5000'], ids['5100'])
      updateParent.run(ids['6000'], ids['6100'])
      updateParent.run(ids['6000'], ids['6200'])
      updateParent.run(ids['6000'], ids['6300'])
      updateParent.run(ids['6000'], ids['6400'])
      updateParent.run(ids['6000'], ids['6500'])
      updateParent.run(ids['6000'], ids['6600'])
      updateParent.run(ids['6000'], ids['6700'])
    })
    seedAccounts()

    // Seed supplier accounts if missing
    const supplierAccountExists = db.prepare("SELECT COUNT(*) as c FROM accounts WHERE code = '2110'").get() as { c: number }
    if (supplierAccountExists.c === 0) {
      const insertAccount = db.prepare('INSERT INTO accounts (code, name, type, parentId) VALUES (?, ?, ?, ?)')
      const supplierAccounts: [string, string, string, number | null][] = [
        ['2110', 'حساب\u200cهای پرداختنی تأمین\u200cکنندگان', 'liability', null],
        ['5200', 'هزینه خرید کالا', 'expense', null],
        ['5300', 'تخفیف دریافتی خرید', 'income', null],
        ['1310', 'پیش\u200cپرداخت تأمین\u200cکنندگان', 'asset', null],
      ]
      for (const [code, name, type, pid] of supplierAccounts) {
        insertAccount.run(code, name, type, pid)
      }
    }
  }
}
