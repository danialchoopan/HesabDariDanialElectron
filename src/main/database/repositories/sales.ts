/**
 * Sales repository — manages sales creation, retrieval, and related operations.
 *
 * Sale creation performs the following atomically:
 *   1. Inserts sale record with invoice number and payment details
 *   2. Inserts sale items with per-line profit calculation
 *   3. Decrements product stock for each item sold
 *   4. Updates customer balance and ledger if credit sale
 *   5. Posts double-entry journal via postSaleJournal()
 *   6. Returns the complete sale with items
 *
 * Rounding: total_amount is rounded to nearest configurable value (default 500 tomans).
 * Profit: netProfit = (unitPrice - purchasePrice) * quantity per line item.
 */

import { getDatabase } from '../connection'
import type { Sale, SaleInput } from '../../../types'
import { decrementStock } from './products'
import { updateCustomerBalance, addLedgerEntry } from './customers'
import { calculateLineSubtotal, calculateLineProfit } from '../../utils/math'
import { postSaleJournal } from './journal'

export function createSale(input: SaleInput): Sale {
  const db = getDatabase()
  const saleDate = input.saleDate || new Date().toISOString().slice(0, 19).replace('T', ' ')
  const affectsInventory = input.affectsInventory !== false ? 1 : 0
  const invoiceNumber = generateInvoiceNumber(saleDate)

  let rawSubtotal = 0
  for (const item of input.items) {
    rawSubtotal += calculateLineSubtotal(item.unitPrice, item.quantity)
  }

  // Accounting truth: the recorded total is the exact line subtotal (+ shipping).
  // Rounding is a cash-convenience concern only — it belongs in the POS change
  // calculation (customerPaid), never in the revenue/journal numbers.
  const total_amount = rawSubtotal + (input.shippingCost || 0)

  // ── Resolve how the invoice is settled ─────────────────────────
  // A sale can be paid with one method or split across several
  // (cash + card/card-to-card + ledger). sales.paymentMethod stores the
  // PRIMARY channel for backwards compatibility; the exact split is stored in
  // sale_payments and drives the journal + customer balance.
  let cashTotal = 0
  let bankTotal = 0 // card + card_to_card
  let arTotal = 0   // ledger / added to debt

  if (input.payments && input.payments.length > 0) {
    for (const p of input.payments) {
      const amt = Math.round(p.amount)
      if (amt <= 0) continue
      if (p.method === 'cash') cashTotal += amt
      else if (p.method === 'card' || p.method === 'card_to_card') bankTotal += amt
      else arTotal += amt
    }
    // Guard against a ledger share without a customer to attach the debt to.
    if (arTotal > 0 && !input.customerId) {
      throw new Error('برای بخش بدهی (اعتباری) باید مشتری انتخاب شود')
    }
    // If the split does not sum exactly to the total (UI rounding etc.), push
    // the difference onto the largest paid-up-front share so the books close.
    const allocated = cashTotal + bankTotal + arTotal
    const diff = Math.round(total_amount) - allocated
    if (Math.abs(diff) > 0 && (cashTotal > 0 || bankTotal > 0)) {
      if (cashTotal >= bankTotal) cashTotal += diff
      else bankTotal += diff
    }
  } else {
    // Legacy single-method path (no split supplied)
    if (input.paymentMethod === 'cash') cashTotal = total_amount
    else if (input.paymentMethod === 'card') bankTotal = total_amount
    else arTotal = total_amount
  }

  // Primary channel used for the sales.paymentMethod column + quick display.
  const primaryMethod: 'cash' | 'card' | 'ledger' =
    cashTotal > 0 && cashTotal >= bankTotal && cashTotal >= arTotal
      ? 'cash'
      : bankTotal > 0 && bankTotal >= arTotal
        ? 'card'
        : 'ledger'

  // customerPaid = amount settled up front (not added to debt).
  const customerPaid = arTotal > 0 ? cashTotal + bankTotal : input.customerPaid
  // In split mode amounts are the exact applied shares, so no cash change.
  const changeAmount = arTotal > 0 || (input.payments && input.payments.length > 0)
    ? 0
    : input.paymentMethod === 'cash'
      ? Math.max(0, input.customerPaid - total_amount)
      : 0

  const createSaleTx = db.transaction(() => {
    const saleResult = db.prepare(`
      INSERT INTO sales (invoiceNumber, userId, customerId, subtotal, total_amount, totalNetProfit, paymentMethod, customerPaid, changeAmount, description, invoiceDescription, manualCustomerName, saleType, saleDate, affectsInventory, shipping_cost)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceNumber, input.userId, input.customerId ?? null,
      rawSubtotal, total_amount, primaryMethod, customerPaid, changeAmount,
      input.description || '', input.invoiceDescription || '', input.manualCustomerName || '', input.saleType || 'in-person',
      saleDate, affectsInventory, input.shippingCost || 0
    )
    const saleId = saleResult.lastInsertRowid as number

    // Record the payment split (one row per method actually used)
    const insertPayment = db.prepare('INSERT INTO sale_payments (saleId, method, amount) VALUES (?, ?, ?)')
    const split: { method: 'cash' | 'card' | 'card_to_card' | 'ledger'; amount: number }[] = []
    if (input.payments && input.payments.length > 0) {
      for (const p of input.payments) {
        const amt = Math.round(p.amount)
        if (amt > 0) {
          insertPayment.run(saleId, p.method, amt)
          split.push({ method: p.method, amount: amt })
        }
      }
    } else {
      const single = primaryMethod === 'cash' ? 'cash' : primaryMethod === 'card' ? 'card' : 'ledger'
      const singleAmt = primaryMethod === 'ledger' ? arTotal : (primaryMethod === 'card' ? bankTotal : cashTotal)
      insertPayment.run(saleId, single, singleAmt)
      split.push({ method: single, amount: singleAmt })
    }

    const itemStmt = db.prepare(`
      INSERT INTO sale_items (saleId, productId, productTitle, quantity, unitPrice, purchasePrice, subtotal, netProfit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let invoiceNetProfit = 0
    for (const item of input.items) {
      const lineSubtotal = calculateLineSubtotal(item.unitPrice, item.quantity)
      const lineProfit = calculateLineProfit(item.unitPrice, item.purchasePrice, item.quantity)
      invoiceNetProfit += lineProfit

      itemStmt.run(saleId, item.productId, item.productTitle, item.quantity, item.unitPrice, item.purchasePrice, lineSubtotal, lineProfit)
      if (affectsInventory) {
        const stockOk = decrementStock(item.productId, item.quantity)
        if (!stockOk) {
          console.warn(`[Sales] Stock insufficient for product ${item.productId} (${item.productTitle}): requested ${item.quantity}`)
        }
      }
    }

    db.prepare('UPDATE sales SET totalNetProfit = ? WHERE id = ?').run(invoiceNetProfit + (input.shippingCost || 0), saleId)

    // Only the ledger share is added to the customer's debt.
    if (arTotal > 0 && input.customerId) {
      updateCustomerBalance(input.customerId, -arTotal)
      addLedgerEntry(input.customerId, saleId, 'sale', arTotal, `خرید فاکتور ${invoiceNumber}`)
    }

    return saleId
  })

  const saleId = createSaleTx()

  try {
    postSaleJournal(saleId, saleDate.slice(0, 10), {
      items: input.items.map(i => ({ purchasePrice: i.purchasePrice, quantity: i.quantity })),
      total_amount, paymentMethod: primaryMethod,
      affectsInventory: affectsInventory === 1,
      paymentSplit: { cash: cashTotal, bank: bankTotal, ar: arTotal },
    })
  } catch (err) {
    console.error(`[Sales] Journal posting failed for sale ${saleId}:`, err)
  }

  return getSaleById(saleId)!
}

export function getSaleById(id: number): Sale | undefined {
  const db = getDatabase()
  const saleRow = db.prepare(
    'SELECT s.*, u.name as userName, c.name as customerName, c.customerType as customerType FROM sales s LEFT JOIN users u ON s.userId = u.id LEFT JOIN customers c ON s.customerId = c.id WHERE s.id = ?'
  ).get(id) as Record<string, unknown> | undefined
  if (!saleRow) return undefined

  const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(id) as Record<string, unknown>[]
  const payments = loadPayments(db, id)

  return {
    id: saleRow.id as number,
    invoiceNumber: saleRow.invoiceNumber as string,
    userId: saleRow.userId as number,
    userName: (saleRow.userName as string) ?? undefined,
    customerId: (saleRow.customerId as number) ?? undefined,
    customerName: (saleRow.customerName as string) ?? (saleRow.manualCustomerName as string) ?? undefined,
    customerType: (saleRow.customerType as 'real' | 'legal') ?? undefined,
    items: items.map(mapSaleItem),
    subtotal: saleRow.subtotal as number,
    total_amount: saleRow.total_amount as number,
    totalNetProfit: saleRow.totalNetProfit as number,
    paymentMethod: saleRow.paymentMethod as 'cash' | 'card' | 'ledger',
    customerPaid: saleRow.customerPaid as number,
    changeAmount: saleRow.changeAmount as number,
    description: (saleRow.description as string) ?? undefined,
    invoiceDescription: (saleRow.invoiceDescription as string) ?? undefined,
    manualCustomerName: (saleRow.manualCustomerName as string) ?? undefined,
    saleType: (saleRow.saleType as 'in-person' | 'online') ?? 'in-person',
    saleDate: (saleRow.saleDate as string) ?? (saleRow.createdAt as string),
    affectsInventory: (saleRow.affectsInventory ?? 1) === 1,
    shippingCost: (saleRow.shipping_cost as number) ?? 0,
    payments,
    createdAt: saleRow.createdAt as string,
  }
}

function loadPayments(db: any, saleId: number): { method: 'cash' | 'card' | 'card_to_card' | 'ledger'; amount: number }[] {
  try {
    return (db.prepare('SELECT method, amount FROM sale_payments WHERE saleId = ? ORDER BY id').all(saleId) as { method: string; amount: number }[])
      .map(r => ({ method: r.method as 'cash' | 'card' | 'card_to_card' | 'ledger', amount: r.amount }))
  } catch {
    return []
  }
}

export function getSalesByDateRange(startDate: string, endDate: string): Sale[] {
  const db = getDatabase()
  const sales = db.prepare(
    "SELECT s.*, u.name as userName, c.name as customerName, c.customerType as customerType FROM sales s LEFT JOIN users u ON s.userId = u.id LEFT JOIN customers c ON s.customerId = c.id WHERE date(s.saleDate) BETWEEN ? AND ? ORDER BY s.saleDate DESC"
  ).all(startDate, endDate) as Record<string, unknown>[]

  // Batch-load payment splits so we avoid an N+1 query per sale.
  let paymentsBySale: Record<number, { method: 'cash' | 'card' | 'card_to_card' | 'ledger'; amount: number }[]> = {}
  try {
    const ids = sales.map((s: any) => s.id)
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      const rows = db.prepare(`SELECT saleId, method, amount FROM sale_payments WHERE saleId IN (${placeholders}) ORDER BY id`).all(...ids) as { saleId: number; method: string; amount: number }[]
      paymentsBySale = rows.reduce((acc, r) => {
        (acc[r.saleId] = acc[r.saleId] || []).push({ method: r.method as 'cash' | 'card' | 'card_to_card' | 'ledger', amount: r.amount })
        return acc
      }, {} as Record<number, { method: 'cash' | 'card' | 'card_to_card' | 'ledger'; amount: number }[]>)
    }
  } catch { /* table may not exist on very old DBs */ }

  return sales.map(saleRow => {
    const id = saleRow.id as number
    const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(id) as Record<string, unknown>[]
    return {
      id,
      invoiceNumber: saleRow.invoiceNumber as string,
      userId: saleRow.userId as number,
      userName: (saleRow.userName as string) ?? undefined,
      customerId: (saleRow.customerId as number) ?? undefined,
      customerName: (saleRow.customerName as string) ?? (saleRow.manualCustomerName as string) ?? undefined,
    customerType: (saleRow.customerType as 'real' | 'legal') ?? undefined,
      items: items.map(mapSaleItem),
      subtotal: saleRow.subtotal as number,
      total_amount: saleRow.total_amount as number,
      totalNetProfit: saleRow.totalNetProfit as number,
      paymentMethod: saleRow.paymentMethod as 'cash' | 'card' | 'ledger',
      customerPaid: saleRow.customerPaid as number,
      changeAmount: saleRow.changeAmount as number,
      description: (saleRow.description as string) ?? undefined,
      invoiceDescription: (saleRow.invoiceDescription as string) ?? undefined,
      manualCustomerName: (saleRow.manualCustomerName as string) ?? undefined,
      saleType: (saleRow.saleType as 'in-person' | 'online') ?? 'in-person',
      saleDate: (saleRow.saleDate as string) ?? (saleRow.createdAt as string),
      affectsInventory: (saleRow.affectsInventory ?? 1) === 1,
      shippingCost: (saleRow.shipping_cost as number) ?? 0,
      payments: paymentsBySale[id] || [],
      createdAt: saleRow.createdAt as string,
    }
  })
}

export function getDailySalesSummary(date: string): {
  totalSales: number; transactionCount: number; cashTotal: number; cardTotal: number; ledgerTotal: number
} {
  const db = getDatabase()

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(total_amount), 0) as totalSales,
      COUNT(*) as transactionCount
    FROM sales WHERE date(saleDate) = ?
  `).get(date) as { totalSales: number; transactionCount: number }

  // Channel totals honour the exact split: sale_payments rows when present,
  // otherwise the legacy single method from the sales row.
  const split = db.prepare(`
    SELECT sp.method, COALESCE(SUM(sp.amount), 0) as amt
    FROM sale_payments sp JOIN sales s ON s.id = sp.saleId
    WHERE date(s.saleDate) = ? GROUP BY sp.method
  `).all(date) as { method: string; amt: number }[]

  const legacy = db.prepare(`
    SELECT s.paymentMethod, COALESCE(SUM(s.total_amount), 0) as amt
    FROM sales s
    WHERE date(s.saleDate) = ? AND NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.saleId = s.id)
    GROUP BY s.paymentMethod
  `).all(date) as { paymentMethod: string; amt: number }[]

  const byMethod: Record<string, number> = {}
  for (const r of split) byMethod[r.method] = (byMethod[r.method] || 0) + r.amt
  for (const r of legacy) byMethod[r.paymentMethod] = (byMethod[r.paymentMethod] || 0) + r.amt

  return {
    totalSales: totals.totalSales,
    transactionCount: totals.transactionCount,
    cashTotal: byMethod['cash'] || 0,
    cardTotal: (byMethod['card'] || 0) + (byMethod['card_to_card'] || 0),
    ledgerTotal: byMethod['ledger'] || 0,
  }
}

export function getUserPerformance(startDate?: string, endDate?: string): {
  userId: number; userName: string; invoiceCount: number; totalSales: number; totalProfit: number
}[] {
  const db = getDatabase()
  let query = `
    SELECT u.id as userId, u.name as userName,
      COUNT(s.id) as invoiceCount,
      COALESCE(SUM(s.total_amount), 0) as totalSales,
      COALESCE(SUM(s.totalNetProfit), 0) as totalProfit
    FROM users u LEFT JOIN sales s ON u.id = s.userId
  `
  const conditions: string[] = []
  const params: string[] = []
  if (startDate) { conditions.push('s.saleDate >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('s.saleDate <= ?'); params.push(endDate) }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
  query += ' GROUP BY u.id ORDER BY totalSales DESC'
  return db.prepare(query).all(...params) as any[]
}

export function getTopProducts(startDate?: string, endDate?: string, limit = 10): { productTitle: string; totalQty: number; totalRevenue: number }[] {
  const db = getDatabase()
  let query = `
    SELECT si.productTitle, SUM(si.quantity) as totalQty, SUM(si.subtotal) as totalRevenue
    FROM sale_items si
    JOIN sales s ON si.saleId = s.id
  `
  const conditions: string[] = []
  const params: string[] = []
  if (startDate) { conditions.push('s.saleDate >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('s.saleDate <= ?'); params.push(endDate) }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
  query += ' GROUP BY si.productTitle ORDER BY totalRevenue DESC LIMIT ?'
  params.push(String(limit))
  return db.prepare(query).all(...params) as any[]
}

function generateInvoiceNumber(dateStr?: string): string {
  const db = getDatabase()
  const d = dateStr ? new Date(dateStr) : new Date()
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const row = db.prepare("SELECT COUNT(*) as count FROM sales WHERE invoiceNumber LIKE ?").get(`INV-${datePart}-%`) as { count: number }
  const seq = String(row.count + 1).padStart(4, '0')
  return `INV-${datePart}-${seq}`
}

function mapSaleItem(row: Record<string, unknown>): any {
  return {
    id: row.id as number, saleId: row.saleId as number, productId: row.productId as number,
    productTitle: row.productTitle as string, quantity: row.quantity as number,
    unitPrice: row.unitPrice as number, purchasePrice: (row.purchasePrice as number) ?? 0,
    subtotal: row.subtotal as number, netProfit: (row.netProfit as number) ?? 0,
  }
}
