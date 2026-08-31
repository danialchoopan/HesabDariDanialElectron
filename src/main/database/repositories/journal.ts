/**
 * Journal repository — manages double-entry accounting entries.
 *
 * Core principle: every journal entry must have equal total debits and credits
 * (within 0.01 tolerance for floating-point rounding).
 *
 * Auto-posting functions create journal entries automatically when sales,
 * expenses, or returns are recorded — ensuring the general ledger stays
 * in sync with business transactions without manual intervention.
 */

import { getDatabase } from '../connection'
import type { JournalEntry, JournalLine, JournalEntryWithLines, TrialBalanceRow, LedgerRow } from '../../../types'
import { getAccountByCode } from './accounts'

/** Single journal entry line with debit/credit amounts */
interface JournalLineInput {
  accountId: number; debit: number; credit: number; description?: string
}

/**
 * Creates a balanced journal entry with multiple lines.
 * Validates that total debits == total credits (within 0.01 tolerance).
 * Wraps the insert in a database transaction for atomicity.
 *
 * @throws Error if debits and credits are not balanced
 */
export function createJournalEntry(data: {
  entryDate: string; description: string
  referenceType?: string; referenceId?: number
  lines: JournalLineInput[]; createdBy?: number
}): JournalEntry {
  const db = getDatabase()
  const totalDebit = data.lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = data.lines.reduce((s, l) => s + l.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw new Error(`Debit ${totalDebit} ≠ Credit ${totalCredit}`)

  const entry = db.transaction(() => {
    const r = db.prepare(
      'INSERT INTO journal_entries (entryDate, description, referenceType, referenceId, isPosted, createdBy) VALUES (?, ?, ?, ?, 1, ?)'
    ).run(data.entryDate, data.description, data.referenceType ?? null, data.referenceId ?? null, data.createdBy ?? null)
    const entryId = r.lastInsertRowid as number
    const insertLine = db.prepare(
      'INSERT INTO journal_entry_lines (entryId, accountId, debit, credit, description) VALUES (?, ?, ?, ?, ?)'
    )
    for (const line of data.lines) {
      insertLine.run(entryId, line.accountId, line.debit, line.credit, line.description ?? '')
    }
    return entryId
  })()

  return db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(entry) as JournalEntry
}

/**
 * Auto-posts a 4-line journal entry for a completed sale:
 *   Debit:  Receive account (cash=1100, bank=1200, or A/R=1400)
 *   Credit: Sales revenue (4100)
 *   Debit:  Cost of goods sold (5100)
 *   Credit: Inventory reduction (1300)
 */
export function postSaleJournal(saleId: number, saleDate: string, data: {
  items: { purchasePrice: number; quantity: number }[]
  total_amount: number; paymentMethod: string
  affectsInventory?: boolean
}): void {
  const cashAcct = getAccountByCode('1100')
  const bankAcct = getAccountByCode('1200')
  const arAcct = getAccountByCode('1400')
  const salesAcct = getAccountByCode('4100')
  if (!cashAcct || !bankAcct || !arAcct || !salesAcct) {
    console.error('[Journal] Missing required account codes for sale journal'); return
  }

  const receiveAccount = data.paymentMethod === 'cash' ? cashAcct : data.paymentMethod === 'card' ? bankAcct : arAcct
  const lines: { accountId: number; debit: number; credit: number; description: string }[] = [
    { accountId: receiveAccount.id, debit: data.total_amount, credit: 0, description: 'دریافت وجه' },
    { accountId: salesAcct.id, debit: 0, credit: data.total_amount, description: 'درآمد فروش' },
  ]

  // Only post COGS/inventory lines if inventory was affected
  if (data.affectsInventory !== false) {
    const inventoryAcct = getAccountByCode('1300')
    const cogsAcct = getAccountByCode('5100')
    if (inventoryAcct && cogsAcct) {
      const cogs = data.items.reduce((s, i) => s + i.purchasePrice * i.quantity, 0)
      lines.push(
        { accountId: cogsAcct.id, debit: cogs, credit: 0, description: 'بهای تمام شده' },
        { accountId: inventoryAcct.id, debit: 0, credit: cogs, description: 'کاهش موجودی' },
      )
    }
  }

  createJournalEntry({
    entryDate: saleDate, description: `فروش فاکتور #${saleId}`,
    referenceType: 'sale', referenceId: saleId,
    lines,
  })
}

/**
 * Auto-posts a 2-line journal entry for an expense:
 *   Debit:  Expense account (mapped by category name, e.g. اجاره→6100)
 *   Credit: Cash (1100)
 */
export function postExpenseJournal(expenseId: number, expenseDate: string, amount: number, category: string): void {
  const cashAcct = getAccountByCode('1100')
  const categoryMap: Record<string, string> = {
    'اجاره': '6100', 'قبوض': '6200', 'حقوق': '6300', 'لوازم': '6400',
    'تعمیرات': '6500', 'حمل\u200cونقل': '6600',
  }
  const code = categoryMap[category] || '6700'
  const expenseAcct = getAccountByCode(code) || getAccountByCode('6700')
  if (!cashAcct || !expenseAcct) {
    console.error('[Journal] Missing account codes for expense journal'); return
  }

  createJournalEntry({
    entryDate: expenseDate, description: `هزینه: ${category}`,
    referenceType: 'expense', referenceId: expenseId,
    lines: [
      { accountId: expenseAcct.id, debit: amount, credit: 0, description: category },
      { accountId: cashAcct.id, debit: 0, credit: amount, description: 'پرداخت نقدی' },
    ]
  })
}

/**
 * Auto-posts a journal entry for a product return. The 4-line reversal:
 *   1. Debit  Sales revenue (4100) — reverses the original sale revenue
 *   2. Credit Receive account (cash=1100, bank=1200, or A/R=1400) — matches the
 *      original sale's payment method so receivable/cash reverses correctly
 *   3. Debit  Inventory (1300) — stock value returns (if cogsAmount > 0)
 *   4. Credit COGS (5100) — cost of goods sold is reversed (if cogsAmount > 0)
 *
 * Lines 3-4 are conditional: only posted when there's a COGS amount to reverse,
 * which means the original sale affected inventory.
 */
export function postReturnJournal(returnId: number, returnDate: string, refundAmount: number, cogsAmount: number = 0, originalPaymentMethod?: string): void {
  const cashAcct = getAccountByCode('1100')
  const bankAcct = getAccountByCode('1200')
  const arAcct = getAccountByCode('1400')
  const salesAcct = getAccountByCode('4100')
  if (!cashAcct || !salesAcct) {
    console.error('[Journal] Missing account codes for return journal'); return
  }

  // Refund goes back through the same channel the customer paid with.
  const refundAccount = originalPaymentMethod === 'ledger' && arAcct
    ? arAcct
    : originalPaymentMethod === 'card' && bankAcct
      ? bankAcct
      : cashAcct

  const lines: { accountId: number; debit: number; credit: number; description: string }[] = [
    { accountId: salesAcct.id, debit: refundAmount, credit: 0, description: 'کاهش درآمد' },
    { accountId: refundAccount.id, debit: 0, credit: refundAmount, description: 'بازپرداخت وجه' },
  ]

  // Reverse COGS/inventory if we have the cost amount
  if (cogsAmount > 0) {
    const inventoryAcct = getAccountByCode('1300')
    const cogsAcct = getAccountByCode('5100')
    if (inventoryAcct && cogsAcct) {
      lines.push(
        { accountId: inventoryAcct.id, debit: cogsAmount, credit: 0, description: 'بازگشت موجودی' },
        { accountId: cogsAcct.id, debit: 0, credit: cogsAmount, description: 'کاهش بهای تمام شده' },
      )
    }
  }

  createJournalEntry({
    entryDate: returnDate, description: `مرجوعی فاکتور #${returnId}`,
    referenceType: 'return', referenceId: returnId,
    lines,
  })
}

/**
 * Returns paginated journal entries with optional date range and type filters.
 * Orders by date descending (newest first).
 */
export function getJournalEntries(filters: {
  startDate?: string; endDate?: string; referenceType?: string
  limit?: number; offset?: number
}): { entries: JournalEntry[]; total: number } {
  const db = getDatabase()
  let where = 'WHERE 1=1'
  const params: any[] = []
  if (filters.startDate) { where += ' AND entryDate >= ?'; params.push(filters.startDate) }
  if (filters.endDate) { where += ' AND entryDate <= ?'; params.push(filters.endDate) }
  if (filters.referenceType) { where += ' AND referenceType = ?'; params.push(filters.referenceType) }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM journal_entries ${where}`).get(...params) as { c: number }).c
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0
  // Include per-entry debit/credit totals (the UI sums these for the summary cards)
  const entries = db.prepare(`
    SELECT je.*,
      (SELECT COALESCE(SUM(jel.debit), 0) FROM journal_entry_lines jel WHERE jel.entryId = je.id) as totalDebit,
      (SELECT COALESCE(SUM(jel.credit), 0) FROM journal_entry_lines jel WHERE jel.entryId = je.id) as totalCredit
    FROM journal_entries je ${where} ORDER BY je.entryDate DESC, je.id DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as JournalEntry[]
  return { entries, total }
}

/** Returns a single journal entry with all its debit/credit lines. */
export function getJournalEntryById(id: number): JournalEntryWithLines | undefined {
  const db = getDatabase()
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id) as JournalEntry | undefined
  if (!entry) return undefined
  const lines = db.prepare(`
    SELECT jel.*, a.code as accountCode, a.name as accountName
    FROM journal_entry_lines jel
    LEFT JOIN accounts a ON a.id = jel.accountId
    WHERE jel.entryId = ? ORDER BY jel.id
  `).all(id) as JournalLine[]
  return { ...entry, lines }
}

