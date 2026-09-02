import { getDatabase } from '../connection'
import type { DailyCashRegister } from '../../../types'

/** Cash received on a given day: the exact cash share of every sale
 *  (from sale_payments when present, otherwise the legacy single-cash row). */
function cashInForDate(date: string): number {
  const db = getDatabase()
  const split = (db.prepare(`
    SELECT COALESCE(SUM(sp.amount), 0) as t
    FROM sale_payments sp JOIN sales s ON s.id = sp.saleId
    WHERE sp.method = 'cash' AND date(s.createdAt) = ?
  `).get(date) as { t: number }).t
  const legacy = (db.prepare(`
    SELECT COALESCE(SUM(s.customerPaid), 0) as t
    FROM sales s
    WHERE s.paymentMethod = 'cash' AND date(s.createdAt) = ?
      AND NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.saleId = s.id)
  `).get(date) as { t: number }).t
  return split + legacy
}

export function getTodayRegister(): DailyCashRegister {
  const db = getDatabase()
  const today = new Date().toISOString().split('T')[0]
  const row = db.prepare('SELECT * FROM cash_register WHERE date = ?').get(today) as Record<string, unknown> | undefined

  if (!row) {
    db.prepare('INSERT OR IGNORE INTO cash_register (date, openingBalance, isClosed) VALUES (?, 0, 0)').run(today)
    return { date: today, openingBalance: 0, totalCashIn: 0, totalCashOut: 0, closingBalance: 0, expectedBalance: 0, difference: 0, isClosed: false }
  }

  const cashSales = cashInForDate(today)
  const cashRefunds = 0

  return {
    date: row.date as string,
    openingBalance: row.openingBalance as number,
    totalCashIn: cashSales,
    totalCashOut: cashRefunds,
    closingBalance: row.closingBalance as number,
    expectedBalance: (row.openingBalance as number) + cashSales - cashRefunds,
    difference: (row.closingBalance as number) - ((row.openingBalance as number) + cashSales - cashRefunds),
    isClosed: Boolean(row.isClosed),
  }
}

export function setOpeningBalance(amount: number): void {
  const db = getDatabase()
  const today = new Date().toISOString().split('T')[0]
  const existing = db.prepare('SELECT id FROM cash_register WHERE date = ?').get(today)
  if (existing) {
    db.prepare('UPDATE cash_register SET openingBalance = ? WHERE date = ?').run(amount, today)
  } else {
    db.prepare('INSERT INTO cash_register (date, openingBalance, isClosed) VALUES (?, ?, 0)').run(today, amount)
  }
}

export function closeRegister(userId: number, closingBalance: number): DailyCashRegister {
  const db = getDatabase()
  const today = new Date().toISOString().split('T')[0]
  db.prepare("UPDATE cash_register SET closingBalance = ?, isClosed = 1, closedAt = datetime('now', 'localtime'), closedBy = ? WHERE date = ?").run(closingBalance, userId, today)
  return getTodayRegister()
}

export function getRegisterHistory(startDate: string, endDate: string): DailyCashRegister[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM cash_register WHERE date BETWEEN ? AND ? ORDER BY date DESC').all(startDate, endDate) as Record<string, unknown>[]
  return rows.map(row => {
    const date = row.date as string
    const openingBalance = row.openingBalance as number
    const closingBalance = row.closingBalance as number
    const cashIn = cashInForDate(date)
    const cashOut = 0
    return {
      date,
      openingBalance,
      totalCashIn: cashIn,
      totalCashOut: cashOut,
      closingBalance,
      expectedBalance: openingBalance + cashIn - cashOut,
      difference: closingBalance - (openingBalance + cashIn - cashOut),
      isClosed: Boolean(row.isClosed),
    }
  })
}
