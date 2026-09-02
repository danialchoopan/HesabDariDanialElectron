/**
 * Sales Reports repository — advanced analytics queries for sales data.
 *
 * Provides three report types:
 *   1. Best-Selling Products: top products by quantity/revenue with period comparison
 *   2. Sales by Hour: hourly distribution with heatmap data and day-of-week patterns
 *   3. Period Comparison: compare any two date ranges with percentage changes
 *
 * All queries use SQLite aggregation (GROUP BY, date functions) for offline computation.
 * Results are formatted with Iranian number labels (هزار/میلیون/میلیارد) in the UI layer.
 */

import { getDatabase } from '../connection'

// ─── Best-Selling Products ───────────────────────────────

export interface BestSellingProduct {
  rank: number
  productId: number
  productTitle: string
  barcode: string
  category: string
  unitsSold: number
  totalRevenue: number
  avgPrice: number
  prevUnitsSold: number
  prevTotalRevenue: number
}

/**
 * Get best-selling products for a date range, with previous period comparison.
 * @param startDate - Start of current period (YYYY-MM-DD)
 * @param endDate - End of current period (YYYY-MM-DD)
 * @param categoryFilter - Optional category filter
 * @param limit - Max products to return (default 20)
 */
export function getBestSellingProducts(
  startDate?: string, endDate?: string, categoryFilter?: string, limit: number = 20
): BestSellingProduct[] {
  const db = getDatabase()

  const where = ['s.affectsInventory = 1']
  const params: any[] = []
  if (startDate) { where.push('s.saleDate >= ?'); params.push(startDate) }
  if (endDate) { where.push('s.saleDate <= ?'); params.push(endDate) }
  if (categoryFilter && categoryFilter !== 'all') { where.push('p.category = ?'); params.push(categoryFilter) }
  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''

  // Calculate previous period length for comparison
  let prevWhere = [...where.filter(w => !w.includes('s.saleDate'))]
  const prevParams: any[] = []
  if (startDate && endDate) {
    const startD = new Date(startDate)
    const endD = new Date(endDate)
    const periodDays = Math.ceil((endD.getTime() - startD.getTime()) / 86400000) + 1
    const prevEnd = new Date(startD)
    prevEnd.setDate(prevEnd.getDate() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevStart.getDate() - periodDays + 1)
    prevWhere.push('s.saleDate >= ? AND s.saleDate <= ?')
    prevParams.push(prevStart.toISOString().slice(0, 10), prevEnd.toISOString().slice(0, 10))
  } else if (startDate) {
    prevWhere.push('s.saleDate < ?')
    prevParams.push(startDate)
  } else if (endDate) {
    prevWhere.push('s.saleDate <= ?')
    prevParams.push(endDate)
  }
  if (categoryFilter && categoryFilter !== 'all') { prevWhere.push('p.category = ?'); prevParams.push(categoryFilter) }

  const prevWhereClause = prevWhere.length > 0 ? 'WHERE ' + prevWhere.join(' AND ') : ''

  const rows = db.prepare(`
    SELECT p.id as productId, p.title as productTitle, p.barcode, p.category,
      COALESCE(SUM(si.quantity), 0) as unitsSold,
      COALESCE(SUM(si.subtotal), 0) as totalRevenue,
      CASE WHEN SUM(si.quantity) > 0 THEN SUM(si.subtotal) / SUM(si.quantity) ELSE 0 END as avgPrice
    FROM products p
    JOIN sale_items si ON p.id = si.productId
    JOIN sales s ON si.saleId = s.id
    ${whereClause}
    GROUP BY p.id
    ORDER BY unitsSold DESC
    LIMIT ?
  `).all(...params, limit) as any[]

  // Get previous period data for each product
  const prevRows = db.prepare(`
    SELECT p.id as productId,
      COALESCE(SUM(si.quantity), 0) as prevUnitsSold,
      COALESCE(SUM(si.subtotal), 0) as prevTotalRevenue
    FROM products p
    JOIN sale_items si ON p.id = si.productId
    JOIN sales s ON si.saleId = s.id
    ${prevWhereClause}
    GROUP BY p.id
  `).all(...prevParams) as { productId: number; prevUnitsSold: number; prevTotalRevenue: number }[]

  const prevMap = new Map(prevRows.map(r => [r.productId, r]))

  return rows.map((r, i) => {
    const prev = prevMap.get(r.productId)
    return {
      rank: i + 1,
      ...r,
      prevUnitsSold: prev?.prevUnitsSold ?? 0,
      prevTotalRevenue: prev?.prevTotalRevenue ?? 0,
    }
  })
}

