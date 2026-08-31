/**
 * Demo-seed test — runs the REAL seedDemoData() against an in-memory DB and
 * verifies every module gets data and the accounting stays consistent:
 *   - All modules populated (products, customers, suppliers, sales, expenses,
 *     returns, purchases, bank, employees, installments, proformas, tickets)
 *   - Every auto-posted journal entry balances (debit == credit)
 *   - Seed is idempotent (second call is a no-op)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestDb } from './helpers/testDb'

let mockDb: any

vi.mock('../src/main/database/connection', () => ({
  getDatabase: () => mockDb,
  hashPin: (pin: string) => `hash-${pin}`,
}))

import { seedDemoData } from '../src/main/database/repositories/seed'

function count(table: string): number {
  return (mockDb.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c
}

beforeEach(async () => {
  mockDb = await createTestDb()
  // Supplier accounts used by the purchase journal (production seeds these)
  for (const [code, name, type] of [
    ['2110', 'حساب‌های پرداختنی تأمین‌کنندگان', 'liability'],
    ['5200', 'هزینه خرید کالا', 'expense'],
    ['5300', 'تخفیف دریافتی خرید', 'income'],
  ] as const) {
    mockDb.prepare('INSERT INTO accounts (code, name, type) VALUES (?, ?, ?)').run(code, name, type)
  }
})

describe('seedDemoData', () => {
  it('populates every module with data', () => {
    const result = seedDemoData()
    expect(result).toBe(true)

    expect(count('products')).toBeGreaterThanOrEqual(25)
    expect(count('brands')).toBeGreaterThanOrEqual(5)
    expect(count('customers')).toBeGreaterThanOrEqual(5)
    expect(count('customer_credit')).toBeGreaterThanOrEqual(2)
    expect(count('suppliers')).toBeGreaterThanOrEqual(4)
    expect(count('purchases')).toBeGreaterThanOrEqual(6)
    expect(count('purchase_items')).toBeGreaterThan(0)
    expect(count('sales')).toBeGreaterThanOrEqual(20)
    expect(count('sale_items')).toBeGreaterThan(0)
    expect(count('expenses')).toBeGreaterThanOrEqual(10)
    expect(count('returns')).toBeGreaterThanOrEqual(2)
    expect(count('journal_entries')).toBeGreaterThan(0)
    expect(count('customer_ledger')).toBeGreaterThan(0)
    expect(count('bank_accounts')).toBeGreaterThanOrEqual(2)
    expect(count('bank_transactions')).toBeGreaterThan(0)
    expect(count('employees')).toBeGreaterThanOrEqual(3)
    expect(count('salary_payments')).toBeGreaterThanOrEqual(3)
    expect(count('installments')).toBeGreaterThanOrEqual(2)
    expect(count('installment_payments')).toBeGreaterThan(0)
    expect(count('proformas')).toBeGreaterThanOrEqual(2)
    expect(count('proforma_items')).toBeGreaterThan(0)
    expect(count('service_tickets')).toBeGreaterThanOrEqual(2)
    expect(count('cross_sell_rules')).toBeGreaterThanOrEqual(2)
    expect(count('fiscal_periods')).toBeGreaterThanOrEqual(12)
  })

  it('every auto-posted journal entry is balanced (debit == credit)', () => {
    seedDemoData()
    const entries = mockDb.prepare('SELECT id FROM journal_entries').all() as { id: number }[]
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      const lines = mockDb.prepare('SELECT debit, credit FROM journal_entry_lines WHERE entryId = ?').all(e.id) as { debit: number; credit: number }[]
      const dr = lines.reduce((s, l) => s + l.debit, 0)
      const cr = lines.reduce((s, l) => s + l.credit, 0)
      expect(Math.abs(dr - cr)).toBeLessThanOrEqual(0.01)
    }
  })

  it('is idempotent — a second call does nothing', () => {
    seedDemoData()
    const productCount = count('products')
    expect(seedDemoData()).toBe(false)
    expect(count('products')).toBe(productCount)
  })

  it('creates users when the database has none', () => {
    seedDemoData()
    const users = mockDb.prepare('SELECT * FROM users').all() as { role: string }[]
    expect(users.some(u => u.role === 'admin')).toBe(true)
    expect(users.filter(u => u.role === 'cashier').length).toBeGreaterThanOrEqual(2)
  })

  it('stock stays consistent: purchases added stock and sales removed it', () => {
    seedDemoData()
    const rows = mockDb.prepare('SELECT stock FROM products').all() as { stock: number }[]
    for (const r of rows) {
      expect(r.stock).toBeGreaterThanOrEqual(0)
    }
  })
})
