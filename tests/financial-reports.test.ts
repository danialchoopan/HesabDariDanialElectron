/**
 * Financial report math verification — runs the REAL reports repository against
 * an in-memory DB and checks the accounting identities hold after real
 * transactions (sales, expenses, purchases):
 *   - P&L: revenue − COGS − operating expenses == net profit
 *   - Balance sheet: assets == liabilities + equity (fundamental identity)
 *   - A/R aging buckets sum to the customer's total debt
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestDb } from './helpers/testDb'

let mockDb: any

vi.mock('../src/main/database/connection', () => ({
  getDatabase: () => mockDb,
}))

import * as sales from '../src/main/database/repositories/sales'
import * as expenses from '../src/main/database/repositories/expenses'
import * as purchases from '../src/main/database/repositories/purchases'
import * as reports from '../src/main/database/repositories/reports'

function setRounding(v: number) {
  mockDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoRounding', String(v))
}

function makeSale(customerId: number | null, method: 'cash' | 'ledger' = 'cash', amount = 500, qty = 1) {
  return sales.createSale({
    userId: 1, customerId,
    items: [{ productId: 1, productTitle: 'Widget', quantity: qty, unitPrice: amount, purchasePrice: 300 }],
    paymentMethod: method, customerPaid: method === 'cash' ? amount : 0,
    saleDate: '2026-07-05 12:00:00',
  })
}

beforeEach(async () => {
  mockDb = await createTestDb()
  for (const [code, name, type] of [
    ['2110', 'حساب‌های پرداختنی تأمین‌کنندگان', 'liability'],
    ['5200', 'هزینه خرید کالا', 'expense'],
    ['5300', 'تخفیف دریافتی خرید', 'income'],
  ] as const) {
    mockDb.prepare('INSERT INTO accounts (code, name, type) VALUES (?, ?, ?)').run(code, name, type)
  }
  mockDb.prepare('INSERT INTO users (name, pin_code, role) VALUES (?, ?, ?)').run('Admin', '1234', 'admin')
  mockDb.prepare('INSERT INTO products (title, category, purchase_price, sale_price, stock, unit) VALUES (?, ?, ?, ?, ?, ?)').run('Widget', 'Goods', 300, 500, 100, 'number')
  mockDb.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run('Ahmad', '0912')
  mockDb.prepare('INSERT INTO suppliers (name, phone) VALUES (?, ?)').run('Supplier Co', '0987')
  setRounding(0)
})

describe('generateProfitLoss', () => {
  it('computes revenue, COGS, gross profit, and net profit for a cash sale', () => {
    makeSale(null, 'cash', 500, 3)
    const pl = reports.generateProfitLoss()
    expect(pl.totalRevenue).toBe(1500)   // 3 × 500
    expect(pl.totalCogs).toBe(900)       // 3 × 300
    expect(pl.grossProfit).toBe(600)     // 1500 − 900
    expect(pl.totalOperatingExpenses).toBe(0)
    expect(pl.netProfit).toBe(600)
  })

  it('subtracts operating expenses from net profit', () => {
    makeSale(null, 'cash', 500, 2)                 // rev 1000, cogs 600 → GP 400
    expenses.createExpense({ category: 'اجاره', description: 'اجاره', amount: 250, date: '2026-07-06' })
    const pl = reports.generateProfitLoss()
    expect(pl.totalRevenue).toBe(1000)
    expect(pl.totalCogs).toBe(600)
    expect(pl.totalOperatingExpenses).toBe(250)
    expect(pl.netProfit).toBe(150)                 // 1000 − 600 − 250
  })

  it('is unaffected by purchases (they capitalize into inventory, not P&L)', () => {
    purchases.createPurchase({
      supplierId: 1,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 10, unitCost: 300 }],
      paidAmount: 3000, paymentMethod: 'cash', purchaseDate: '2026-07-06',
    })
    const pl = reports.generateProfitLoss()
    expect(pl.totalRevenue).toBe(0)
    expect(pl.netProfit).toBe(0)                   // buying stock is not an expense
  })

  it('supports a date range filter', () => {
    makeSale(null, 'cash', 500, 1)                 // 2026-07-05
    makeSale(null, 'cash', 700, 1)                 // 2026-07-05
    const pl = reports.generateProfitLoss('2026-07-05', '2026-07-05')
    expect(pl.totalRevenue).toBe(1200)
    const empty = reports.generateProfitLoss('2026-08-01', '2026-08-31')
    expect(empty.totalRevenue).toBe(0)
    expect(empty.netProfit).toBe(0)
  })
})

describe('generateBalanceSheet', () => {
  it('satisfies assets = liabilities + equity after a cash sale', () => {
    makeSale(null, 'cash', 500, 4)                 // cash +2000, inventory −1200
    const bs = reports.generateBalanceSheet()
    expect(bs.totalCurrentAssets).toBe(800)        // 2000 cash − 1200 inventory
    expect(bs.totalCurrentLiabilities).toBe(0)
    expect(bs.totalEquity).toBe(800)               // retained profit
    expect(bs.totalAssets).toBe(bs.totalLiabilitiesAndEquity)
  })

  it('keeps the identity after an expense too', () => {
    makeSale(null, 'cash', 500, 4)                 // net 800
    expenses.createExpense({ category: 'اجاره', description: 'اجاره', amount: 300, date: '2026-07-06' })
    const bs = reports.generateBalanceSheet()
    expect(bs.totalCurrentAssets).toBe(500)        // 800 − 300 expense
    expect(bs.totalEquity).toBe(500)
    expect(bs.totalAssets).toBe(bs.totalLiabilitiesAndEquity)
  })

  it('records payables when a purchase is on credit', () => {
    purchases.createPurchase({
      supplierId: 1,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 10, unitCost: 300 }],
      paidAmount: 0, paymentMethod: 'credit', purchaseDate: '2026-07-06',
    })
    const bs = reports.generateBalanceSheet()
    expect(bs.totalCurrentAssets).toBe(3000)       // inventory grew
    expect(bs.totalCurrentLiabilities).toBe(3000)  // payable grew
    expect(bs.totalEquity).toBe(0)
    expect(bs.totalAssets).toBe(bs.totalLiabilitiesAndEquity)
  })
})

describe('generateARAging', () => {
  it('buckets sum to the customer total debt', () => {
    makeSale(1, 'ledger', 1000, 1)
    makeSale(1, 'ledger', 500, 1)
    const aging = reports.generateARAging()
    expect(aging.rows.length).toBe(1)
    const row = aging.rows[0]
    expect(row.total).toBe(1500)                   // |−1000 −500|
    expect(row.current + row.days31to60 + row.days61to90 + row.over90).toBe(row.total)
    expect(aging.totals.total).toBe(1500)
  })
})
