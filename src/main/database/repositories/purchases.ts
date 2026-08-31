/**
 * Purchases repository — manages purchase orders from suppliers.
 *
 * Purchase creation performs atomically:
 *   1. Inserts purchase record with invoice, supplier, amounts
 *   2. Inserts purchase items and updates product stock
 *   3. Updates supplier balance (debt increases by unpaid amount)
 *   4. Posts double-entry journal:
 *      - Fully paid: Dr Cash/Bank, Cr Inventory + Tax - Discount
 *      - Credit:     Dr Payable (paid portion), Cr Cash; Cr Payable (unpaid portion)
 *   5. Returns the complete purchase with items
 *
 * Balance convention: supplier balance > 0 = store owes supplier (debt).
 * Fully-paid purchases: no payable entries, cash credited directly to inventory.
 * Partial payments: payable debited for paid amount, cash credited; remaining payable credited.
 */

import { getDatabase } from '../connection'
import type { Purchase, PurchaseInput, PurchaseItem } from './suppliers'
import { updateSupplierBalance, addSupplierLedgerEntry } from './suppliers'

function generateInvoiceNumber(): string {
  const db = getDatabase()
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timeStr = now.toISOString().slice(11, 17).replace(/:/g, '')
  const count = (db.prepare("SELECT COUNT(*) as c FROM purchases WHERE invoiceNumber LIKE ?").get(`PUR-${dateStr}%`) as { c: number }).c
  return `PUR-${dateStr}${timeStr}-${String(count + 1).padStart(3, '0')}`
}

function getAccountByCode(code: string): { id: number } | undefined {
  const db = getDatabase()
  return db.prepare('SELECT id FROM accounts WHERE code = ?').get(code) as { id: number } | undefined
}

