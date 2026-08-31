/**
 * Migration robustness tests — verifies the versioned schema migration system
 * used by schemaMigration.ts actually behaves correctly across upgrades:
 *   - Numeric (semver) version comparison (1.10.0 > 1.9.0)
 *   - Pending-migration detection from any prior version
 *   - runMigrations applies the right set and records history
 *   - validateAfterMigration correctly reads pragma() results (array form)
 *   - customer_ledger CHECK constraint is relaxed so 'debt' entries insert
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestDb } from './helpers/testDb'

let mockDb: any

vi.mock('../src/main/database/backup', () => ({
  createBackup: vi.fn(() => ({ success: true })),
}))

vi.mock('../src/main/database/connection', () => ({
  getDatabase: () => mockDb,
}))

import {
  runMigrations, getSchemaVersion, compareVersions, dryRunMigrations,
  getMigrationHistory, validateAfterMigration, CURRENT_VERSION,
} from '../src/main/database/schemaMigration'

beforeEach(async () => {
  mockDb = await createTestDb()
  mockDb.prepare('INSERT INTO users (name, pin_code, role) VALUES (?, ?, ?)').run('Admin', '1234', 'admin')
})

function setSchemaVersion(v: string) {
  mockDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('schemaVersion', v)
}

function getSchemaVersionSetting(): string | undefined {
  const r = mockDb.prepare("SELECT value FROM settings WHERE key = 'schemaVersion'").get()
  return r?.value
}

describe('compareVersions (numeric semver)', () => {
  it('orders 1.10.0 above 1.9.0 (string comparison would fail)', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1)
  })

  it('handles equal and v-prefixed versions', () => {
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0)
    expect(compareVersions('v1.2.0', '1.2.0')).toBe(0)
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('2.0.0', '1.11.0')).toBe(1)
  })

  it('rejects pre-release suffixes sensibly', () => {
    expect(compareVersions('1.11.0-beta', '1.11.0')).toBe(0)
  })
})

describe('runMigrations', () => {
  it('records schemaVersion after a fresh install', () => {
    expect(getSchemaVersion()).toBe('0.0.0') // nothing seeded yet
    const res = runMigrations()
    expect(res.success).toBe(true)
    expect(res.errors).toEqual([])
    expect(getSchemaVersion()).toBe(CURRENT_VERSION)
    expect(res.applied).toContain('1.10.0')
    expect(res.applied).toContain('1.11.0')
  })

  it('a DB at 1.9.0 gets 1.10.0 and 1.11.0 (regression: string compare skipped 1.10.0)', () => {
    setSchemaVersion('1.9.0')
    const res = runMigrations()
    expect(res.applied).toContain('1.10.0')
    expect(res.applied).toContain('1.11.0')
    expect(getSchemaVersion()).toBe('1.11.0')
    // bank tables must exist after migration
    const bank = mockDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bank_accounts'").get()
    expect(bank).toBeTruthy()
  })

  it('a DB at current version is a no-op and keeps the version marker', () => {
    setSchemaVersion(CURRENT_VERSION)
    const res = runMigrations()
    expect(res.applied).toEqual([])
    expect(getSchemaVersion()).toBe(CURRENT_VERSION)
  })

  it('records migration history entries', () => {
    setSchemaVersion('1.8.0')
    runMigrations()
    const history = getMigrationHistory()
    const versions = history.map((h: any) => h.toVersion)
    expect(versions).toContain('1.9.0')
    expect(versions).toContain('1.10.0')
    expect(versions).toContain('1.11.0')
    const appliedRows = history.filter((h: any) => h.status === 'applied')
    expect(appliedRows.length).toBeGreaterThanOrEqual(3)
  })
})

describe('dryRunMigrations', () => {
  it('reports pending migrations from an older version', () => {
    setSchemaVersion('1.8.0')
    const dry = dryRunMigrations()
    expect(dry.currentVersion).toBe('1.8.0')
    expect(dry.pending.map((p: any) => p.version)).toEqual(['1.9.0', '1.10.0', '1.11.0'])
    expect(dry.wouldNeedBackup).toBe(true)
  })
})

describe('validateAfterMigration', () => {
  it('returns valid for a healthy migrated database', () => {
    runMigrations()
    const v = validateAfterMigration()
    expect(v.valid).toBe(true)
    expect(v.issues).toEqual([])
  })

  it('detects a missing critical table', () => {
    runMigrations()
    mockDb.exec('DROP TABLE audit_log')
    const v = validateAfterMigration()
    expect(v.valid).toBe(false)
    expect(v.issues.some((i: string) => i.includes('audit_log'))).toBe(true)
  })
})

describe('customer_ledger CHECK relaxation', () => {
  it('recreates customer_ledger so "debt" entries insert after migration', () => {
    // Simulate an OLD database with the restrictive CHECK constraint
    mockDb.exec('DROP TABLE customer_ledger')
    mockDb.exec(`CREATE TABLE customer_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL,
      saleId INTEGER,
      type TEXT NOT NULL CHECK(type IN ('charge', 'payment', 'sale')),
      amount REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      images TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT ''
    )`)
    mockDb.prepare('INSERT INTO customer_ledger (customerId, type, amount, description) VALUES (?, ?, ?, ?)')
      .run(1, 'sale', 100, 'legacy')
    setSchemaVersion('1.10.0')

    const res = runMigrations()
    expect(res.errors).toEqual([])

    // The legacy row survived the table rebuild
    const rows = mockDb.prepare('SELECT * FROM customer_ledger').all()
    expect(rows.length).toBe(1)
    expect(rows[0].description).toBe('legacy')

    // And 'debt' entries now insert without a CHECK failure
    const insert = mockDb.prepare("INSERT INTO customer_ledger (customerId, type, amount, description) VALUES (?, 'debt', ?, ?)")
      .run(1, 500, 'بدهی جدید')
    expect(insert.changes).toBe(1)
  })
})