// ─── Sales by Hour ───────────────────────────────────────

export interface HourlySalesData {
  hour: number
  ordersCount: number
  totalRevenue: number
  avgOrderValue: number
}

export interface DailySalesData {
  dayOfWeek: number
  dayName: string
  ordersCount: number
  totalRevenue: number
}

/**
 * Get hourly sales distribution for a date range.
 * Returns data for each hour (0-23) with order count and revenue.
 */
export function getSalesByHour(
  startDate?: string, endDate?: string
): HourlySalesData[] {
  const db = getDatabase()
  const where: string[] = []
  const params: any[] = []
  if (startDate) { where.push('saleDate >= ?'); params.push(startDate) }
  if (endDate) { where.push('saleDate <= ?'); params.push(endDate) }
  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''

  const rows = db.prepare(`
    SELECT
      CAST(strftime('%H', saleDate) AS INTEGER) as hour,
      COUNT(*) as ordersCount,
      COALESCE(SUM(total_amount), 0) as totalRevenue,
      CASE WHEN COUNT(*) > 0 THEN SUM(total_amount) / COUNT(*) ELSE 0 END as avgOrderValue
    FROM sales
    ${whereClause}
    GROUP BY hour
    ORDER BY hour
  `).all(...params) as any[]

  // Fill all 24 hours (including zero-count hours)
  const hourMap = new Map(rows.map(r => [r.hour, r]))
  const result: HourlySalesData[] = []
  for (let h = 0; h < 24; h++) {
    const row = hourMap.get(h)
    result.push({
      hour: h,
      ordersCount: row?.ordersCount ?? 0,
      totalRevenue: row?.totalRevenue ?? 0,
      avgOrderValue: row?.avgOrderValue ?? 0,
    })
  }
  return result
}

const DAY_NAMES = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']

/**
 * Get sales by day of week for a date range.
 * Shows which days have the most/least sales.
 */
export function getSalesByDayOfWeek(
  startDate?: string, endDate?: string
): DailySalesData[] {
  const db = getDatabase()
  const where: string[] = []
  const params: any[] = []
  if (startDate) { where.push('saleDate >= ?'); params.push(startDate) }
  if (endDate) { where.push('saleDate <= ?'); params.push(endDate) }
  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''

  // SQLite: 0=Sunday, 1=Monday, ..., 6=Saturday
  // Convert to Iranian week: 0=Shanbe(Sat), 1=Yekshanbe(Sun), ..., 6=Jome(Fri)
  const rows = db.prepare(`
    SELECT
      (CAST(strftime('%w', saleDate) AS INTEGER) + 1) % 7 as dayOfWeek,
      COUNT(*) as ordersCount,
      COALESCE(SUM(total_amount), 0) as totalRevenue
    FROM sales
    ${whereClause}
    GROUP BY dayOfWeek
    ORDER BY dayOfWeek
  `).all(...params) as any[]

  const dayMap = new Map(rows.map(r => [r.dayOfWeek, r]))
  const result: DailySalesData[] = []
  for (let d = 0; d < 7; d++) {
    const row = dayMap.get(d)
    result.push({
      dayOfWeek: d,
      dayName: DAY_NAMES[d],
      ordersCount: row?.ordersCount ?? 0,
      totalRevenue: row?.totalRevenue ?? 0,
    })
  }
  return result
}

// ─── Period Comparison ───────────────────────────────────

export interface PeriodComparison {
  currentPeriod: { startDate: string; endDate: string }
  previousPeriod: { startDate: string; endDate: string }
  totalSales: { current: number; previous: number; change: number; changePercent: number }
  ordersCount: { current: number; previous: number; change: number; changePercent: number }
  avgOrderValue: { current: number; previous: number; change: number; changePercent: number }
  cashSales: { current: number; previous: number; change: number; changePercent: number }
  cardSales: { current: number; previous: number; change: number; changePercent: number }
  ledgerSales: { current: number; previous: number; change: number; changePercent: number }
  categoryComparison: { category: string; current: number; previous: number; change: number; changePercent: number }[]
}