function createJournalEntry(entryDate: string, description: string, referenceType: string, referenceId: number, lines: { accountId: number; debit: number; credit: number; description?: string }[]) {
  const db = getDatabase()
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal entry imbalance: debit=${totalDebit} credit=${totalCredit}`)
  }
  db.transaction(() => {
    const r = db.prepare('INSERT INTO journal_entries (entryDate, description, referenceType, referenceId) VALUES (?, ?, ?, ?)').run(entryDate, description, referenceType, referenceId)
    const entryId = r.lastInsertRowid as number
    const insert = db.prepare('INSERT INTO journal_entry_lines (entryId, accountId, debit, credit, description) VALUES (?, ?, ?, ?, ?)')
    for (const line of lines) {
      insert.run(entryId, line.accountId, line.debit, line.credit, line.description || '')
    }
  })()
}

export function getAllPurchases(): Purchase[] {
  const db = getDatabase()
  const purchases = db.prepare('SELECT p.*, s.name as supplierName FROM purchases p LEFT JOIN suppliers s ON p.supplierId = s.id ORDER BY p.purchaseDate DESC').all() as Purchase[]
  return purchases.map(p => {
    const items = db.prepare('SELECT * FROM purchase_items WHERE purchaseId = ?').all(p.id) as PurchaseItem[]
    return { ...p, items }
  })
}

export function getPurchaseById(id: number): Purchase | undefined {
  const db = getDatabase()
  const p = db.prepare('SELECT p.*, s.name as supplierName FROM purchases p LEFT JOIN suppliers s ON p.supplierId = s.id WHERE p.id = ?').get(id) as Purchase | undefined
  if (!p) return undefined
  p.items = db.prepare('SELECT * FROM purchase_items WHERE purchaseId = ?').all(id) as PurchaseItem[]
  return p
}

export function getPurchasesBySupplier(supplierId: number): Purchase[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM purchases WHERE supplierId = ? ORDER BY purchaseDate DESC').all(supplierId) as Purchase[]
}

export function createPurchase(input: PurchaseInput): Purchase {
  const db = getDatabase()
  const invoiceNumber = generateInvoiceNumber()
  const subtotal = input.items.reduce((s, i) => s + (i.quantity * i.unitCost), 0)
  const totalAmount = subtotal + (input.taxAmount || 0) - (input.discountAmount || 0)
  const paidAmount = input.paidAmount || 0
  const balanceChange = totalAmount - paidAmount
  const purchaseDate = input.purchaseDate || new Date().toISOString()

  const result = db.transaction(() => {
    const r = db.prepare('INSERT INTO purchases (invoiceNumber, supplierId, subtotal, taxAmount, discountAmount, totalAmount, paidAmount, paymentMethod, status, notes, purchaseDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      invoiceNumber, input.supplierId, subtotal, input.taxAmount || 0, input.discountAmount || 0,
      totalAmount, paidAmount, input.paymentMethod || (paidAmount >= totalAmount ? 'cash' : 'credit'),
      'received', input.notes || '', purchaseDate
    )
    const purchaseId = r.lastInsertRowid as number

    const insertItem = db.prepare('INSERT INTO purchase_items (purchaseId, productId, productTitle, quantity, unitCost, subtotal) VALUES (?, ?, ?, ?, ?, ?)')
    const updateStock = db.prepare('UPDATE products SET stock = stock + ?, purchase_price = ?, updatedAt = datetime("now", "localtime") WHERE id = ?')
    for (const item of input.items) {
      insertItem.run(purchaseId, item.productId, item.productTitle, item.quantity, item.unitCost, item.quantity * item.unitCost)
      updateStock.run(item.quantity, item.unitCost, item.productId)
    }

    // Full purchase amount is owed to the supplier; any payment reduces that debt.
    if (totalAmount > 0) {
      updateSupplierBalance(input.supplierId, totalAmount)
      addSupplierLedgerEntry(input.supplierId, purchaseId, 'purchase', totalAmount, `خرید فاکتور ${invoiceNumber}`)
    }

    if (paidAmount > 0) {
      updateSupplierBalance(input.supplierId, -paidAmount)
      addSupplierLedgerEntry(input.supplierId, purchaseId, 'payment', -paidAmount, `پرداخت فاکتور ${invoiceNumber}`)
    }

    return purchaseId
  })()

  const purchase = getPurchaseById(result as number)!

  const lines: { accountId: number; debit: number; credit: number; description: string }[] = []
  const inventoryAcc = getAccountByCode('1300')
  const payableAcc = getAccountByCode('2110')
  const bankAcc = getAccountByCode('1200')
  const cashAcc = getAccountByCode('1100')

  // Goods + capitalized tax go into inventory; discount reduces cost;
  // the paid portion leaves cash/bank, the unpaid portion stays as payable.
  if (inventoryAcc) {
    lines.push({ accountId: inventoryAcc.id, debit: subtotal, credit: 0, description: `خرید کالا ${invoiceNumber}` })
    if (input.taxAmount && input.taxAmount > 0) {
      lines.push({ accountId: inventoryAcc.id, debit: input.taxAmount, credit: 0, description: `مالیات خرید ${invoiceNumber}` })
    }
  }
  if (input.discountAmount && input.discountAmount > 0) {
    const discountAcc = getAccountByCode('5300')
    if (discountAcc) lines.push({ accountId: discountAcc.id, debit: 0, credit: input.discountAmount, description: `تخفیف خرید ${invoiceNumber}` })
  }
  if (paidAmount > 0) {
    const payAcc = input.paymentMethod === 'cash' ? cashAcc : bankAcc
    if (payAcc) lines.push({ accountId: payAcc.id, debit: 0, credit: paidAmount, description: `پرداخت فاکتور ${invoiceNumber}` })
  }
  if (balanceChange > 0 && payableAcc) {
    lines.push({ accountId: payableAcc.id, debit: 0, credit: balanceChange, description: `بدهی به تأمین\u200cکننده ${invoiceNumber}` })
  }

  if (lines.length > 0) {
    try {
      createJournalEntry(purchaseDate, `خرید از تأمین\u200cکننده — ${purchase.supplierName || ''}`, 'purchase', result as number, lines)
    } catch (err) {
      console.error('[Purchases] Journal posting failed:', err)
    }
  }

  return purchase
}

export function paySupplier(supplierId: number, amount: number, description?: string, purchaseId?: number): { success: boolean; error?: string } {
  if (amount <= 0) return { success: false, error: 'مبلغ نامعتبر' }
  const db = getDatabase()

  db.transaction(() => {
    updateSupplierBalance(supplierId, -amount)
    const invoiceNum = purchaseId ? (db.prepare('SELECT invoiceNumber FROM purchases WHERE id = ?').get(purchaseId) as any)?.invoiceNumber : ''
    addSupplierLedgerEntry(supplierId, purchaseId || null, 'payment', -amount, description || `پرداخت به تأمین\u200cکننده${invoiceNum ? ` فاکتور ${invoiceNum}` : ''}`)

    if (purchaseId) {
      db.prepare('UPDATE purchases SET paidAmount = paidAmount + ? WHERE id = ?').run(amount, purchaseId)
      const p = db.prepare('SELECT totalAmount, paidAmount FROM purchases WHERE id = ?').get(purchaseId) as any
      if (p && p.paidAmount >= p.totalAmount) {
        db.prepare("UPDATE purchases SET status = 'paid' WHERE id = ?").run(purchaseId)
      }
    }
  })()

  const payableAcc = getAccountByCode('2110')
  const cashAcc = getAccountByCode('1100')
  if (payableAcc && cashAcc) {
    const desc = description || `پرداخت به تأمین\u200cکننده`
    try {
      createJournalEntry(new Date().toISOString(), desc, 'supplier-payment', supplierId, [
        { accountId: payableAcc.id, debit: amount, credit: 0, description: desc },
        { accountId: cashAcc.id, debit: 0, credit: amount, description: desc },
      ])
    } catch {}
  }

  return { success: true }
}

export function returnPurchase(purchaseId: number, items: { purchaseItemId: number; quantity: number }[]): { success: boolean; error?: string } {
  const db = getDatabase()
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId) as any
  if (!purchase) return { success: false, error: 'فاکتور یافت نشد' }

  let returnAmount = 0
  db.transaction(() => {
    for (const item of items) {
      const pi = db.prepare('SELECT * FROM purchase_items WHERE id = ?').get(item.purchaseItemId) as any
      if (!pi) continue
      const refundQty = Math.min(item.quantity, pi.quantity)
      const refundAmount = refundQty * pi.unitCost
      returnAmount += refundAmount

      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(refundQty, pi.productId)
      if (refundQty >= pi.quantity) {
        db.prepare('DELETE FROM purchase_items WHERE id = ?').run(item.purchaseItemId)
      } else {
        db.prepare('UPDATE purchase_items SET quantity = quantity - ?, subtotal = subtotal - ? WHERE id = ?').run(refundQty, refundAmount, item.purchaseItemId)
      }
    }

    if (returnAmount > 0) {
      db.prepare('UPDATE purchases SET subtotal = subtotal - ?, totalAmount = totalAmount - ? WHERE id = ?').run(returnAmount, returnAmount, purchaseId)
      updateSupplierBalance(purchase.supplierId, -returnAmount)
      addSupplierLedgerEntry(purchase.supplierId, purchaseId, 'return', -returnAmount, `برگشت فاکتور ${purchase.invoiceNumber}`)
    }
  })()

  if (returnAmount > 0) {
    const inventoryAcc = getAccountByCode('1300')
    const payableAcc = getAccountByCode('2110')
    if (inventoryAcc && payableAcc) {
      try {
        createJournalEntry(new Date().toISOString(), `برگشت از خرید — ${purchase.invoiceNumber}`, 'purchase-return', purchaseId, [
          { accountId: payableAcc.id, debit: returnAmount, credit: 0, description: `برگشت فاکتور ${purchase.invoiceNumber}` },
          { accountId: inventoryAcc.id, debit: 0, credit: returnAmount, description: `برگشت فاکتور ${purchase.invoiceNumber}` },
        ])
      } catch {}
    }
  }

  return { success: true }
}

export function getPurchaseStats(): { totalPurchases: number; totalPending: number; totalPaid: number } {
  const db = getDatabase()
  const total = (db.prepare('SELECT COUNT(*) as c FROM purchases').get() as { c: number }).c
  const pending = (db.prepare("SELECT COUNT(*) as c FROM purchases WHERE status IN ('pending', 'received', 'invoiced')").get() as { c: number }).c
  const paid = (db.prepare("SELECT COUNT(*) as c FROM purchases WHERE status = 'paid'").get() as { c: number }).c
  return { totalPurchases: total, totalPending: pending, totalPaid: paid }
}