/**
 * Returns trial balance: aggregated debit, credit, and net balance per account.
 * Optionally filtered by date range.
 * Balance = totalDebit - totalCredit (positive for asset/expense, negative for liability/income).
 */
export function getTrialBalance(startDate?: string, endDate?: string): TrialBalanceRow[] {
  const db = getDatabase()
  let joinClause = ''
  let whereClause = ''
  const params: any[] = []
  if (startDate || endDate) {
    joinClause = 'JOIN journal_entries je ON je.id = jel.entryId'
    if (startDate) { whereClause += ' AND je.entryDate >= ?'; params.push(startDate) }
    if (endDate) { whereClause += ' AND je.entryDate <= ?'; params.push(endDate) }
  }
  return db.prepare(`
    SELECT a.id as accountId, a.code as accountCode, a.name as accountName, a.type as accountType,
           COALESCE(SUM(jel.debit), 0) as totalDebit,
           COALESCE(SUM(jel.credit), 0) as totalCredit,
           COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0) as balance
    FROM accounts a
    LEFT JOIN journal_entry_lines jel ON jel.accountId = a.id
    ${joinClause}
    WHERE a.isActive = 1 ${whereClause}
    GROUP BY a.id
    ORDER BY a.code
  `).all(...params) as TrialBalanceRow[]
}

