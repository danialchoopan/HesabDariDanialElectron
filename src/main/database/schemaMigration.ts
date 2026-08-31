/**
 * Schema Migration — handles incremental database schema upgrades.
 *
 * On every startup:
 *   1. Read current schema_version from settings table
 *   2. Compare against CURRENT_VERSION
 *   3. Run pending migrations in order
 *   4. Record each migration in migration_history table
 *   5. Update schema_version setting
 *
 * Each migration is an atomic transaction with rollback on failure.
 * Pre-migration backup is created automatically.
 */

import { getDatabase } from './connection'
import { createBackup } from './backup'

// Tracked schema version. Mirrors the app release that introduced the latest
// schema change so that the "downgrade" guard (db schema > installed app) works.
const CURRENT_VERSION = '1.11.0'

// Expose for external use
export { CURRENT_VERSION }

interface Migration {
  version: string
  description: string
  up: (db: any) => void
  down: (db: any) => void
}

/**
 * All migration scripts in order.
 * Each migration transforms the schema from the previous version.
 */
const MIGRATIONS: Migration[] = [
  {
    version: '1.0.0',
    description: 'Initial baseline schema',
    up: () => {},
    down: () => {},
  },
  {
    version: '1.1.0',
    description: 'Add subcategory and isSellable to products',
    up: (db) => {
      const cols = db.prepare('PRAGMA table_info(products)').all().map((c: any) => c.name)
      if (!cols.includes('subcategory')) db.exec("ALTER TABLE products ADD COLUMN subcategory TEXT DEFAULT ''")
      if (!cols.includes('isSellable')) db.exec("ALTER TABLE products ADD COLUMN isSellable INTEGER DEFAULT 1")
    },
    down: (_db) => {
      // SQLite does not support DROP COLUMN, so we skip rollback
    },
  },
  {
    version: '1.2.0',
    description: 'Add saleDate and affectsInventory to sales',
    up: (db) => {
      const cols = db.prepare('PRAGMA table_info(sales)').all().map((c: any) => c.name)
      if (!cols.includes('saleDate')) db.exec("ALTER TABLE sales ADD COLUMN saleDate TEXT DEFAULT datetime('now', 'localtime')")
      if (!cols.includes('affectsInventory')) db.exec("ALTER TABLE sales ADD COLUMN affectsInventory INTEGER DEFAULT 1")
    },
    down: () => {},
  },
  {
    version: '1.3.0',
    description: 'Add inventory adjustments and customer blocking',
    up: (db) => {
      const cols = db.prepare('PRAGMA table_info(customers)').all().map((c: any) => c.name)
      if (!cols.includes('is_blocked')) db.exec("ALTER TABLE customers ADD COLUMN is_blocked INTEGER DEFAULT 0")
    },
    down: () => {},
  },
  {
    version: '1.4.0',
    description: 'Add cross_sell_rules, installments, proformas, service_tickets, customer_credit tables',
    up: () => {},
    down: () => {},
  },
  {
    version: '1.5.0',
    description: 'Add RBAC roles, enhanced audit log, and restore points',
    up: (db) => {
      const cols = db.prepare('PRAGMA table_info(users)').all().map((c: any) => c.name)
      if (!cols.includes('permissions')) db.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '{}'")
      if (!cols.includes('lastLoginAt')) db.exec("ALTER TABLE users ADD COLUMN lastLoginAt TEXT DEFAULT ''")
      if (!cols.includes('lastActivityAt')) db.exec("ALTER TABLE users ADD COLUMN lastActivityAt TEXT DEFAULT ''")

      const auditCols = db.prepare('PRAGMA table_info(audit_log)').all().map((c: any) => c.name)
      if (!auditCols.includes('userName')) db.exec("ALTER TABLE audit_log ADD COLUMN userName TEXT DEFAULT ''")
      if (!auditCols.includes('beforeValue')) db.exec("ALTER TABLE audit_log ADD COLUMN beforeValue TEXT DEFAULT ''")
      if (!auditCols.includes('afterValue')) db.exec("ALTER TABLE audit_log ADD COLUMN afterValue TEXT DEFAULT ''")
      if (!auditCols.includes('ip')) db.exec("ALTER TABLE audit_log ADD COLUMN ip TEXT DEFAULT ''")
    },
    down: () => {},
  },
  {
    version: '1.6.0',
    description: 'Add isDamaged flag to returns for loss vs return distinction',
    up: (db) => {
      const cols = db.prepare('PRAGMA table_info(returns)').all().map((c: any) => c.name)
      if (!cols.includes('isDamaged')) db.exec("ALTER TABLE returns ADD COLUMN isDamaged INTEGER DEFAULT 0")
    },
    down: () => {},
  },
  {
    version: '1.7.0',
    description: 'Add brands table, brand_id and profit_percentage to products',
    up: (db) => {
      db.exec("CREATE TABLE IF NOT EXISTS brands (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', isActive INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')))")
      const prodCols = db.prepare('PRAGMA table_info(products)').all().map((c: any) => c.name)
      if (!prodCols.includes('brand_id')) db.exec("ALTER TABLE products ADD COLUMN brand_id INTEGER DEFAULT NULL")
      if (!prodCols.includes('profit_percentage')) db.exec("ALTER TABLE products ADD COLUMN profit_percentage REAL DEFAULT 0")
    },
    down: () => {},
  },
  {
    version: '1.8.0',
    description: 'Add supplier_ledger table for supplier debt management',
    up: (db) => {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='supplier_ledger'").get()
      if (!exists) {
        db.exec(`CREATE TABLE IF NOT EXISTS supplier_ledger (
          id INTEGER PRIMARY KEY AUTOINCREMENT, supplierId INTEGER NOT NULL,
          purchaseId INTEGER, type TEXT NOT NULL DEFAULT 'payment',
          amount REAL NOT NULL DEFAULT 0, description TEXT DEFAULT '',
          createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          FOREIGN KEY (supplierId) REFERENCES suppliers(id)
        )`)
      }
    },
    down: () => {},
  },
  {
    version: '1.9.0',
    description: 'Add shipping_cost to sales, supplier_debts table, business address settings',
    up: (db) => {
      // Shipping cost columns on sales for online order delivery fees
      const salesCols = db.prepare('PRAGMA table_info(sales)').all().map((c: any) => c.name)
      if (!salesCols.includes('shipping_cost')) db.exec('ALTER TABLE sales ADD COLUMN shipping_cost REAL DEFAULT 0')
      if (!salesCols.includes('shipping_tax')) db.exec('ALTER TABLE sales ADD COLUMN shipping_tax REAL DEFAULT 0')
      if (!salesCols.includes('shipping_provider')) db.exec("ALTER TABLE sales ADD COLUMN shipping_provider TEXT DEFAULT ''")
      if (!salesCols.includes('tracking_number')) db.exec("ALTER TABLE sales ADD COLUMN tracking_number TEXT DEFAULT ''")
      // Supplier debt tracking tables (debt records + payment history)
      db.exec(`CREATE TABLE IF NOT EXISTS supplier_debts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, supplierId INTEGER NOT NULL,
        amount REAL NOT NULL, paidAmount REAL NOT NULL DEFAULT 0,
        date TEXT NOT NULL, description TEXT DEFAULT '',
        reference TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (supplierId) REFERENCES suppliers(id)
      )`)
      db.exec(`CREATE TABLE IF NOT EXISTS supplier_debt_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, debtId INTEGER NOT NULL,
        amount REAL NOT NULL, paymentDate TEXT NOT NULL,
        method TEXT DEFAULT 'cash', reference TEXT DEFAULT '',
        notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (debtId) REFERENCES supplier_debts(id)
      )`)
    },
    down: () => {},
  },
  {
    version: '1.10.0',
    description: 'Add bank_accounts, bank_transactions, employees, salary_payments tables',
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, account_number TEXT DEFAULT '',
        bank_name TEXT DEFAULT '', branch TEXT DEFAULT '', account_type TEXT DEFAULT 'current',
        initial_balance REAL DEFAULT 0, current_balance REAL DEFAULT 0, currency TEXT DEFAULT 'IRR',
        iban TEXT DEFAULT '', swift_code TEXT DEFAULT '', status TEXT DEFAULT 'active',
        notes TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      )`)
      db.exec(`CREATE TABLE IF NOT EXISTS bank_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, bankAccountId INTEGER NOT NULL,
        transactionDate TEXT NOT NULL, description TEXT DEFAULT '',
        type TEXT NOT NULL DEFAULT 'deposit', amount REAL NOT NULL DEFAULT 0,
        balanceAfter REAL DEFAULT 0, reference TEXT DEFAULT '',
        relatedTo TEXT DEFAULT '', status TEXT DEFAULT 'cleared',
        notes TEXT DEFAULT '', createdBy TEXT DEFAULT 'admin',
        createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (bankAccountId) REFERENCES bank_accounts(id)
      )`)
      db.exec(`CREATE TABLE IF NOT EXISTS employees (
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
      db.exec(`CREATE TABLE IF NOT EXISTS salary_payments (
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
    },
    down: () => {},
  },
  {
    version: '1.11.0',
    description: 'Relax customer_ledger type CHECK (allow debt) — release 1.11.0',
    up: (db) => {
      // Older installs created customer_ledger with CHECK(type IN ('charge','payment','sale')).
      // Recreate it to also allow 'debt' ledger entries (used by the customer credit flow).
      try {
        const ddlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='customer_ledger'").get() as { sql?: string } | undefined
        const ddl = ddlRow?.sql || ''
        if (ddl && !ddl.includes("'debt'") && ddl.includes('CHECK')) {
          db.exec(`
            CREATE TABLE customer_ledger_new (
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
            )
          `)
          db.exec(`INSERT INTO customer_ledger_new (id, customerId, saleId, type, amount, description, images, createdAt)
                   SELECT id, customerId, saleId, type, amount, description, images, createdAt FROM customer_ledger`)
          db.exec('DROP TABLE customer_ledger')
          db.exec('ALTER TABLE customer_ledger_new RENAME TO customer_ledger')
          db.exec('CREATE INDEX IF NOT EXISTS idx_ledger_customerId ON customer_ledger(customerId)')
        }
      } catch (e) {
        console.warn('[Migration] customer_ledger constraint relax failed:', e)
      }
    },
    down: () => {},
  },
]

/**
 * Numeric semver comparison (a/b may contain leading 'v' or partial segments).
 * 1.10.0 > 1.9.0 → true. Returns 1 | -1 | 0.
 */
export function compareVersions(a: string, b: string): number {
  const clean = (v: string) => v.replace(/^v/i, '').split('-')[0]
  const pa = clean(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = clean(b).split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

/** Get current schema version from settings table. */
export function getSchemaVersion(): string {
  const db = getDatabase()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'schemaVersion'").get() as { value: string } | undefined
  return row?.value || '0.0.0'
}

/** Set schema version in settings table. */
function setSchemaVersion(version: string): void {
  const db = getDatabase()
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', ?)").run(version)
}

/** Get all pending migrations from current version to latest. */
function getPendingMigrations(): Migration[] {
  const current = getSchemaVersion()
  return MIGRATIONS.filter(m => compareVersions(m.version, current) > 0)
}

/**
 * Run all pending migrations. Creates a backup before starting.
 * Returns { success, applied, errors }.
 */
export function runMigrations(): { success: boolean; applied: string[]; errors: string[] } {
  const db = getDatabase()
  // Ensure migration_history table exists before running any migrations
  db.exec(`CREATE TABLE IF NOT EXISTS migration_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fromVersion TEXT NOT NULL,
    toVersion TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'applied',
    errorMessage TEXT DEFAULT '',
    createdAt TEXT DEFAULT (datetime('now', 'localtime'))
  )`)

  const pending = getPendingMigrations()
  if (pending.length === 0) {
    // Nothing to do, but make sure the version is recorded (fresh DBs that were
    // created with the full schema already in place still need a version marker).
    if (!db.prepare("SELECT value FROM settings WHERE key = 'schemaVersion'").get()) {
      setSchemaVersion(CURRENT_VERSION)
    }
    return { success: true, applied: [], errors: [] }
  }

  const applied: string[] = []
  const errors: string[] = []

  // Pre-migration backup
  try {
    createBackup('pre-migration')
  } catch (e) {
    console.warn('[Migration] Pre-backup failed:', e)
  }

  for (const migration of pending) {
    try {
      console.log(`[Migration] Running ${migration.version}: ${migration.description}`)
      db.transaction(() => { migration.up(db) })()

      // Record in migration_history
      db.prepare(`INSERT INTO migration_history (fromVersion, toVersion, description, status) VALUES (?, ?, ?, 'applied')`)
        .run(getSchemaVersion(), migration.version, migration.description)

      setSchemaVersion(migration.version)
      applied.push(migration.version)
      console.log(`[Migration] ${migration.version} applied successfully`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${migration.version}: ${msg}`)
      console.error(`[Migration] ${migration.version} FAILED:`, msg)

      // Record failure
      try {
        db.prepare(`INSERT INTO migration_history (fromVersion, toVersion, description, status, errorMessage) VALUES (?, ?, ?, 'failed', ?)`)
          .run(getSchemaVersion(), migration.version, migration.description, msg)
      } catch {}

      break // Stop on first failure
    }
  }

  return { success: errors.length === 0, applied, errors }
}

