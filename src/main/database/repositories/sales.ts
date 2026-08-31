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
import { getAutoRounding } from './settings'
import { updateCustomerBalance, addLedgerEntry } from './customers'
import { roundToNearest, calculateLineSubtotal, calculateLineProfit } from '../../utils/math'
import { postSaleJournal } from './journal'

export function createSale(input: SaleInput): Sale {
  const db = getDatabase()
  const saleDate = input.saleDate || new Date().toISOString().slice(0, 19).replace('T', ' ')
  const affectsInventory = input.affectsInventory !== false ? 1 : 0
  const invoiceNumber = generateInvoiceNumber(saleDate)
  const roundTo = getAutoRounding()

  let rawSubtotal = 0
  for (const item of input.items) {
    rawSubtotal += calculateLineSubtotal(item.unitPrice, item.quantity)
  }

  const total_amount = roundToNearest(rawSubtotal, roundTo) + (input.shippingCost || 0)

  const changeAmount = input.paymentMethod === 'cash'
    ? Math.max(0, input.customerPaid - total_amount)
    : 0

  const createSaleTx = db.transaction(() => {
    const saleResult = db.prepare(`
      INSERT INTO sales (invoiceNumber, userId, customerId, subtotal, total_amount, totalNetProfit, paymentMethod, customerPaid, changeAmount, description, invoiceDescription, manualCustomerName, saleType, saleDate, affectsInventory, shipping_cost)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceNumber, input.userId, input.customerId ?? null,
      rawSubtotal, total_amount, input.paymentMethod, input.customerPaid, changeAmount,
      input.description || '', input.invoiceDescription || '', input.manualCustomerName || '', input.saleType || 'in-person',
      saleDate, affectsInventory, input.shippingCost || 0
    )
    const saleId = saleResult.lastInsertRowid as number

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

    if (input.paymentMethod === 'ledger' && input.customerId) {
      updateCustomerBalance(input.customerId, -total_amount)
      addLedgerEntry(input.customerId, saleId, 'sale', total_amount, `خرید فاکتور ${invoiceNumber}`)
    }

    return saleId
  })

  const saleId = createSaleTx()

  try {
    postSaleJournal(saleId, saleDate.slice(0, 10), {
      items: input.items.map(i => ({ purchasePrice: i.purchasePrice, quantity: i.quantity })),
      total_amount, paymentMethod: input.paymentMethod,
      affectsInventory: affectsInventory === 1,
    })
  } catch (err) {
    console.error(`[Sales] Journal posting failed for sale ${saleId}:`, err)
  }

  return getSaleById(saleId)!
}

export function getSaleById(id: number): Sale | undefined {
  const db = getDatabase()
  const saleRow = db.prepare(
    'SELECT s.*, u.name as userName, c.name as customerName FROM sales s LEFT JOIN users u ON s.userId = u.id LEFT JOIN customers c ON s.customerId = c.id WHERE s.id = ?'
  ).get(id) as Record<string, unknown> | undefined
  if (!saleRow) return undefined

  const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(id) as Record<string, unknown>[]

  return {
    id: saleRow.id as number,
    invoiceNumber: saleRow.invoiceNumber as string,
    userId: saleRow.userId as number,
    userName: (saleRow.userName as string) ?? undefined,
    customerId: (saleRow.customerId as number) ?? undefined,
    customerName: (saleRow.customerName as string) ?? (saleRow.manualCustomerName as string) ?? undefined,
    items: items.map(mapSaleItem),
    subtotal: saleRow.subtotal as number,
    total_amount: saleRow.total_amount as number,
    paymentMethod: saleRow.paymentMethod as 'cash' | 'card' | 'ledger',
    customerPaid: saleRow.customerPaid as number,
    changeAmount: saleRow.changeAmount as number,
    description: (saleRow.description as string) ?? undefined,
    invoiceDescription: (saleRow.invoiceDescription as string) ?? undefined,
    manualCustomerName: (saleRow.manualCustomerName as string) ?? undefined,
    saleType: (saleRow.saleType as 'in-person' | 'online') ?? 'in-person',
    saleDate: (saleRow.saleDate as string) ?? (saleRow.createdAt as string),
    affectsInventory: (saleRow.affectsInventory ?? 1) === 1,
    createdAt: saleRow.createdAt as string,
  }
}

export function getSalesByDateRange(startDate: string, endDate: string): Sale[] {
  const db = getDatabase()
  const sales = db.prepare(
    "SELECT s.*, u.name as userName, c.name as customerName FROM sales s LEFT JOIN users u ON s.userId = u.id LEFT JOIN customers c ON s.customerId = c.id WHERE date(s.saleDate) BETWEEN ? AND ? ORDER BY s.saleDate DESC"
  ).all(startDate, endDate) as Record<string, unknown>[]

  return sales.map(saleRow => {
    const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(saleRow.id) as Record<string, unknown>[]
    return {
      id: saleRow.id as number,
      invoiceNumber: saleRow.invoiceNumber as string,
      userId: saleRow.userId as number,
      userName: (saleRow.userName as string) ?? undefined,
      customerId: (saleRow.customerId as number) ?? undefined,
      customerName: (saleRow.customerName as string) ?? (saleRow.manualCustomerName as string) ?? undefined,
      items: items.map(mapSaleItem),
      subtotal: saleRow.subtotal as number,
      total_amount: saleRow.total_amount as number,
      paymentMethod: saleRow.paymentMethod as 'cash' | 'card' | 'ledger',
      customerPaid: saleRow.customerPaid as number,
      changeAmount: saleRow.changeAmount as number,
      description: (saleRow.description as string) ?? undefined,
      invoiceDescription: (saleRow.invoiceDescription as string) ?? undefined,
      manualCustomerName: (saleRow.manualCustomerName as string) ?? undefined,
      saleType: (saleRow.saleType as 'in-person' | 'online') ?? 'in-person',
      saleDate: (saleRow.saleDate as string) ?? (saleRow.createdAt as string),
      affectsInventory: (saleRow.affectsInventory ?? 1) === 1,
      createdAt: saleRow.createdAt as string,
    }
  })
}

export function getDailySalesSummary(date: string): {
  totalSales: number; transactionCount: number; cashTotal: number; cardTotal: number; ledgerTotal: number
} {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(total_amount), 0) as totalSales,
      COUNT(*) as transactionCount,
      COALESCE(SUM(CASE WHEN paymentMethod = 'cash' THEN total_amount ELSE 0 END), 0) as cashTotal,
      COALESCE(SUM(CASE WHEN paymentMethod = 'card' THEN total_amount ELSE 0 END), 0) as cardTotal,
      COALESCE(SUM(CASE WHEN paymentMethod = 'ledger' THEN total_amount ELSE 0 END), 0) as ledgerTotal
    FROM sales WHERE date(saleDate) = ?
  `).get(date) as Record<string, number>
  return { totalSales: row.totalSales, transactionCount: row.transactionCount, cashTotal: row.cashTotal, cardTotal: row.cardTotal, ledgerTotal: row.ledgerTotal }
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