/**
 * Generates a cash flow report by summing debits (inflows) and credits (outflows)
 * on cash/bank accounts (codes 1100 and 1200).
 */
export function generateCashFlow(startDate?: string, endDate?: string): { operating: { label: string; amount: number }[]; totalInflow: number; totalOutflow: number; netChange: number } {
  const db = getDatabase()
  let where = 'WHERE 1=1'
  const params: any[] = []
  if (startDate) { where += ' AND je.entryDate >= ?'; params.push(startDate) }
  if (endDate) { where += ' AND je.entryDate <= ?'; params.push(endDate) }

  const cashIn = db.prepare(`
    SELECT COALESCE(SUM(jel.debit), 0) as amount
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entryId
    JOIN accounts a ON a.id = jel.accountId
    ${where} AND a.code IN ('1100', '1200')
  `).get(...params) as { amount: number }

  const cashOut = db.prepare(`
    SELECT COALESCE(SUM(jel.credit), 0) as amount
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entryId
    JOIN accounts a ON a.id = jel.accountId
    ${where} AND a.code IN ('1100', '1200')
  `).get(...params) as { amount: number }

  return {
    operating: [
      { label: 'دریافتی از فروش', amount: cashIn.amount },
      { label: 'پرداختی بابت هزینه‌ها', amount: cashOut.amount },
    ],
    totalInflow: cashIn.amount,
    totalOutflow: cashOut.amount,
    netChange: cashIn.amount - cashOut.amount,
  }
}

/**
 * Returns the general ledger for a specific account with running balance.
 * Each row shows: date, description, debit, credit, and cumulative balance.
 */
export function getGeneralLedger(accountId: number, startDate?: string, endDate?: string): LedgerRow[] {
  const db = getDatabase()
  let where = 'WHERE jel.accountId = ?'
  const params: any[] = [accountId]
  if (startDate) { where += ' AND je.entryDate >= ?'; params.push(startDate) }
  if (endDate) { where += ' AND je.entryDate <= ?'; params.push(endDate) }
  const rows = db.prepare(`
    SELECT je.entryDate, jel.description, je.referenceType,
           jel.debit, jel.credit
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entryId
    ${where}
    ORDER BY je.entryDate, je.id
  `).all(...params) as Omit<LedgerRow, 'balance'>[]
  let runningBalance = 0
  return rows.map(r => {
    runningBalance += r.debit - r.credit
    return { ...r, balance: runningBalance }
  })
}

/**
 * Reverse a journal entry for a deleted expense or sale.
 * Creates a compensating entry that reverses the original.
 */
export function reverseExpenseJournal(expenseId: number, referenceType: string): void {
  const db = getDatabase()
  // Find the original journal entry
  const entry = db.prepare(
    "SELECT * FROM journal_entries WHERE referenceType = ? AND referenceId = ?"
  ).get(referenceType, expenseId) as { id: number } | undefined
  if (!entry) return

  // Get the lines
  const lines = db.prepare('SELECT * FROM journal_entry_lines WHERE entryId = ?').all(entry.id) as { accountId: number; debit: number; credit: number; description: string }[]
  if (lines.length === 0) return

  // Create reverse entry: swap debit and credit
  const reverseLines = lines.map(l => ({
    accountId: l.accountId,
    debit: l.credit,
    credit: l.debit,
    description: `برگشت: ${l.description}`,
  }))
  createJournalEntry({
    entryDate: new Date().toISOString().slice(0, 10),
    description: `برگشت هزینه #${expenseId}`,
    referenceType: 'reversal',
    referenceId: expenseId,
    lines: reverseLines,
  })
}
