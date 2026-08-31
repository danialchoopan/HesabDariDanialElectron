/**
 * Accounting & Inventory math verification against the REAL repositories.
 *
 * These tests run the actual production code paths (sales, returns, purchases,
 * journal, products, expenses) against an in-memory SQLite DB, verifying:
 *   - Every journal entry balances (total debit === total credit)
 *   - Sales: subtotal / rounded total / net profit / stock decrement math
 *   - Returns: stock restore, sale reduction, COGS reversal
 *   - Purchases: journal balance, supplier balance tracking
 *   - Inventory guards (no negative stock)
 *   - Full sale→return cycle nets accounts to zero
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestDb } from './helpers/testDb'

let mockDb: any

vi.mock('../src/main/database/connection', () => ({
  getDatabase: () => mockDb,
}))

import * as sales from '../src/main/database/repositories/sales'
import * as returns from '../src/main/database/repositories/returns'
import * as purchases from '../src/main/database/repositories/purchases'
import * as products from '../src/main/database/repositories/products'
import * as expenses from '../src/main/database/repositories/expenses'
import * as journal from '../src/main/database/repositories/journal'
import * as suppliers from '../src/main/database/repositories/suppliers'

function setRounding(value: number) {
  mockDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoRounding', String(value))
}

function getAccountBalance(code: string): number {
  const r = mockDb.prepare(`
    SELECT COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0) as net
    FROM accounts a LEFT JOIN journal_entry_lines jel ON jel.accountId = a.id
    WHERE a.code = ? AND a.isActive = 1
  `).get(code)
  return r ? r.net : 0
}

function allJournalLines(): { debit: number; credit: number }[] {
  return mockDb.prepare('SELECT debit, credit FROM journal_entry_lines').all()
}

function journalFor(referenceType: string) {
  const entry = mockDb.prepare('SELECT * FROM journal_entries WHERE referenceType = ? ORDER BY id DESC LIMIT 1').get(referenceType)
  if (!entry) return null
  return {
    entry,
    lines: mockDb.prepare('SELECT * FROM journal_entry_lines WHERE entryId = ?').all(entry.id),
  }
}

beforeEach(async () => {
  mockDb = await createTestDb()
  // Extra accounts used by the purchases journal (not seeded by test helper)
  for (const [code, name, type] of [
    ['2110', 'حساب‌های پرداختنی تأمین‌کنندگان', 'liability'],
    ['5200', 'هزینه خرید کالا', 'expense'],
    ['5300', 'تخفیف دریافتی خرید', 'income'],
  ] as const) {
    mockDb.prepare('INSERT INTO accounts (code, name, type) VALUES (?, ?, ?)').run(code, name, type)
  }
  mockDb.prepare('INSERT INTO users (name, pin_code, role) VALUES (?, ?, ?)').run('Admin', '1234', 'admin')
  mockDb.prepare('INSERT INTO products (title, category, purchase_price, sale_price, stock, unit) VALUES (?, ?, ?, ?, ?, ?)').run('Widget', 'Goods', 300, 500, 100, 'number')
  mockDb.prepare('INSERT INTO products (title, category, purchase_price, sale_price, stock, unit) VALUES (?, ?, ?, ?, ?, ?)').run('Gadget', 'Goods', 700, 1200, 50, 'number')
  mockDb.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run('Ahmad', '0912')
  mockDb.prepare('INSERT INTO suppliers (name, phone) VALUES (?, ?)').run('Supplier Co', '0987')
  setRounding(0)
})

describe('Sales math', () => {
  it('computes subtotal, rounded total, net profit, and stock decrement', () => {
    const sale = sales.createSale({
      userId: 1, customerId: null,
      items: [
        { productId: 1, productTitle: 'Widget', quantity: 3, unitPrice: 500, purchasePrice: 300 },
        { productId: 2, productTitle: 'Gadget', quantity: 2, unitPrice: 1200, purchasePrice: 700 },
      ],
      paymentMethod: 'cash', customerPaid: 3900,
      saleDate: '2026-07-05 12:00:00',
    })
    expect(sale.subtotal).toBe(3900)          // 3*500 + 2*1200
    expect(sale.total_amount).toBe(3900)      // rounding=0
    expect(sale.changeAmount).toBe(0)
    const row = mockDb.prepare('SELECT totalNetProfit FROM sales WHERE id = ?').get(sale.id)
    expect(row.totalNetProfit).toBe(1600)     // 3*200 + 2*500
    const stock = mockDb.prepare('SELECT stock FROM products WHERE id = 1').get()
    expect(stock.stock).toBe(97)              // 100 - 3
  })

  it('records the exact subtotal as total (auto-rounding is NOT applied to accounting)', () => {
    setRounding(500)
    const sale = sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 1, unitPrice: 1250, purchasePrice: 800 }],
      paymentMethod: 'cash', customerPaid: 1500,
      saleDate: '2026-07-05 12:00:00',
    })
    expect(sale.subtotal).toBe(1250)
    expect(sale.total_amount).toBe(1250)     // accounting total = exact subtotal
    expect(sale.changeAmount).toBe(250)      // rounding lives in cash change only
    const j = journalFor('sale')!
    expect(j.lines.length).toBe(4)
    const cashAcct = mockDb.prepare("SELECT id FROM accounts WHERE code = '1100'").get()
    const cashLine = j.lines.find((l: any) => l.accountId === cashAcct.id)
    expect(cashLine.debit).toBe(1250)
    const totalDebit = j.lines.reduce((s: number, l: any) => s + l.debit, 0)
    const totalCredit = j.lines.reduce((s: number, l: any) => s + l.credit, 0)
    expect(totalDebit).toBe(totalCredit)
  })

  it('sale journal always balances (debit === credit)', () => {
    sales.createSale({
      userId: 1, customerId: null,
      items: [
        { productId: 1, productTitle: 'Widget', quantity: 5, unitPrice: 500, purchasePrice: 300 },
        { productId: 2, productTitle: 'Gadget', quantity: 1, unitPrice: 1200, purchasePrice: 700 },
      ],
      paymentMethod: 'cash', customerPaid: 3700,
      saleDate: '2026-07-05 12:00:00',
    })
    const lines = allJournalLines()
    const dr = lines.reduce((s, l) => s + l.debit, 0)
    const cr = lines.reduce((s, l) => s + l.credit, 0)
    expect(dr).toBe(cr)
    // Cash inflow equals rounded invoice total
    expect(getAccountBalance('1100')).toBe(3700)
    // COGS equals sum(purchasePrice * qty)
    expect(getAccountBalance('5100')).toBe(2200) // 5*300 + 1*700
  })

  it('credit (ledger) sale posts to A/R and reduces customer balance', () => {
    const sale = sales.createSale({
      userId: 1, customerId: 1,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 2, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'ledger', customerPaid: 0,
      saleDate: '2026-07-05 12:00:00',
    })
    expect(sale.total_amount).toBe(1000)
    const customer = mockDb.prepare('SELECT balance FROM customers WHERE id = 1').get()
    expect(customer.balance).toBe(-1000)      // debt grows
    expect(getAccountBalance('1100')).toBe(0) // no cash involved
    expect(getAccountBalance('1400')).toBe(1000) // A/R debited
  })

  it('includes shipping cost in the sale total and journal', () => {
    setRounding(0)
    const sale = sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 1, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'cash', customerPaid: 700,
      saleDate: '2026-07-05 12:00:00',
      shippingCost: 200,
    })
    expect(sale.subtotal).toBe(500)           // goods only
    expect(sale.total_amount).toBe(700)       // subtotal + shipping
    expect(sale.changeAmount).toBe(0)
    const row = mockDb.prepare('SELECT totalNetProfit FROM sales WHERE id = ?').get(sale.id)
    expect(row.totalNetProfit).toBe(400)      // (500-300) + 200 shipping margin
    expect(getAccountBalance('1100')).toBe(700)  // cash received includes shipping
    expect(getAccountBalance('4100')).toBe(-700) // revenue recognized includes shipping
    const j = journalFor('sale')!
    const lines = j.lines as { debit: number; credit: number }[]
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0))
  })
})

describe('Return math (real createReturn)', () => {
  beforeEach(() => setRounding(0))

  it('restores stock and reduces sale total/profit on partial return', () => {
    const sale = sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 5, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'cash', customerPaid: 2500,
      saleDate: '2026-07-05 12:00:00',
    })
    returns.createReturn(sale.id, 1, 1, 2, 'customer changed mind', 1000, false)
    const stock = mockDb.prepare('SELECT stock FROM products WHERE id = 1').get()
    expect(stock.stock).toBe(97)             // 100 - 5 + 2
    const saleRow = mockDb.prepare('SELECT total_amount, totalNetProfit FROM sales WHERE id = ?').get(sale.id)
    expect(saleRow.total_amount).toBe(1500)  // 2500 - 1000
    expect(saleRow.totalNetProfit).toBe(600) // (500-300)*5 - (1000 - 2*300) = 1000 - 400
  })

  it('full sale→return cycle nets cash/revenue/inventory/COGS to zero', () => {
    const sale = sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 5, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'cash', customerPaid: 2500,
      saleDate: '2026-07-05 12:00:00',
    })
    expect(getAccountBalance('1100')).toBe(2500)
    returns.createReturn(sale.id, 1, 1, 5, 'full return', 2500, false)
    expect(getAccountBalance('1100')).toBe(0)
    expect(getAccountBalance('4100')).toBe(0)
    expect(getAccountBalance('1300')).toBe(0)
    expect(getAccountBalance('5100')).toBe(0)
    const lines = allJournalLines()
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0))
  })

  it('reverses COGS using the purchasePrice recorded at sale time', () => {
    const sale = sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 2, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'cash', customerPaid: 1000,
      saleDate: '2026-07-05 12:00:00',
    })
    returns.createReturn(sale.id, 1, 1, 2, 'return', 1000, false)
    // COGS account net should be back to 0: sale +600 debit, return -600 credit
    expect(getAccountBalance('5100')).toBe(0)
    expect(getAccountBalance('1300')).toBe(0)
  })

  it('returning a ledger (credit) sale reverses the customer debt', () => {
    setRounding(0)
    const sale = sales.createSale({
      userId: 1, customerId: 1,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 2, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'ledger', customerPaid: 0,
      saleDate: '2026-07-05 12:00:00',
    })
    const before = mockDb.prepare('SELECT balance FROM customers WHERE id = 1').get()
    expect(before.balance).toBe(-1000)        // credit sale → customer owes 1000

    returns.createReturn(sale.id, 1, 1, 2, 'full return', 1000, false)

    const after = mockDb.prepare('SELECT balance FROM customers WHERE id = 1').get()
    expect(after.balance).toBe(0)             // debt reversed
    const ledger = mockDb.prepare('SELECT * FROM customer_ledger WHERE customerId = 1 ORDER BY id').all()
    expect(ledger.length).toBe(2)             // sale + return reversal
    // A/R account nets to zero after sale + return
    expect(getAccountBalance('1400')).toBe(0)
  })

  it('full return of a previously-rounded sale nets the accounts to zero', () => {
    setRounding(500)
    const sale = sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 1, unitPrice: 1250, purchasePrice: 800 }],
      paymentMethod: 'cash', customerPaid: 1500,
      saleDate: '2026-07-05 12:00:00',
    })
    expect(sale.total_amount).toBe(1250)      // accounting total is the exact subtotal
    // Full return refunds the recorded total (1250)
    returns.createReturn(sale.id, 1, 1, 1, 'full return', 1250, false)
    const lines = allJournalLines()
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0))
    // Sale fully reversed → no residual revenue/cash/inventory
    expect(getAccountBalance('1100')).toBe(0)
    expect(getAccountBalance('4100')).toBe(0)
    expect(getAccountBalance('1300')).toBe(0)
    expect(getAccountBalance('5100')).toBe(0)
  })
})

describe('Purchase math (real createPurchase)', () => {
  beforeEach(() => setRounding(0))

  it('full cash purchase: journal balanced, supplier balance unchanged, stock up', () => {
    const purchase = purchases.createPurchase({
      supplierId: 1,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 10, unitCost: 300 }],
      paidAmount: 3000, paymentMethod: 'cash',
      purchaseDate: '2026-07-06',
    })
    expect(purchase.subtotal).toBe(3000)
    expect(purchase.totalAmount).toBe(3000)
    const supplier = mockDb.prepare('SELECT balance FROM suppliers WHERE id = 1').get()
    expect(supplier.balance).toBe(0)          // paid in full → no debt
    const stock = mockDb.prepare('SELECT stock FROM products WHERE id = 1').get()
    expect(stock.stock).toBe(110)             // 100 + 10
    const j = journalFor('purchase')
    expect(j).not.toBeNull()
    const lines = j.lines as { debit: number; credit: number }[]
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0))
    expect(getAccountBalance('1300')).toBe(3000)  // inventory grows
    expect(getAccountBalance('1100')).toBe(-3000) // cash pays out
    expect(getAccountBalance('2110')).toBe(0)     // no payable
  })

  it('credit purchase: supplier balance = total, payable credited', () => {
    const purchase = purchases.createPurchase({
      supplierId: 1,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 10, unitCost: 300 }],
      paidAmount: 0, paymentMethod: 'credit',
      purchaseDate: '2026-07-06',
    })
    const supplier = mockDb.prepare('SELECT balance FROM suppliers WHERE id = 1').get()
    expect(supplier.balance).toBe(3000)       // store owes full amount
    const j = journalFor('purchase')
    expect(j).not.toBeNull()
    expect(getAccountBalance('2110')).toBe(-3000) // payable credited
  })

  it('partial payment: supplier balance = unpaid portion, journal balanced', () => {
    const purchase = purchases.createPurchase({
      supplierId: 1,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 10, unitCost: 300 }],
      paidAmount: 1000, paymentMethod: 'cash',
      purchaseDate: '2026-07-06',
    })
    const supplier = mockDb.prepare('SELECT balance FROM suppliers WHERE id = 1').get()
    expect(supplier.balance).toBe(2000)       // 3000 - 1000
    const j = journalFor('purchase')
    expect(j).not.toBeNull()
    const lines = j.lines as { debit: number; credit: number }[]
    const dr = lines.reduce((s, l) => s + l.debit, 0)
    const cr = lines.reduce((s, l) => s + l.credit, 0)
    expect(dr).toBe(cr)
    expect(getAccountBalance('1300')).toBe(3000)
    expect(getAccountBalance('1100')).toBe(-1000) // paid portion out of cash
    expect(getAccountBalance('2110')).toBe(-2000)  // unpaid portion on payable
  })

  it('payment + tax + discount all net correctly', () => {
    const purchase = purchases.createPurchase({
      supplierId: 1,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 10, unitCost: 300 }],
      taxAmount: 300, discountAmount: 200,
      paidAmount: 0, paymentMethod: 'credit',
      purchaseDate: '2026-07-06',
    })
    expect(purchase.totalAmount).toBe(3100)   // 3000 + 300 - 200
    const supplier = mockDb.prepare('SELECT balance FROM suppliers WHERE id = 1').get()
    expect(supplier.balance).toBe(3100)
    const j = journalFor('purchase')
    expect(j).not.toBeNull()
    const lines = j.lines as { debit: number; credit: number }[]
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0))
    expect(getAccountBalance('1300')).toBe(3300)  // subtotal + tax capitalized
    expect(getAccountBalance('5300')).toBe(-200)  // discount income credited
    expect(getAccountBalance('2110')).toBe(-3100)
  })

  it('paySupplier reduces supplier balance and posts balanced entry', () => {
    purchases.createPurchase({
      supplierId: 1,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 10, unitCost: 300 }],
      paidAmount: 0, paymentMethod: 'credit',
      purchaseDate: '2026-07-06',
    })
    const res = purchases.paySupplier(1, 1200, 'پرداخت به تأمین‌کننده')
    expect(res.success).toBe(true)
    const supplier = mockDb.prepare('SELECT balance FROM suppliers WHERE id = 1').get()
    expect(supplier.balance).toBe(1800)       // 3000 - 1200
    const lines = allJournalLines()
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0))
    expect(getAccountBalance('2110')).toBe(-1800) // payable: -3000 (purchase) + 1200 (payment)
  })
})

describe('Expense math (real createExpense/deleteExpense)', () => {
  it('posts a balanced expense journal and reverses on delete', () => {
    const exp = expenses.createExpense({ category: 'اجاره', description: 'اجاره مغازه', amount: 5000, date: '2026-07-06' })
    expect(exp.amount).toBe(5000)
    expect(getAccountBalance('6100')).toBe(5000) // expense debited
    expect(getAccountBalance('1100')).toBe(-5000) // cash credited
    expect(getAccountBalance('6100') + getAccountBalance('1100')).toBe(0)

    expenses.deleteExpense(exp.id)
    expect(getAccountBalance('6100')).toBe(0)   // reversed
    expect(getAccountBalance('1100')).toBe(0)
  })

  it('every posted journal balances after mixed transactions', () => {
    sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 2, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'cash', customerPaid: 1000, saleDate: '2026-07-05 12:00:00',
    })
    expenses.createExpense({ category: 'قبوض', description: 'برق', amount: 200, date: '2026-07-06' })
    purchases.createPurchase({
      supplierId: 1,
      items: [{ productId: 2, productTitle: 'Gadget', quantity: 5, unitCost: 700 }],
      paidAmount: 1000, paymentMethod: 'cash', purchaseDate: '2026-07-06',
    })
    const entries = mockDb.prepare('SELECT * FROM journal_entries').all() as { id: number }[]
    for (const entry of entries) {
      const lines = mockDb.prepare('SELECT debit, credit FROM journal_entry_lines WHERE entryId = ?').all(entry.id) as { debit: number; credit: number }[]
      const dr = lines.reduce((s, l) => s + l.debit, 0)
      const cr = lines.reduce((s, l) => s + l.credit, 0)
      expect(Math.abs(dr - cr)).toBeLessThanOrEqual(0.01)
    }
  })
})

describe('Inventory math', () => {
  it('decrementStock never allows negative stock', () => {
    expect(products.decrementStock(1, 100)).toBe(true)
    expect(products.decrementStock(1, 1)).toBe(false) // would go negative
    const stock = mockDb.prepare('SELECT stock FROM products WHERE id = 1').get()
    expect(stock.stock).toBe(0)
  })

  it('updateStock increments and guards negatives', () => {
    expect(products.updateStock(1, 50)).toBe(true)
    expect(products.updateStock(1, -200)).toBe(false)
    const stock = mockDb.prepare('SELECT stock FROM products WHERE id = 1').get()
    expect(stock.stock).toBe(150)
  })

  it('getProductProfitReport computes profit and margin', () => {
    sales.createSale({
      userId: 1, customerId: null,
      items: [
        { productId: 1, productTitle: 'Widget', quantity: 4, unitPrice: 500, purchasePrice: 300 },
        { productId: 2, productTitle: 'Gadget', quantity: 1, unitPrice: 1200, purchasePrice: 700 },
      ],
      paymentMethod: 'cash', customerPaid: 3200, saleDate: '2026-07-05 12:00:00',
    })
    const report = products.getProductProfitReport()
    const widget = report.find((r: any) => r.productTitle === 'Widget')
    expect(widget.unitsSold).toBe(4)
    expect(widget.totalRevenue).toBe(2000)
    expect(widget.totalCost).toBe(1200)
    expect(widget.netProfit).toBe(800)
    expect(widget.profitMargin).toBe(40)
  })
})

describe('Trial balance & general ledger', () => {
  it('trial balance reports debit/credit sums correctly', () => {
    sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 2, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'cash', customerPaid: 1000, saleDate: '2026-07-05 12:00:00',
    })
    expenses.createExpense({ category: 'اجاره', description: 'اجاره', amount: 400, date: '2026-07-06' })
    const tb = journal.getTrialBalance()
    const totalDebit = tb.reduce((s: number, r: any) => s + r.totalDebit, 0)
    const totalCredit = tb.reduce((s: number, r: any) => s + r.totalCredit, 0)
    expect(totalDebit).toBe(totalCredit)
  })

  it('general ledger keeps a correct running balance', () => {
    sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 1, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'cash', customerPaid: 500, saleDate: '2026-07-05 12:00:00',
    })
    sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 1, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'cash', customerPaid: 500, saleDate: '2026-07-06 12:00:00',
    })
    const cashAcct = mockDb.prepare("SELECT id FROM accounts WHERE code = '1100'").get()
    const ledger = journal.getGeneralLedger(cashAcct.id)
    expect(ledger.length).toBe(2)
    expect(ledger[0].balance).toBe(500)
    expect(ledger[1].balance).toBe(1000)
  })

  it('getJournalEntries returns per-entry debit/credit totals for the UI summary', () => {
    sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 1, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'cash', customerPaid: 500, saleDate: '2026-07-05 12:00:00',
    })
    const res = journal.getJournalEntries({})
    expect(res.entries.length).toBe(1)
    const entry = res.entries[0]
    expect(entry.totalDebit).toBe(800)   // cash 500 + cogs 300
    expect(entry.totalCredit).toBe(800)  // revenue 500 + inventory 300
  })

  it('getJournalEntryById joins account code/name onto lines', () => {
    const sale = sales.createSale({
      userId: 1, customerId: null,
      items: [{ productId: 1, productTitle: 'Widget', quantity: 1, unitPrice: 500, purchasePrice: 300 }],
      paymentMethod: 'cash', customerPaid: 500, saleDate: '2026-07-05 12:00:00',
    })
    const res = journal.getJournalEntries({})
    const detail = journal.getJournalEntryById(res.entries[0].id)
    expect(detail).toBeTruthy()
    expect(detail!.lines.length).toBe(4)
    const cashLine = detail!.lines.find((l: any) => l.accountCode === '1100')
    expect(cashLine).toBeTruthy()
    expect(cashLine!.accountName).toBeTruthy()
    expect(cashLine!.debit).toBe(500)
  })
})
