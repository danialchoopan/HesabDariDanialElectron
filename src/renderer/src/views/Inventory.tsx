/**
 * Inventory — inventory management, reporting, and adjustment screen.
 *
 * Three tabs:
 *   1. Products: paginated list with search, category/stock filters, inline editing,
 *      restock panel (additive), QR label printing, barcode printing
 *   2. Report: category valuation charts, slow-moving items, A4 print, Excel export
 *   3. Audit: audit log with date range and action type filters
 *
 * Inventory Adjustment feature:
 *   - Search and select a product
 *   - Set an absolute stock value (corrects actual count)
 *   - Choose adjustment type: manual, reconciliation, damage, count, other
 *   - Add reason and optional back-date for document reconciliation
 *   - View adjustment history with before/after/delta columns
 *
 * Stock editing paths:
 *   - Restock panel: additive only (stock += qty), via IPC updateStock()
 *   - Inline edit: sets absolute value, no audit trail
 *   - Adjustment dialog: sets absolute value with full audit trail
 */

import { useState, useEffect } from 'react'
import type { Product } from '../../../types'
import { fa } from '../i18n'
import { generateReceiptHTML, printContent } from '../utils/receipt'
import { gregorianToJalali, formatDateNow, formatPriceFA, formatPriceFull } from '../utils/jalali'
import Pagination from '../components/ui/Pagination'
import ShamsiDateInput from '../components/business/ShamsiDateInput'
import HelpPopup from '../components/ui/HelpPopup'
import { useTheme } from '../hooks/useTheme'
import { useSettingsStore } from '../store/settingsStore'
import { printA4Report, downloadExcel } from '../utils/a4Print'
import { useSortable } from '../hooks/useSortable'
import PrintDialog from '../components/print/PrintDialog'
import BulkPriceUpdateDialog from './BulkPriceUpdateDialog'
import { useHighlight } from '../hooks/useHighlight'
import { getProductImageUrl } from '../utils/productImage'
import { generateQRSvg } from '../utils/qrCode'
import { InlineEditCell } from '../components/ui/FormattedPriceInput'
import InventoryAnalytics from './InventoryAnalytics'
import ExpiryAlerts, { ExpiryBadge } from './ExpiryAlerts'
import ProfitReport from './ProfitReport'

const primary = '#006194'

type AuditFilter = 'all' | 'create' | 'update' | 'delete' | 'restock'

interface Props {
  initialTab?: string
  highlightId?: string
  onHighlightDone?: () => void
}

