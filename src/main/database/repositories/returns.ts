/**
 * Returns repository — handles product return processing.
 *
 * When a return is created:
 *   1. Inserts return record with status 'completed'
 *   2. Restores product stock (additive increment)
 *   3. Reduces the parent sale's total_amount and totalNetProfit
 *   4. Posts reverse double-entry journal entry via postReturnJournal()
 *
 * Note: individual sale_items quantities are NOT updated on return.
 * Journal entries offset the original sale's revenue and COGS entries.
 */

import { getDatabase } from '../connection'
import { postReturnJournal } from './journal'

export interface Return {
  id: number
  saleId: number | null
  userId: number | null
  productId: number | null
  quantity: number
  reason: string
  refundAmount: number
  status: string
  createdAt: string
  saleInvoiceNumber?: string
  productTitle?: string
  userName?: string
}

export function createReturn(saleId: number, userId: number, productId: number, quantity: number, reason: string, refundAmount: number, isDamaged: boolean = false): Return {
  const db = getDatabase()
  const result = db.prepare('INSERT INTO returns (saleId, userId, productId, quantity, reason, refundAmount, status, isDamaged) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(saleId, userId, productId, quantity, reason, refundAmount, 'completed', isDamaged ? 1 : 0)
  // Both damaged and normal returns restore stock — the product physically comes back
  db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(quantity, productId)
  const returnId = result.lastInsertRowid as number
  // Both return types affect accounting: refund goes back to customer, sale totals drop,
  // and a reverse journal entry is posted. Damaged vs normal doesn't change the accounting path.
  if (saleId && refundAmount > 0) {
    // COGS = original purchase price × quantity (from sale_items, not current price)
    const saleItem = db.prepare('SELECT purchasePrice FROM sale_items WHERE saleId = ? AND productId = ?').get(saleId, productId) as { purchasePrice: number } | undefined
    const cogsAmount = saleItem ? saleItem.purchasePrice * quantity : 0
    // Reduce sale total by refund; reduce profit by (refund - cogs) since COGS is also reversed
    db.prepare('UPDATE sales SET total_amount = total_amount - ?, totalNetProfit = totalNetProfit - ? WHERE id = ?').run(refundAmount, refundAmount - cogsAmount, saleId)

    // If the original sale was on credit (ledger), reverse the customer's debt so
    // the customer balance stays consistent with the returned goods.
    const saleRow = db.prepare('SELECT paymentMethod, customerId FROM sales WHERE id = ?').get(saleId) as { paymentMethod?: string; customerId?: number } | undefined
    if (saleRow?.paymentMethod === 'ledger' && saleRow.customerId) {
      db.prepare('UPDATE customers SET balance = balance + ? WHERE id = ?').run(refundAmount, saleRow.customerId)
      db.prepare("INSERT INTO customer_ledger (customerId, saleId, type, amount, description, images) VALUES (?, ?, 'payment', ?, ?, '[]')")
        .run(saleRow.customerId, saleId, refundAmount, `بازگشت مرجوعی فاکتور #${saleId}`)
    }

    postReturnJournal(returnId, new Date().toISOString().slice(0, 10), refundAmount, cogsAmount, saleRow?.paymentMethod)
  }
  return db.prepare('SELECT r.*, s.invoiceNumber as saleInvoiceNumber, p.title as productTitle, u.name as userName FROM returns r LEFT JOIN sales s ON r.saleId = s.id LEFT JOIN products p ON r.productId = p.id LEFT JOIN users u ON r.userId = u.id WHERE r.id = ?').get(returnId) as Return
}

export function getReturns(limit: number = 100): Return[] {
  const db = getDatabase()
  return db.prepare('SELECT r.*, s.invoiceNumber as saleInvoiceNumber, p.title as productTitle, u.name as userName FROM returns r LEFT JOIN sales s ON r.saleId = s.id LEFT JOIN products p ON r.productId = p.id LEFT JOIN users u ON r.userId = u.id ORDER BY r.createdAt DESC LIMIT ?').all(limit) as Return[]
}

export function getReturnStats(): { totalReturns: number; totalRefund: number; todayReturns: number } {
  const db = getDatabase()
  const total = (db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(CASE WHEN isDamaged = 1 THEN refundAmount ELSE 0 END), 0) as refund FROM returns').get() as { c: number; refund: number })
  const today = (db.prepare("SELECT COUNT(*) as c FROM returns WHERE date(createdAt) = date('now', 'localtime')").get() as { c: number }).c
  return { totalReturns: total.c, totalRefund: total.refund, todayReturns: today }
}