/**
 * Dry-run: check what migrations would be applied without actually running them.
 */
export function dryRunMigrations(): { currentVersion: string; pending: { version: string; description: string }[]; wouldNeedBackup: boolean } {
  const current = getSchemaVersion()
  const pending = getPendingMigrations()
  return {
    currentVersion: current,
    pending: pending.map(m => ({ version: m.version, description: m.description })),
    wouldNeedBackup: pending.length > 0,
  }
}

/**
 * Get migration history from the migration_history table.
 */
export function getMigrationHistory(): any[] {
  const db = getDatabase()
  // Ensure table exists
  db.exec(`CREATE TABLE IF NOT EXISTS migration_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fromVersion TEXT NOT NULL,
    toVersion TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'applied',
    errorMessage TEXT DEFAULT '',
    createdAt TEXT DEFAULT (datetime('now', 'localtime'))
  )`)
  return db.prepare('SELECT * FROM migration_history ORDER BY id ASC').all()
}

/**
 * Validate database integrity after migration.
 * NOTE: better-sqlite3 pragma() returns an ARRAY of { ... } rows for
 * integrity_check / foreign_key_check, not a single object.
 */
export function validateAfterMigration(): { valid: boolean; issues: string[] } {
  const db = getDatabase()
  const issues: string[] = []

  try {
    const rows = db.pragma('integrity_check') as unknown
    const check = Array.isArray(rows) ? rows[0] : rows as any
    const result = check && typeof check === 'object' ? check.integrity_check : String(rows)
    if (result !== 'ok') issues.push(`Integrity check failed: ${result}`)
  } catch (e) { issues.push(`Integrity check error: ${e}`) }

  try {
    const rows = db.pragma('foreign_key_check') as unknown
    const violations = Array.isArray(rows) ? rows.length : ((rows as any)?.length ?? 0)
    if (violations > 0) issues.push(`${violations} foreign key violations`)
  } catch (e) { issues.push(`Foreign key check error: ${e}`) }

  // Check critical tables exist
  const requiredTables = ['users', 'products', 'customers', 'sales', 'accounts', 'settings', 'audit_log']
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  const tableNames = new Set(tables.map(t => t.name))
  for (const t of requiredTables) {
    if (!tableNames.has(t)) issues.push(`Missing table: ${t}`)
  }

  return { valid: issues.length === 0, issues }
}