export default function Inventory({ initialTab, highlightId, onHighlightDone }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [lowStock, setLowStock] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStock, setFilterStock] = useState('all')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [restockQty, setRestockQty] = useState('')
  const [restockReason, setRestockReason] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [catPage, setCatPage] = useState(0)
  const [slowPage, setSlowPage] = useState(0)
  const [tab, setTab] = useState<'products' | 'report' | 'analytics' | 'expiry' | 'profit' | 'audit'>((initialTab as any) || 'products')
  const [auditLog, setAuditLog] = useState<any[]>([])
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all')
  const [auditStartDate, setAuditStartDate] = useState('')
  const [auditEndDate, setAuditEndDate] = useState('')
  const [auditPage, setAuditPage] = useState(0)
  const [auditPageSize, setAuditPageSize] = useState(10)
  const [reportData, setReportData] = useState<{ byCategory: any[]; slowMoving: any[] }>({ byCategory: [], slowMoving: [] })
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({})
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set())
  const [showAdjustment, setShowAdjustment] = useState(false)
  const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null)
  const [adjustmentSearch, setAdjustmentSearch] = useState('')
  const [adjustmentNewStock, setAdjustmentNewStock] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [adjustmentType, setAdjustmentType] = useState('manual')
  const [adjustmentDate, setAdjustmentDate] = useState('')
  const [adjustmentHistory, setAdjustmentHistory] = useState<any[]>([])

  useEffect(() => {
    if (initialTab && ['products', 'report', 'audit'].includes(initialTab)) {
      setTab(initialTab as any)
    }
  }, [initialTab])

  useHighlight(highlightId, onHighlightDone)
  const [returnStats, setReturnStats] = useState({ totalReturns: 0, totalRefund: 0, todayReturns: 0 })
  const [categories, setCategories] = useState<string[]>([])
  const [viewProduct, setViewProduct] = useState<Product | null>(null)

  const { isDark, colors } = useTheme()
  const abbreviatedPrices = useSettingsStore(s => s.abbreviatedPrices)
  const cardBg = colors.bg.card
  const cardBorder = colors.border.default
  const textPrimary = colors.text.primary
  const textSecondary = colors.text.secondary
  const btnColor = isDark ? '#94a3b8' : '#ffffff'

  const loadProducts = async () => {
    const r = search ? await window.api.products.search(search) : await window.api.products.getAll()
    if (r.success && r.data) {
      setProducts(r.data)
      const cats = [...new Set(r.data.map((p: Product) => p.category).filter(Boolean))]
      setCategories(cats)
      r.data.forEach(async (p: Product) => {
        if (p.imageBase64 && !imageUrls[p.id] && !p.imageBase64.startsWith('data:')) {
          const url = await getProductImageUrl(p.imageBase64)
          if (url) setImageUrls(prev => ({ ...prev, [p.id]: url }))
        }
      })
    }
  }

  const handleInlineUpdate = async (id: number, field: string, value: number) => {
    try {
      const r = await window.api.products.update(id, { [field]: value } as any)
      if (!r.success) { await loadProducts(); return }
    } catch { await loadProducts(); return }
    await loadProducts()
  }

  const loadLowStock = async () => {
    const r = await window.api.products.getLowStock()
    if (r.success && r.data) setLowStock(r.data)
  }

  const loadAudit = async (startDate?: string, endDate?: string) => {
    const r = await window.api.audit.getAll(undefined, undefined, startDate, endDate)
    if (r.success && r.data) setAuditLog(r.data.entries || [])
  }

  const loadReturnStats = async () => {
    const r = await window.api.returns.getStats()
    if (r.success && r.data) setReturnStats(r.data)
  }

  const loadReport = async () => {
    const r = await window.api.products.getReportData()
    if (r.success && r.data) {
      setReportData(r.data)
    } else {
      console.error('[Report Error]', r.error)
    }
  }

  useEffect(() => { loadProducts(); loadLowStock(); loadReturnStats(); loadReport() }, [search])
  useEffect(() => {
    if (tab === 'audit') loadAudit(auditStartDate || undefined, auditEndDate || undefined)
  }, [tab, auditStartDate, auditEndDate])

  const handleRestock = async () => {
    if (!selectedProduct || !restockQty) return
    const qty = parseInt(restockQty)
    if (qty <= 0) return
    await window.api.products.updateStock(selectedProduct.id, qty, restockReason || undefined)
    setSelectedProduct(null)
    setRestockQty('')
    setRestockReason('')
    loadProducts()
    loadLowStock()
  }

  const filteredProducts = products.filter((p) => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false
    if (filterStock === 'out' && p.stock > 0) return false
    if (filterStock === 'low' && (p.stock <= 0 || p.stock > p.minStock)) return false
    if (filterStock === 'in' && p.stock <= 0) return false
    return true
  })

  const outOfStock = products.filter(p => p.stock <= 0)

  const totalStockValue = filteredProducts.reduce((a, p) => a + (p.stock * p.purchase_price), 0)
  const totalRetailValue = filteredProducts.reduce((a, p) => a + (p.stock * p.sale_price), 0)
  const totalProfit = totalRetailValue - totalStockValue
  const lowStockCount = filteredProducts.filter(p => p.stock > 0 && p.stock <= p.minStock).length
  const pagedProducts = filteredProducts.slice(page * pageSize, (page + 1) * pageSize)
  const { sorted: sortedProducts, sortKey, sortDir, toggleSort } = useSortable(pagedProducts)
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const [showBulkPriceUpdate, setShowBulkPriceUpdate] = useState(false)
  const [showProductsPrintDialog, setShowProductsPrintDialog] = useState(false)

  const donutColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6']

  const filteredAuditLog = auditFilter === 'all' ? auditLog : auditLog.filter((e) => e.action === auditFilter)

  const catPageSize = 10
  const pagedCategories = reportData.byCategory.slice(catPage * catPageSize, (catPage + 1) * catPageSize)
  const slowPageSize = 10
  const pagedSlowMoving = reportData.slowMoving.slice(slowPage * slowPageSize, (slowPage + 1) * slowPageSize)
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayAuditCount = auditLog.filter(e => e.createdAt && e.createdAt.startsWith(todayStr)).length
  const auditActionCounts = auditLog.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] || 0) + 1
    return acc
  }, {})

  const handlePrintReport = async () => {
    const now = new Date()
    const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
    const jMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
    const dateStr = `${jd} ${jMonths[jm - 1]} ${jy}`

    const html = generateReceiptHTML({
      title: 'گزارش موجودی انبار',
      date: dateStr,
      items: filteredProducts.map((p) => ({
        name: p.title,
        qty: p.stock,
        price: p.purchase_price,
        total: p.stock * p.purchase_price,
      })),
      subtotal: totalStockValue,
      total: totalStockValue,
      extra: [
        { label: 'تعداد کالاها', value: String(filteredProducts.length) },
        { label: 'ارزش فروش', value: `${totalRetailValue.toLocaleString('fa-IR')} تومان` },
        { label: 'سود بالقوه', value: `${totalProfit.toLocaleString('fa-IR')} تومان`, color: '#16a34a' },
        { label: 'کم\u200cموجودی', value: `${lowStock.length} کالا`, color: lowStock.length > 0 ? '#ef4444' : undefined },
      ],
      footer: 'گزارش موجودی انبار',
      storeName: 'فروشگاه',
    })
    printContent(html)
  }

  const handlePrintA4 = async (range: { start: number; end: number } | 'all') => {
    let catData = reportData.byCategory
    let slowData = reportData.slowMoving
    if (range !== 'all') {
      catData = catData.slice(range.start - 1, range.end)
      slowData = slowData.slice(range.start - 1, range.end)
    }
    let html = '<h1>گزارش موجودی انبار</h1>'
    html += `<div class="header-info"><span>تاریخ: ${formatDateNow()}</span><span>فروشگاه</span></div>`
    html += '<table><thead><tr><th>دسته</th><th>تعداد</th><th>موجودی</th><th>ارزش خرید</th><th>ارزش فروش</th><th>سود</th><th>حاشیه</th></tr></thead><tbody>'
    catData.forEach((cat: any) => {
      const profit = (cat.retailValue || 0) - (cat.totalValue || 0)
      const margin = cat.retailValue > 0 ? Math.round((profit / cat.retailValue) * 100) : 0
      html += `<tr><td>${cat.category || '-'}</td><td>${cat.count}</td><td>${cat.totalStock}</td><td>${(cat.totalValue || 0).toLocaleString('fa-IR')}</td><td>${(cat.retailValue || 0).toLocaleString('fa-IR')}</td><td>${profit.toLocaleString('fa-IR')}</td><td>%${margin}</td></tr>`
    })
    html += '</tbody></table>'
    html += '<h2>کالاهای کندفروش</h2><table><thead><tr><th>کالا</th><th>دسته</th><th>موجودی</th><th>وضعیت</th></tr></thead><tbody>'
    slowData.forEach((item: any) => {
      html += `<tr><td>${item.title}</td><td>${item.category || '-'}</td><td>${item.stock}</td><td>${item.lastSoldAt ? 'آخرین فروش: ' + item.lastSoldAt : 'هرگز فروخته نشده'}</td></tr>`
    })
    html += '</tbody></table>'
    await printA4Report(html, 'گزارش موجودی انبار')
  }

  const handleExcelExport = () => {
    const headers = ['دسته', 'تعداد کالا', 'موجودی', 'ارزش خرید', 'ارزش فروش', 'سود']
    const rows = reportData.byCategory.map((cat: any) => [
      cat.category || '-', cat.count, cat.totalStock,
      cat.totalValue || 0, cat.retailValue || 0,
      (cat.retailValue || 0) - (cat.totalValue || 0)
    ])
    downloadExcel('inventory-report.csv', headers, rows)
  }

  const handleProductsPrint = async (range: { start: number; end: number } | 'all') => {
    let data = filteredProducts
    if (range !== 'all') data = filteredProducts.slice(range.start - 1, range.end)
    let html = '<h1>لیست موجودی انبار</h1>'
    html += `<div class="header-info"><span>تاریخ: ${formatDateNow()}</span><span>تعداد: ${data.length} کالا</span></div>`
    html += '<table><thead><tr><th>بارکد</th><th>نام</th><th>دسته</th><th>موجودی</th><th>قیمت خرید</th><th>قیمت فروش</th><th>ارزش</th></tr></thead><tbody>'
    data.forEach(p => {
      html += `<tr><td>${p.barcode || '-'}</td><td>${p.title}</td><td>${p.category || '-'}</td><td>${p.stock}</td><td>${p.purchase_price.toLocaleString('fa-IR')}</td><td>${p.sale_price.toLocaleString('fa-IR')}</td><td>${(p.stock * p.purchase_price).toLocaleString('fa-IR')}</td></tr>`
    })
    html += '</tbody></table>'
    await printA4Report(html, 'لیست موجودی انبار')
  }

  const handleProductsExcel = () => {
    const headers = ['بارکد', 'نام', 'دسته', 'موجودی', 'حداقل موجودی', 'قیمت خرید', 'قیمت فروش', 'ارزش', 'وضعیت']
    const rows = filteredProducts.map((p: any) => [
      p.barcode || '-', p.title, p.category || '-', p.stock, p.minStock,
      p.purchase_price, p.sale_price, p.stock * p.purchase_price,
      p.stock <= 0 ? 'تمام شده' : p.stock <= p.minStock ? 'کم‌موجودی' : 'موجود'
    ])
    downloadExcel('inventory-products.csv', headers, rows)
  }

  const handlePrintBarcode = async (p: Product) => {
    const qrSvg = await generateQRSvg(p.barcode || `PRD-${p.id}`, 120)
    const html = `<div style="text-align:center; padding:10px; border:1px solid #ddd; border-radius:8px; width:220px; display:inline-block;">
      <div style="font-size:8pt; color:#666;">فروشگاه</div>
      <div style="margin:5px auto; display:flex; justify-content:center;">${qrSvg}</div>
      <div style="font-size:10pt; font-weight:bold; margin-top:4px;">${p.title}</div>
      <div style="font-size:7pt; color:#666; margin-top:2px; font-family:monospace;">${p.barcode || `PRD-${p.id}`}</div>
      <div style="font-size:12pt; font-weight:bold; color:#006194; margin-top:2px;">${p.sale_price.toLocaleString('fa-IR')} تومان</div>
    </div>`
    await printA4Report(html, 'لیبل بارکد')
  }

  const handlePrintSelectedQR = async () => {
    const selected = sortedProducts.filter(p => selectedProducts.has(p.id))
    if (selected.length === 0) return
    const items: string[] = []
    for (const p of selected) {
      const qrSvg = await generateQRSvg(p.barcode || `PRD-${p.id}`, 100)
      items.push(`<div style="text-align:center; padding:8px; border:1px solid #ddd; border-radius:8px; width:200px; display:inline-block; margin:4px;">
        <div style="font-size:7pt; color:#666;">فروشگاه</div>
        <div style="margin:4px auto; display:flex; justify-content:center;">${qrSvg}</div>
        <div style="font-size:9pt; font-weight:bold; margin-top:3px;">${p.title}</div>
        <div style="font-size:6pt; color:#666; margin-top:1px; font-family:monospace;">${p.barcode || `PRD-${p.id}`}</div>
        <div style="font-size:11pt; font-weight:bold; color:#006194; margin-top:2px;">${p.sale_price.toLocaleString('fa-IR')} تومان</div>
      </div>`)
    }
    await printA4Report(`<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px;">${items.join('')}</div>`, 'لیبل‌های QR')
    setSelectedProducts(new Set())
  }

  const kpis = [
    {
      label: fa.admin.products,
      value: filteredProducts.length,
      color: '#3b82f6',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      label: 'ارزش خرید موجودی',
      value: totalStockValue,
      color: '#22c55e',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      label: 'سود بالقوه',
      value: totalProfit,
      color: '#10b981',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
        </svg>
      ),
    },
    {
      label: 'کم\u200cموجودی',
      value: lowStockCount,
      color: '#f59e0b',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
  ]

  const auditActionLabels: Record<string, string> = {
    create: 'ایجاد',
    update: 'ویرایش',
    delete: 'حذف',
    restock: 'تامین موجودی',
    return: 'مرجوعی',
    sale: 'فروش',
  }
  const auditEntityLabels: Record<string, string> = {
    product: 'کالا',
    sale: 'فاکتور',
    expense: 'هزینه',
    return: 'مرجوعی',
  }
  const auditActionColors: Record<string, { bg: string; fg: string }> = {
    create: { bg: isDark ? 'rgba(34,197,94,0.15)' : '#dcfce7', fg: '#166534' },
    update: { bg: isDark ? 'rgba(59,130,246,0.15)' : '#dbeafe', fg: '#1e40af' },
    delete: { bg: isDark ? 'rgba(239,68,68,0.15)' : '#fecaca', fg: '#991b1b' },
    restock: { bg: isDark ? 'rgba(16,185,129,0.15)' : '#d1fae5', fg: '#065f46' },
    return: { bg: isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7', fg: '#92400e' },
    sale: { bg: isDark ? 'rgba(168,85,247,0.15)' : '#f3e8ff', fg: '#7e22ce' },
  }
  const auditActionDotColors: Record<string, string> = {
    create: '#22c55e',
    update: '#3b82f6',
    delete: '#ef4444',
    restock: '#10b981',
    return: '#f59e0b',
    sale: '#a855f7',
  }

  function formatAuditDetail(entry: any): string {
    try {
      const details = entry.details ? JSON.parse(entry.details) : null
      if (!details) return ''
      if (entry.action === 'create' && entry.entityType === 'product') return details.title || details.barcode || ''
      if (entry.action === 'create' && entry.entityType === 'expense') return details.category ? `${details.category} — ${details.amount?.toLocaleString('fa-IR')} تومان` : ''
      if (entry.action === 'create' && entry.entityType === 'sale') return details.total ? `${details.total.toLocaleString('fa-IR')} تومان` : ''
      if (entry.action === 'restock') {
        const parts = [details.quantityChange ? `${details.quantityChange > 0 ? '+' : ''}${details.quantityChange} عدد` : '']
        if (details.reason) parts.push(details.reason)
        return parts.filter(Boolean).join(' — ')
      }
      if (entry.action === 'return') return details.quantity ? `${details.quantity} عدد — ${details.refundAmount?.toLocaleString('fa-IR')} تومان` : ''
      if (entry.action === 'update' && details.fields) return `فیلدها: ${details.fields.join(', ')}`
      return ''
    } catch { return '' }
  }

  const tabs = [
    {
      key: 'products' as const,
      label: 'موجودی',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      key: 'report' as const,
      label: 'گزارش انبار',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      key: 'analytics' as const,
      label: 'تحلیل و نمودار',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.21 15.89A10 10 0 118 2.83" /><path d="M22 12A10 10 0 0012 2v10z" />
        </svg>
      ),
    },
    {
      key: 'expiry' as const,
      label: 'انقضا',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      key: 'profit' as const,
      label: 'سود و زیان',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </svg>
      ),
    },
    {
      key: 'audit' as const,
      label: 'تاریخچه',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
  ]

  return (
    <div className="h-full p-4 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <h2 className="text-xl font-bold" style={{ color: textPrimary }}>{fa.nav.inventory}</h2>
          <HelpPopup title="راهنمای انبارداری" sections={[
            {
              heading: 'موجودی',
              items: ['مشاهده تمام کالاها با موجودی فعلی', 'فیلتر بر اساس دسته‌بندی و وضعیت موجودی', 'تامین موجودی کالاهای کم‌موجودی']
            },
            {
              heading: 'گزارش انبار',
              items: ['آمار کل ارزش خرید و فروش', 'نمودارهای ترکیبی داده', 'کالاهای کندفروش (بیش از ۳۰ روز بدون فروش)', 'چاپ گزارش انبار']
            },
            {
              heading: 'تاریخنامه تغییرات',
              items: ['تمام تغییرات ثبت شده', 'ایجاد، ویرایش، حذف، تامین و مرجوعی', 'فیلتر تاریخی و نوع عملیات']
            }
          ]} />
        </div>
        <button onClick={handlePrintReport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
          style={{
            backgroundColor: isDark ? '#1e293b' : '#f8fafc',
            color: textPrimary,
            border: `1px solid ${cardBorder}`,
          }}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
          </svg>
          چاپ گزارش
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} data-highlight-id={`tab-${t.key}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${tab === t.key ? 'shadow-lg' : ''} ${highlightId === `tab-${t.key}` ? 'highlight-tab' : ''}`}
            style={
              tab === t.key
                ? {
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(59,130,246,0.3)',
                  }
                : {}
            }>
            {t.icon}
            {t.label}
            {t.key === 'expiry' && <ExpiryBadge />}
          </button>
        ))}
      </div>

      {tab === 'products' && (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {kpis.map((kpi, i) => (
            <div key={i} className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-2 mb-2">
                {kpi.icon}
                <span className="text-xs font-medium" style={{ color: textSecondary }}>{kpi.label}</span>
              </div>
              <div className="text-2xl font-bold font-mono" style={{ color: kpi.color }}>{typeof kpi.value === 'number' ? kpi.value.toLocaleString('fa-IR') : kpi.value}</div>
            </div>
          ))}
        </div>

        

        {(outOfStock.length > 0 || lowStock.length > 0) && (
          <div className="flex gap-4 mb-4">
            {outOfStock.length > 0 && (
              <div className="flex-1 rounded-2xl p-4 border-2" style={{ backgroundColor: isDark ? '#450a0a' : '#fee2e2', borderColor: '#ef4444' }}>
                <h3 className="font-bold mb-2 flex items-center gap-2" style={{ color: '#ef4444' }}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  موجودی تمام شده — {outOfStock.length} کالا
                </h3>
                <div className="flex flex-wrap gap-2">
                  {outOfStock.map((p) => (
                    <button key={p.id} onClick={() => { setSelectedProduct(p); setRestockQty('') }}
                      className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ backgroundColor: '#fecaca', color: '#991b1b' }}>
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lowStock.length > 0 && (
              <div className="flex-1 rounded-2xl p-4 border-2" style={{ backgroundColor: isDark ? '#451a03' : '#fef3c7', borderColor: '#f59e0b' }}>
                <h3 className="font-bold mb-2 flex items-center gap-2" style={{ color: '#d97706' }}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  موجودی کم — {lowStock.length} کالا
                </h3>
                <div className="flex flex-wrap gap-2">
                  {lowStock.map((p) => (
                    <button key={p.id} onClick={() => { setSelectedProduct(p); setRestockQty('') }}
                      className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                      {p.title} ({p.stock})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedProduct && (
          <div className="rounded-2xl p-4 mb-4 border-2" style={{ backgroundColor: cardBg, borderColor: '#3b82f6' }}>
            <h3 className="font-bold mb-3" style={{ color: textPrimary }}>تامین موجودی: {selectedProduct.title}</h3>
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: textSecondary }}>موجودی فعلی: {selectedProduct.stock}</label>
                <input type="number" value={restockQty} onChange={(e) => setRestockQty(e.target.value)} className="input-field text-sm" placeholder="تعداد" />
              </div>
              {restockQty && parseInt(restockQty) > 0 && (
                <div className="text-xs font-bold px-3 py-2 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(34,197,94,0.15)' : '#dcfce7', color: '#22c55e' }}>
                  {selectedProduct.stock} → {selectedProduct.stock + parseInt(restockQty)}
                </div>
              )}
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs font-medium block mb-1" style={{ color: textSecondary }}>دلیل تامین</label>
                <input value={restockReason} onChange={(e) => setRestockReason(e.target.value)} className="input-field text-sm" placeholder="مثال: تامین فروشنده" />
              </div>
              <button onClick={handleRestock} disabled={!restockQty || parseInt(restockQty) <= 0} className="btn-success disabled:opacity-40">+ افزودن</button>
              <button onClick={() => { setSelectedProduct(null); setRestockReason('') }} className="text-sm px-3 py-2 rounded-xl font-bold" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: btnColor }}>{fa.admin.cancel}</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={fa.admin.search} className="input-field flex-1 min-w-[200px]" />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input-field w-40 text-sm">
            <option value="all">همه دسته‌ها</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStock} onChange={(e) => setFilterStock(e.target.value)} className="input-field w-40 text-sm">
            <option value="all">همه موجودی</option>
            <option value="in">موجود</option>
            <option value="low">کم\u200cموجودی</option>
            <option value="out">تمام شده</option>
          </select>
          <button onClick={() => setShowProductsPrintDialog(true)} className="text-xs px-3 py-2 rounded-lg font-bold flex items-center gap-1" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: textSecondary, border: `1px solid ${cardBorder}` }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
            چاپ A4
          </button>
          <button onClick={handleProductsExcel} className="text-xs px-3 py-2 rounded-lg font-bold flex items-center gap-1" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: textSecondary, border: `1px solid ${cardBorder}` }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            خروجی اکسل
          </button>
          {selectedProducts.size > 0 && (
            <button onClick={handlePrintSelectedQR} className="text-xs px-3 py-2 rounded-lg font-bold flex items-center gap-1" style={{ background: 'linear-gradient(135deg, #006194, #007bb9)', color: '#fff', boxShadow: '0 2px 8px rgba(0,97,148,0.25)' }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
              چاپ QR ({selectedProducts.size})
            </button>
          )}
          <button onClick={async () => { setShowAdjustment(true); const r = await window.api.inventory.getAll({}); if (r.success && r.data) setAdjustmentHistory(r.data) }}
            className="text-xs px-3 py-2 rounded-lg font-bold flex items-center gap-1" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: textSecondary, border: `1px solid ${cardBorder}` }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            تطبیق و اصلاح موجودی
          </button>
        </div>

        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
                <th className="px-3 py-2 w-10" style={{ color: textSecondary }}>
                  <input type="checkbox" checked={selectedProducts.size === sortedProducts.length && sortedProducts.length > 0}
                    onChange={() => { const allIds = sortedProducts.map(p => p.id); if (selectedProducts.size === allIds.length) setSelectedProducts(new Set()); else setSelectedProducts(new Set(allIds)) }}
                    style={{ accentColor: '#3b82f6' }} />
                </th>
                {([
                  { key: 'id' as keyof Product, label: 'ID', width: '50px' },
                  { key: 'barcode' as keyof Product, label: fa.admin.barcode },
                  { key: 'title' as keyof Product, label: fa.admin.title },
                  { key: 'category' as keyof Product, label: fa.admin.category },
                  { key: 'stock' as keyof Product, label: fa.admin.stock, align: 'center' as const },
                  { key: 'purchase_price' as keyof Product, label: fa.admin.purchasePrice },
                ]).map(col => (
                  <th key={String(col.key)}
                    className={`px-4 py-2 cursor-pointer select-none transition-all hover:bg-blue-500/10 ${col.align === 'center' ? 'text-center' : 'text-right'}`}
                    style={{ color: sortKey === col.key ? '#3b82f6' : textSecondary, width: col.width }}
                    onClick={() => toggleSort(col.key)}>
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <span className="text-[10px] opacity-50">{sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                    </span>
                  </th>
                ))}
                <th className="text-right px-4 py-2" style={{ color: textSecondary }}>ارزش</th>
                <th className="text-right px-4 py-2" style={{ color: textSecondary }}>حاشیه سود</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((p) => {
                const isZero = p.stock <= 0
                const isLow = p.stock > 0 && p.stock <= p.minStock
                const rowBg = isZero ? (isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)') : isLow ? (isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.05)') : 'transparent'
                const margin = p.purchase_price > 0 ? (((p.sale_price - p.purchase_price) / p.purchase_price) * 100).toFixed(1) : '0'
                return (
                <tr key={p.id} data-highlight-id={`product-${p.id}`} style={{ borderBottom: `1px solid ${cardBorder}`, backgroundColor: rowBg }}>
                  <td className="px-3 py-2" style={{ borderBottom: `1px solid ${cardBorder}`, backgroundColor: rowBg }}>
                    <input type="checkbox" checked={selectedProducts.has(p.id)} onChange={() => { const next = new Set(selectedProducts); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); setSelectedProducts(next) }} onClick={e => e.stopPropagation()} style={{ accentColor: '#3b82f6' }} />
                  </td>
                  <td className="px-4 py-2" style={{ color: textSecondary }}>{p.id}</td>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: textPrimary }}>{p.barcode || '-'}</td>
                  <td className="px-4 py-2 font-medium" style={{ color: textPrimary }}>
                    <div className="flex items-center gap-2">
                      {imageUrls[p.id] || (p.imageBase64 && p.imageBase64.startsWith('data:')) ? (
                        <img src={imageUrls[p.id] || p.imageBase64} alt="" className="w-8 h-8 rounded-full object-cover border" style={{ borderColor: cardBorder }} />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: textSecondary }}>
                          {p.title.charAt(0)}
                        </div>
                      )}
                      {p.title}
                    </div>
                  </td>
                  <td className="px-4 py-2" style={{ color: textSecondary }}>{p.category || '-'}</td>
                  <td className="px-4 py-2">
                    <InlineEditCell value={p.stock} onSave={(v) => handleInlineUpdate(p.id, 'stock', v)} align="center" />
                  </td>
                  <td className="px-4 py-2" style={{ color: textPrimary }}>
                    <InlineEditCell value={p.purchase_price} onSave={(v) => handleInlineUpdate(p.id, 'purchase_price', v)} display={p.purchase_price.toLocaleString('fa-IR')} align="right" />
                  </td>
                  <td className="px-4 py-2" style={{ color: textPrimary }}>{(p.stock * p.purchase_price).toLocaleString('fa-IR')}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{
                      backgroundColor: parseFloat(margin) > 20 ? '#dcfce7' : parseFloat(margin) > 10 ? '#fef3c7' : '#fee2e2',
                      color: parseFloat(margin) > 20 ? '#166534' : parseFloat(margin) > 10 ? '#92400e' : '#991b1b',
                    }}>%{margin}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => { e.stopPropagation(); setViewProduct(p) }} className="text-xs font-bold px-2 py-1.5 rounded-lg" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: primary }}>جزئیات</button>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedProduct(p); setRestockQty(''); setRestockReason('') }} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: '#22c55e' }}>+ تامین</button>
                      <button onClick={(e) => { e.stopPropagation(); handlePrintBarcode(p) }} className="text-xs font-bold px-2 py-1.5 rounded-lg" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: '#3b82f6' }}>
                        <svg className="w-3 h-3 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
              {pagedProducts.length === 0 && <tr><td colSpan={9} className="text-center py-8" style={{ color: textSecondary }}>{fa.admin.noProducts}</td></tr>}
            </tbody>
          </table>
        </div>

        <Pagination total={filteredProducts.length} pageSize={pageSize} page={page}
          onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(0) }} />
      </>)}

      {tab === 'report' && (
        <div className="space-y-4">
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowPrintDialog(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc', color: textPrimary, border: `1px solid ${cardBorder}` }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
              </svg>
              چاپ A4
            </button>
            <button onClick={handleExcelExport}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc', color: textPrimary, border: `1px solid ${cardBorder}` }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              خروجی اکسل
            </button>
            <button onClick={() => setShowBulkPriceUpdate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc', color: textPrimary, border: `1px solid ${cardBorder}` }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              بروزرسانی قیمت
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#dbeafe' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" className="w-4 h-4"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                </div>
                <span className="text-xs font-medium" style={{ color: textSecondary }}>ارزش خرید کل</span>
              </div>
              <div className="text-xl font-bold" style={{ color: '#3b82f6' }}>{abbreviatedPrices ? formatPriceFA(totalStockValue) : totalStockValue.toLocaleString('fa-IR')}{abbreviatedPrices && <div className="text-[10px] font-bold opacity-60">{formatPriceFull(totalStockValue)} تومان</div>}</div>
            </div>
            <div className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(34,197,94,0.15)' : '#dcfce7' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" className="w-4 h-4"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                </div>
                <span className="text-xs font-medium" style={{ color: textSecondary }}>ارزش فروش کل</span>
              </div>
              <div className="text-xl font-bold" style={{ color: '#22c55e' }}>{abbreviatedPrices ? formatPriceFA(totalRetailValue) : totalRetailValue.toLocaleString('fa-IR')}{abbreviatedPrices && <div className="text-[10px] font-bold opacity-60">{formatPriceFull(totalRetailValue)} تومان</div>}</div>
            </div>
            <div className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#d1fae5' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                </div>
                <span className="text-xs font-medium" style={{ color: textSecondary }}>سود بالقوه</span>
              </div>
              <div className="text-xl font-bold" style={{ color: '#10b981' }}>{abbreviatedPrices ? formatPriceFA(totalProfit) : totalProfit.toLocaleString('fa-IR')}{abbreviatedPrices && <div className="text-[10px] font-bold opacity-60">{formatPriceFull(totalProfit)} تومان</div>}</div>
              <div className="text-[10px] mt-1" style={{ color: textSecondary }}>{totalStockValue > 0 ? Math.round((totalProfit / totalStockValue) * 100) : 0}% حاشیه سود</div>
            </div>
            <div className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" className="w-4 h-4"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </div>
                <span className="text-xs font-medium" style={{ color: textSecondary }}>کالاهای کندفروش</span>
              </div>
              <div className="text-xl font-bold font-mono" style={{ color: '#f59e0b' }}>{reportData.slowMoving.length.toLocaleString('fa-IR')}</div>
              <div className="text-[10px] mt-1" style={{ color: textSecondary }}>{reportData.slowMoving.filter((s: any) => !s.lastSoldAt).length} هرگز فروخته نشده</div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Category Donut Chart */}
            <div className="rounded-2xl p-5 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <h3 className="text-sm font-bold mb-4" style={{ color: textPrimary }}>ترکیب ارزش دسته‌بندی‌ها</h3>
              {reportData.byCategory.length > 0 ? (
                <div className="flex items-center gap-6">
                  <svg viewBox="0 0 42 42" className="w-32 h-32 flex-shrink-0">
                    <circle cx="21" cy="21" r="15.9" fill="transparent" stroke={isDark ? '#334155' : '#e2e8f0'} strokeWidth="5" />
                    {(() => {
                      const totalVal = reportData.byCategory.reduce((s: number, c: any) => s + (c.totalValue || 0), 0) || 1
                      let offset = 0
                      return reportData.byCategory.slice(0, 7).map((cat: any, i: number) => {
                        const pct = ((cat.totalValue || 0) / totalVal) * 100
                        const dashOffset = 25 - offset
                        offset += pct
                        return <circle key={i} cx="21" cy="21" r="15.9" fill="transparent" stroke={donutColors[i % donutColors.length]} strokeWidth="5" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={dashOffset} />
                      })
                    })()}
                  </svg>
                  <div className="flex-1 space-y-2">
                    {reportData.byCategory.slice(0, 5).map((cat: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: donutColors[i % donutColors.length] }} />
                        <span className="flex-1 truncate" style={{ color: textPrimary }}>{cat.category || 'بدون دسته'}</span>
                        <span className="font-mono font-bold" style={{ color: textSecondary }}>{((cat.totalValue || 0) / (totalStockValue || 1) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-center py-8 text-sm" style={{ color: textSecondary }}>داده‌ای موجود نیست</p>
              )}
            </div>

            {/* Category Bar Chart */}
            <div className="rounded-2xl p-5 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <h3 className="text-sm font-bold mb-4" style={{ color: textPrimary }}>ارزش خرید بر اساس دسته</h3>
              <svg viewBox="0 0 300 180" className="w-full h-44">
                {reportData.byCategory.slice(0, 5).map((cat: any, i: number) => {
                  const maxVal = Math.max(...reportData.byCategory.map((c: any) => c.totalValue || 0), 1)
                  const barH = ((cat.totalValue || 0) / maxVal) * 130
                  const x = 20 + i * 56
                  const label = (cat.category || '?').length > 6 ? (cat.category || '?').slice(0, 6) + '..' : (cat.category || '?')
                  return (
                    <g key={i}>
                      <rect x={x} y={145 - barH} width={40} height={barH} rx={4} fill={donutColors[i % donutColors.length]} opacity={0.85} />
                      <text x={x + 20} y={140 - barH} textAnchor="middle" fill={textPrimary} fontSize="7" fontWeight="bold" fontFamily="'Vazirmatn'">{(cat.totalValue || 0).toLocaleString('fa-IR')}</text>
                      <text x={x + 20} y={158} textAnchor="middle" fill={textSecondary} fontSize="7" fontFamily="'Vazirmatn'">{label}</text>
                    </g>
                  )
                })}
                <line x1="10" y1="145" x2="295" y2="145" stroke={isDark ? '#334155' : '#e2e8f0'} strokeWidth="1" />
              </svg>
            </div>
          </div>

          {/* Category Valuation Table */}
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
            <div className="px-4 py-3 font-bold flex items-center gap-2" style={{ borderBottom: `2px solid ${cardBorder}`, color: textPrimary }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              ارزش‌گذاری دسته‌بندی
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
              <tr style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
                    <th className="text-right px-4 py-2" style={{ color: textSecondary }}>دسته</th>
                    <th className="text-center px-3 py-2" style={{ color: textSecondary }}>تعداد کالا</th>
                    <th className="text-center px-3 py-2" style={{ color: textSecondary }}>موجودی</th>
                    <th className="text-right px-3 py-2" style={{ color: textSecondary }}>ارزش خرید</th>
                    <th className="text-right px-3 py-2" style={{ color: textSecondary }}>ارزش فروش</th>
                    <th className="text-right px-3 py-2" style={{ color: textSecondary }}>سود</th>
                    <th className="text-center px-3 py-2" style={{ color: textSecondary }}>حاشیه</th>
                    <th className="px-3 py-2" style={{ width: 120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCategories.map((cat: any, i: number) => {
                    const catValue = cat.totalValue || 0
                    const catRetail = cat.retailValue || 0
                    const catProfit = catRetail - catValue
                    const catMargin = catRetail > 0 ? Math.round((catProfit / catRetail) * 100) : 0
                    const maxCatValue = Math.max(...reportData.byCategory.map((c: any) => c.totalValue || 0), 1)
                    return (
                    <tr key={i} style={{ borderBottom: `1px solid ${cardBorder}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isDark ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.03)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: donutColors[i % donutColors.length] }} />
                          <span className="font-medium" style={{ color: textPrimary }}>{cat.category || 'بدون دسته'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono" style={{ color: textPrimary }}>{cat.count}</td>
                      <td className="px-3 py-2.5 text-center font-mono" style={{ color: textPrimary }}>{cat.totalStock}</td>
                      <td className="px-3 py-2.5 font-mono" style={{ color: textPrimary }}>{catValue.toLocaleString('fa-IR')}</td>
                      <td className="px-3 py-2.5 font-mono" style={{ color: textSecondary }}>{catRetail.toLocaleString('fa-IR')}</td>
                      <td className="px-3 py-2.5 font-mono font-bold" style={{ color: catProfit > 0 ? '#22c55e' : '#ef4444' }}>{catProfit.toLocaleString('fa-IR')}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{
                          backgroundColor: catMargin > 20 ? (isDark ? 'rgba(34,197,94,0.15)' : '#dcfce7') : catMargin > 10 ? (isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7') : (isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2'),
                          color: catMargin > 20 ? '#22c55e' : catMargin > 10 ? '#f59e0b' : '#ef4444',
                        }}>%{catMargin}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? '#334155' : '#e2e8f0' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${(catValue / maxCatValue) * 100}%`, backgroundColor: donutColors[i % donutColors.length] }} />
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                  {reportData.byCategory.length === 0 && <tr><td colSpan={8} className="text-center py-8" style={{ color: textSecondary }}>داده‌ای موجود نیست</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="px-3 pb-3">
              <Pagination total={reportData.byCategory.length} pageSize={catPageSize} page={catPage} onPageChange={setCatPage} onPageSizeChange={() => {}} />
            </div>
          </div>

          {/* Slow-Moving Items */}
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
            <div className="px-4 py-3 font-bold flex items-center gap-2" style={{ borderBottom: `2px solid ${cardBorder}`, color: textPrimary }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              کالاهای کندفروش ({reportData.slowMoving.length})
            </div>
            <div className="max-h-96 overflow-y-auto">
              {pagedSlowMoving.map((item: any) => {
                const daysSince = item.lastSoldAt ? Math.floor((Date.now() - new Date(item.lastSoldAt).getTime()) / 86400000) : null
                const neverSold = !item.lastSoldAt
                return (
                <div key={item.id} className="px-4 py-3 transition-all" style={{ borderBottom: `1px solid ${cardBorder}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isDark ? 'rgba(245,158,11,0.05)' : 'rgba(245,158,11,0.03)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: neverSold ? (isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2') : (isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7') }}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={neverSold ? '#ef4444' : '#f59e0b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: textPrimary }}>{item.title}</div>
                      <div className="text-xs" style={{ color: textSecondary }}>{item.category || 'بدون دسته'}</div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-center">
                        <div className="text-[10px]" style={{ color: textSecondary }}>موجودی</div>
                        <div className="text-sm font-bold font-mono" style={{ color: textPrimary }}>{item.stock}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px]" style={{ color: textSecondary }}>ارزش</div>
                        <div className="text-xs font-mono" style={{ color: textPrimary }}>{(item.stock * item.purchase_price).toLocaleString('fa-IR')}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{
                        backgroundColor: neverSold ? (isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2') : (isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7'),
                        color: neverSold ? '#ef4444' : '#f59e0b',
                      }}>
                        {neverSold ? 'هرگز فروخته نشده' : `${daysSince} روز پیش`}
                      </span>
                    </div>
                  </div>
                </div>
                )
              })}
              {reportData.slowMoving.length === 0 && <p className="text-center py-12 text-sm" style={{ color: textSecondary }}>کالای کندفروشی وجود ندارد</p>}
            </div>
            {reportData.slowMoving.length > slowPageSize && (
              <div className="px-3 pb-3">
                <Pagination total={reportData.slowMoving.length} pageSize={slowPageSize} page={slowPage} onPageChange={setSlowPage} onPageSizeChange={() => {}} />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'analytics' && (
        <InventoryAnalytics />
      )}

      {tab === 'expiry' && (
        <ExpiryAlerts />
      )}

      {tab === 'profit' && (
        <ProfitReport />
      )}

      {tab === 'audit' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-2 mb-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-xs font-medium" style={{ color: textSecondary }}>کل تغییرات</span>
              </div>
              <div className="text-xl font-bold font-mono" style={{ color: '#3b82f6' }}>{auditLog.length.toLocaleString('fa-IR')}</div>
            </div>
            <div className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-2 mb-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="text-xs font-medium" style={{ color: textSecondary }}>تغییرات امروز</span>
              </div>
              <div className="text-xl font-bold font-mono" style={{ color: '#f59e0b' }}>{todayAuditCount.toLocaleString('fa-IR')}</div>
            </div>
            <div className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-2 mb-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                </svg>
                <span className="text-xs font-medium" style={{ color: textSecondary }}>مرجوعی</span>
              </div>
              <div className="text-xl font-bold font-mono" style={{ color: '#ef4444' }}>{returnStats.totalReturns.toLocaleString('fa-IR')}</div>
              <div className="text-xs mt-1" style={{ color: '#ef4444' }}>{returnStats.totalRefund.toLocaleString('fa-IR')} تومان</div>
            </div>
            <div className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
              <div className="flex items-center gap-2 mb-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <circle cx="12" cy="12" r="10" /><polyline points="16 12 12 8 8 12" /><line x1="12" y1="16" x2="12" y2="8" />
                </svg>
                <span className="text-xs font-medium" style={{ color: textSecondary }}>امروز</span>
              </div>
              <div className="text-xl font-bold font-mono" style={{ color: '#22c55e' }}>{returnStats.todayReturns.toLocaleString('fa-IR')}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <ShamsiDateInput value={auditStartDate} onChange={setAuditStartDate} label="از تاریخ" />
            <ShamsiDateInput value={auditEndDate} onChange={setAuditEndDate} label="تا تاریخ" />
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {(['all', 'create', 'update', 'delete', 'restock'] as AuditFilter[]).map(action => {
              const count = action === 'all' ? auditLog.length : (auditActionCounts[action] || 0)
              const colors = action === 'all'
                ? { bg: isDark ? '#1e293b' : '#f8fafc', fg: textPrimary, border: cardBorder }
                : auditActionColors[action]
                    ? { bg: auditActionColors[action].bg, fg: auditActionColors[action].fg, border: 'transparent' }
                    : { bg: isDark ? '#1e293b' : '#f8fafc', fg: textPrimary, border: cardBorder }
              const labels: Record<string, string> = {
                all: 'همه',
                create: 'ایجاد',
                update: 'ویرایش',
                delete: 'حذف',
                restock: 'تامین مجدد',
              }
              return (
                <button key={action} onClick={() => setAuditFilter(action)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    backgroundColor: auditFilter === action ? (auditActionColors[action]?.fg || '#3b82f6') : colors.bg,
                    color: auditFilter === action ? '#ffffff' : colors.fg,
                    border: auditFilter === action ? 'none' : `1px solid ${colors.border}`,
                  }}>
                  {labels[action]}
                  <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{
                    backgroundColor: auditFilter === action ? 'rgba(255,255,255,0.2)' : (isDark ? '#334155' : '#e2e8f0'),
                    color: auditFilter === action ? '#ffffff' : textSecondary,
                  }}>{count}</span>
                </button>
              )
            })}
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
            <div className="px-4 py-3 font-bold flex items-center gap-2" style={{ borderBottom: `2px solid ${cardBorder}`, color: textPrimary }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              تاریخچه تغییرات ({filteredAuditLog.length})
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {filteredAuditLog.slice(auditPage * auditPageSize, (auditPage + 1) * auditPageSize).map((entry: any) => {
                const actionStyle = auditActionColors[entry.action] || { bg: isDark ? '#1e293b' : '#f8fafc', fg: textPrimary }
                const detail = formatAuditDetail(entry)
                const entityLabel = auditEntityLabels[entry.entityType] || entry.entityType
                const actionLabel = auditActionLabels[entry.action] || entry.action
                const dotColor = auditActionDotColors[entry.action] || '#6b7280'
                return (
                <div key={entry.id} className="px-4 py-3 transition-all" style={{ borderBottom: `1px solid ${cardBorder}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isDark ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.03)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: actionStyle.bg }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: actionStyle.bg, color: actionStyle.fg }}>
                          {actionLabel}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: textSecondary }}>
                          {entityLabel}
                        </span>
                      </div>
                      <div className="text-sm font-medium" style={{ color: textPrimary }}>
                        {entry.entityName || `${entityLabel} #${entry.entityId}`}
                      </div>
                      {detail && (
                        <div className="text-xs mt-0.5" style={{ color: textSecondary }}>{detail}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                      <span className="text-xs font-medium" style={{ color: textSecondary }}>{entry.userName || 'سیستم'}</span>
                      <span className="text-[10px] font-mono" style={{ color: textSecondary }}>{entry.createdAt}</span>
                    </div>
                  </div>
                </div>
                )
              })}
              {filteredAuditLog.length === 0 && <p className="text-center py-12 text-sm" style={{ color: textSecondary }}>هیچ تغییری ثبت نشده</p>}
            </div>
            {filteredAuditLog.length > auditPageSize && (
              <div className="px-4 pb-3">
                <Pagination total={filteredAuditLog.length} pageSize={auditPageSize} page={auditPage} onPageChange={setAuditPage} onPageSizeChange={(s) => { setAuditPageSize(s); setAuditPage(0) }} />
              </div>
            )}
          </div>
        </>
      )}
      <PrintDialog open={showPrintDialog} title="چاپ گزارش انبار" totalCount={reportData.byCategory.length} onClose={() => setShowPrintDialog(false)} onPrint={(range) => { setShowPrintDialog(false); handlePrintA4(range) }} />
      <BulkPriceUpdateDialog open={showBulkPriceUpdate} onClose={() => setShowBulkPriceUpdate(false)} />
      <PrintDialog open={showProductsPrintDialog} title="چاپ لیست موجودی" totalCount={filteredProducts.length} onClose={() => setShowProductsPrintDialog(false)} onPrint={(range) => { setShowProductsPrintDialog(false); handleProductsPrint(range) }} />

      {showAdjustment && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => { setShowAdjustment(false); setAdjustmentProduct(null) }}>
          <div className="rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4" style={{ color: textPrimary }}>تطبیق و اصلاح موجودی انبار</h3>

            <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff', border: '1px solid #3b82f6' }}>
              <h4 className="font-bold text-sm mb-2" style={{ color: '#3b82f6' }}>ثبت اصلاح جدید</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-bold block mb-1" style={{ color: textSecondary }}>جستجوی کالا</label>
                  <input value={adjustmentSearch} onChange={(e) => setAdjustmentSearch(e.target.value)} placeholder="نام یا بارکد کالا..." className="input-field text-sm" style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: textPrimary, border: `1px solid ${cardBorder}` }} />
                </div>
                {!adjustmentProduct && adjustmentSearch.length > 0 && (
                  <div className="col-span-2">
                    <AdjustmentProductSearch query={adjustmentSearch} onSelect={(p) => { setAdjustmentProduct(p); setAdjustmentNewStock(String(p.stock)); setAdjustmentSearch('') }} />
                  </div>
                )}
                {adjustmentProduct && (
                  <>
                    <div className="col-span-2 rounded-lg p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm" style={{ color: textPrimary }}>{adjustmentProduct.title}</div>
                          <div className="text-xs" style={{ color: textSecondary }}>موجودی فعلی: <span className="font-bold">{adjustmentProduct.stock}</span></div>
                        </div>
                        <button onClick={() => { setAdjustmentProduct(null); setAdjustmentNewStock(''); setAdjustmentReason('') }} className="text-xs px-2 py-1 rounded-lg" style={{ color: '#ef4444' }}>تغییر کالا</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold block mb-1" style={{ color: textSecondary }}>موجودی جدید</label>
                      <input type="number" value={adjustmentNewStock} onChange={(e) => setAdjustmentNewStock(e.target.value)}
                        className="input-field text-sm" style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: textPrimary, border: `1px solid ${cardBorder}` }} />
                      {adjustmentNewStock && Number(adjustmentNewStock) !== adjustmentProduct.stock && (
                        <div className="text-xs font-bold mt-1" style={{ color: Number(adjustmentNewStock) > adjustmentProduct.stock ? '#22c55e' : '#ef4444' }}>
                          تغییر: {adjustmentProduct.stock} → {Number(adjustmentNewStock)} ({Number(adjustmentNewStock) > adjustmentProduct.stock ? '+' : ''}{Number(adjustmentNewStock) - adjustmentProduct.stock})
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-bold block mb-1" style={{ color: textSecondary }}>نوع اصلاح</label>
                      <select value={adjustmentType} onChange={(e) => setAdjustmentType(e.target.value)}
                        className="input-field text-sm" style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: textPrimary, border: `1px solid ${cardBorder}` }}>
                        <option value="manual">اصلاح دستی</option>
                        <option value="reconciliation">تطبیق با شمارش فیزیکی</option>
                        <option value="damage">ضایعات / آسیب</option>
                        <option value="count">شمارش دوره‌ای</option>
                        <option value="other">سایر</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-bold block mb-1" style={{ color: textSecondary }}>دلیل اصلاح</label>
                      <input value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} placeholder="توضیح دلیل اصلاح..." className="input-field text-sm" style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: textPrimary, border: `1px solid ${cardBorder}` }} />
                    </div>
                    <div>
                      <label className="text-xs font-bold block mb-1" style={{ color: textSecondary }}>تاریخ (اختیاری)</label>
                      <ShamsiDateInput value={adjustmentDate} onChange={(v) => setAdjustmentDate(v)} />
                    </div>
                    <div className="col-span-2 flex justify-end gap-2 mt-2">
                      <button onClick={async () => {
                        if (!adjustmentProduct || !adjustmentNewStock) return
                        const r = await window.api.inventory.create({
                          productId: adjustmentProduct.id,
                          newStock: Number(adjustmentNewStock),
                          reason: adjustmentReason,
                          adjustmentType,
                          createdAt: adjustmentDate ? `${adjustmentDate} 12:00:00` : undefined,
                        })
                        if (r.success) {
                          setAdjustmentProduct(null); setAdjustmentNewStock(''); setAdjustmentReason(''); setAdjustmentDate('')
                          await loadProducts()
                          const hr = await window.api.inventory.getAll({})
                          if (hr.success && hr.data) setAdjustmentHistory(hr.data)
                        }
                      }} disabled={!adjustmentProduct || !adjustmentNewStock || Number(adjustmentNewStock) === adjustmentProduct?.stock}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                        ثبت اصلاح
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {adjustmentHistory.length > 0 && (
              <div>
                <h4 className="font-bold text-sm mb-2" style={{ color: textPrimary }}>تاریخچه اصلاحات</h4>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: cardBorder }}>
                  <table className="w-full text-xs">
                    <thead><tr style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
                      <th className="px-3 py-2 text-right" style={{ color: textSecondary }}>تاریخ</th>
                      <th className="px-3 py-2 text-right" style={{ color: textSecondary }}>کالا</th>
                      <th className="px-3 py-2 text-center" style={{ color: textSecondary }}>قبل</th>
                      <th className="px-3 py-2 text-center" style={{ color: textSecondary }}>بعد</th>
                      <th className="px-3 py-2 text-center" style={{ color: textSecondary }}>تغییر</th>
                      <th className="px-3 py-2 text-right" style={{ color: textSecondary }}>نوع</th>
                      <th className="px-3 py-2 text-right" style={{ color: textSecondary }}>دلیل</th>
                    </tr></thead>
                    <tbody>
                      {adjustmentHistory.map((adj: any) => (
                        <tr key={adj.id} style={{ borderTop: `1px solid ${cardBorder}` }}>
                          <td className="px-3 py-2" style={{ color: textSecondary }}>{adj.createdAt?.slice(0, 10)}</td>
                          <td className="px-3 py-2 font-bold" style={{ color: textPrimary }}>{adj.productName}</td>
                          <td className="px-3 py-2 text-center" style={{ color: textSecondary }}>{adj.previousStock}</td>
                          <td className="px-3 py-2 text-center font-bold" style={{ color: textPrimary }}>{adj.newStock}</td>
                          <td className="px-3 py-2 text-center font-bold" style={{ color: adj.adjustmentQty >= 0 ? '#22c55e' : '#ef4444' }}>
                            {adj.adjustmentQty >= 0 ? '+' : ''}{adj.adjustmentQty}
                          </td>
                          <td className="px-3 py-2" style={{ color: textSecondary }}>{adj.adjustmentType === 'manual' ? 'دستی' : adj.adjustmentType === 'reconciliation' ? 'تطبیق' : adj.adjustmentType === 'damage' ? 'ضایعات' : adj.adjustmentType === 'count' ? 'شمارش' : 'سایر'}</td>
                          <td className="px-3 py-2" style={{ color: textSecondary }}>{adj.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {viewProduct && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setViewProduct(null)}>
          <div className="rounded-2xl p-6 max-w-lg w-full mx-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 mb-4">
              {(imageUrls[viewProduct.id] || (viewProduct.imageBase64 && viewProduct.imageBase64.startsWith('data:'))) && <img src={imageUrls[viewProduct.id] || viewProduct.imageBase64} className="w-20 h-20 rounded-xl object-cover" alt="" />}
              <div>
                <h3 className="text-lg font-bold" style={{ color: textPrimary }}>{viewProduct.title}</h3>
                <p className="text-sm" style={{ color: textSecondary }}>{viewProduct.category || '-'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}><div className="text-xs" style={{ color: textSecondary }}>بارکد</div><div className="text-sm font-mono font-bold" style={{ color: textPrimary }}>{viewProduct.barcode}</div></div>
              <div className="rounded-lg p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}><div className="text-xs mb-1" style={{ color: textSecondary }}>موجودی</div><InlineEditCell value={viewProduct.stock} onSave={(v) => { handleInlineUpdate(viewProduct.id, 'stock', v); setViewProduct({ ...viewProduct, stock: v }) }} display={String(viewProduct.stock)} align="center" /></div>
              <div className="rounded-lg p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}><div className="text-xs mb-1" style={{ color: textSecondary }}>قیمت خرید</div><InlineEditCell value={viewProduct.purchase_price} onSave={(v) => { handleInlineUpdate(viewProduct.id, 'purchase_price', v); setViewProduct({ ...viewProduct, purchase_price: v }) }} display={viewProduct.purchase_price.toLocaleString('fa-IR')} align="right" /></div>
              <div className="rounded-lg p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}><div className="text-xs mb-1" style={{ color: textSecondary }}>قیمت فروش</div><InlineEditCell value={viewProduct.sale_price} onSave={(v) => { handleInlineUpdate(viewProduct.id, 'sale_price', v); setViewProduct({ ...viewProduct, sale_price: v }) }} display={viewProduct.sale_price.toLocaleString('fa-IR')} align="right" /></div>
              <div className="rounded-lg p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}><div className="text-xs mb-1" style={{ color: textSecondary }}>حداقل موجودی</div><InlineEditCell value={viewProduct.minStock} onSave={(v) => { handleInlineUpdate(viewProduct.id, 'minStock', v); setViewProduct({ ...viewProduct, minStock: v }) }} display={String(viewProduct.minStock)} align="center" /></div>
              <div className="rounded-lg p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}><div className="text-xs" style={{ color: textSecondary }}>واحد</div><div className="text-sm font-bold" style={{ color: textPrimary }}>{viewProduct.unit === 'weight' ? 'کیلوگرم' : 'عدد'}</div></div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setViewProduct(null); setSelectedProduct(viewProduct); setRestockQty(''); setRestockReason('') }} className="flex-1 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: '#22c55e', color: '#fff' }}>تامین موجودی</button>
              <button onClick={() => { setViewProduct(null) }} className="flex-1 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: '#006194', color: '#fff' }}>بستن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdjustmentProductSearch({ query, onSelect }: { query: string; onSelect: (p: Product) => void }) {
  const [results, setResults] = useState<Product[]>([])
  useEffect(() => {
    if (!query) return
    const t = setTimeout(async () => {
      const r = await window.api.products.search(query)
      if (r.success && r.data) setResults(r.data.slice(0, 10))
    }, 300)
    return () => clearTimeout(t)
  }, [query])
  if (results.length === 0) return null
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#3b82f6' }}>
      {results.map(p => (
        <button key={p.id} onClick={() => onSelect(p)} className="w-full text-right px-3 py-2 text-xs flex items-center justify-between hover:bg-blue-500/10 transition-all" style={{ borderBottom: '1px solid rgba(59,130,246,0.2)' }}>
          <span className="font-bold" style={{ color: '#3b82f6' }}>{p.title}</span>
          <span style={{ color: '#94a3b8' }}>موجودی: {p.stock} — {p.category}</span>
        </button>
      ))}
    </div>
  )
}