function getSalesSummary(startDate: string, endDate: string) {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(total_amount), 0) as totalSales,
      COUNT(*) as ordersCount,
      CASE WHEN COUNT(*) > 0 THEN SUM(total_amount) / COUNT(*) ELSE 0 END as avgOrderValue
    FROM sales
    WHERE saleDate >= ? AND saleDate <= ?
  `).get(startDate, endDate) as any

  // Channel totals honour the exact payment split (sale_payments) and fall
  // back to the single method on legacy rows that have no split.
  const split = db.prepare(`
    SELECT sp.method, COALESCE(SUM(sp.amount), 0) as amt
    FROM sale_payments sp JOIN sales s ON s.id = sp.saleId
    WHERE s.saleDate >= ? AND s.saleDate <= ? GROUP BY sp.method
  `).all(startDate, endDate) as { method: string; amt: number }[]
  const legacy = db.prepare(`
    SELECT s.paymentMethod, COALESCE(SUM(s.total_amount), 0) as amt
    FROM sales s
    WHERE s.saleDate >= ? AND s.saleDate <= ? AND NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.saleId = s.id)
    GROUP BY s.paymentMethod
  `).all(startDate, endDate) as { paymentMethod: string; amt: number }[]
  const byMethod: Record<string, number> = {}
  for (const r of split) byMethod[r.method] = (byMethod[r.method] || 0) + r.amt
  for (const r of legacy) byMethod[r.paymentMethod] = (byMethod[r.paymentMethod] || 0) + r.amt

  return {
    totalSales: row.totalSales || 0,
    ordersCount: row.ordersCount || 0,
    avgOrderValue: row.avgOrderValue || 0,
    cashSales: byMethod['cash'] || 0,
    cardSales: (byMethod['card'] || 0) + (byMethod['card_to_card'] || 0),
    ledgerSales: byMethod['ledger'] || 0,
  }
}

function calcChange(current: number, previous: number) {
  const change = current - previous
  const changePercent = previous !== 0 ? (change / Math.abs(previous)) * 100 : current > 0 ? 100 : 0
  return { current, previous, change, changePercent }
}

/**
 * Compare two periods with detailed breakdown.
 * @param currentStart - Start of current period
 * @param currentEnd - End of current period
 * @param previousStart - Start of previous period
 * @param previousEnd - End of previous period
 */
export function getPeriodComparison(
  currentStart: string, currentEnd: string,
  previousStart: string, previousEnd: string
): PeriodComparison {
  const current = getSalesSummary(currentStart, currentEnd)
  const previous = getSalesSummary(previousStart, previousEnd)

  // Category comparison
  const db = getDatabase()
  const catCurrent = db.prepare(`
    SELECT p.category, COALESCE(SUM(si.subtotal), 0) as total
    FROM sale_items si
    JOIN sales s ON si.saleId = s.id
    JOIN products p ON si.productId = p.id
    WHERE s.saleDate >= ? AND s.saleDate <= ?
    GROUP BY p.category
  `).all(currentStart, currentEnd) as { category: string; total: number }[]

  const catPrevious = db.prepare(`
    SELECT p.category, COALESCE(SUM(si.subtotal), 0) as total
    FROM sale_items si
    JOIN sales s ON si.saleId = s.id
    JOIN products p ON si.productId = p.id
    WHERE s.saleDate >= ? AND s.saleDate <= ?
    GROUP BY p.category
  `).all(previousStart, previousEnd) as { category: string; total: number }[]

  const catPrevMap = new Map(catPrevious.map(r => [r.category, r.total]))
  const allCats = new Set([...catCurrent.map(r => r.category), ...catPrevious.map(r => r.category)])
  const categoryComparison = Array.from(allCats).map(cat => {
    const cur = catCurrent.find(r => r.category === cat)?.total ?? 0
    const prev = catPrevMap.get(cat) ?? 0
    return { category: cat || 'سایر', ...calcChange(cur, prev) }
  }).sort((a, b) => b.current - a.current)

  return {
    currentPeriod: { startDate: currentStart, endDate: currentEnd },
    previousPeriod: { startDate: previousStart, endDate: previousEnd },
    totalSales: calcChange(current.totalSales, previous.totalSales),
    ordersCount: calcChange(current.ordersCount, previous.ordersCount),
    avgOrderValue: calcChange(current.avgOrderValue, previous.avgOrderValue),
    cashSales: calcChange(current.cashSales, previous.cashSales),
    cardSales: calcChange(current.cardSales, previous.cardSales),
    ledgerSales: calcChange(current.ledgerSales, previous.ledgerSales),
    categoryComparison,
  }
}
