import { useState, useEffect, useRef } from 'react'
import type { Sale } from '../../../types'
import { fa } from '../i18n'
import { formatJalaliDateTime } from '../utils/jalali'
import { downloadExcel } from '../utils/a4Print'
import { showPrint } from '../utils/showPrint'
import { formatSalePayments } from '../utils/payment'
import SalePaymentBadge from '../components/business/SalePaymentBadge'
import ShamsiDateInput from '../components/business/ShamsiDateInput'
import Pagination from '../components/ui/Pagination'
import { useAuthStore } from '../store/authStore'
import { useSortable } from '../hooks/useSortable'
import PrintDialog from '../components/print/PrintDialog'
import { useTheme } from '../hooks/useTheme'

const primary = '#006194'

export default function SalesHistory() {
  const [sales, setSales] = useState<Sale[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [filterMethod, setFilterMethod] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterSaleType, setFilterSaleType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [returnedIds, setReturnedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [returnItem, setReturnItem] = useState<{ sale: Sale; item: any } | null>(null)
  const [returnQty, setReturnQty] = useState('')
  const [returnReason, setReturnReason] = useState('')
  const [isDamaged, setIsDamaged] = useState(false)
  const [showReturnAllConfirm, setShowReturnAllConfirm] = useState(false)
  const [returnAllReason, setReturnAllReason] = useState('')
  const [returnAllDamaged, setReturnAllDamaged] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const { isDark, colors } = useTheme()
  const user = useAuthStore((s) => s.user)

  const cardBg = colors.bg.card
  const cardBorder = colors.border.default
  const textPrimary = colors.text.primary
  const textSecondary = colors.text.secondary
  const btnBg = colors.bg.tertiary

  const loadData = async () => {
    let s: string, e: string
    if (startDate && endDate) { s = startDate; e = endDate + 'T23:59:59' }
    else if (startDate) { s = startDate; e = '2099-12-31T23:59:59' }
    else if (endDate) { s = '2020-01-01'; e = endDate + 'T23:59:59' }
    else { s = '2020-01-01'; e = '2099-12-31T23:59:59' }
    const r = await window.api.sales.getByDateRange(s, e)
    if (r.success && r.data) setSales(r.data)
  }

  useEffect(() => { loadData(); loadReturns() }, [startDate, endDate])

  const loadReturns = async () => {
    const r = await window.api.returns.list()
    if (r.success && r.data) {
      const keys = new Set<string>()
      r.data.forEach((ret: any) => keys.add(`${ret.saleId}-${ret.productId}`))
      setReturnedIds(keys)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleReturnItem = async () => {
    if (!returnItem || !returnQty || !returnReason) return
    const qty = parseInt(returnQty)
    if (qty <= 0 || qty > returnItem.item.quantity) return
    const refundAmount = returnItem.item.unitPrice * qty
    const r = await window.api.returns.create({
      saleId: returnItem.sale.id,
      userId: user?.id || 1,
      productId: returnItem.item.productId,
      quantity: qty,
      reason: returnReason,
      refundAmount,
      isDamaged,
    })
    if (r.success) {
      setReturnItem(null)
      setReturnQty('')
      setReturnReason('')
      setIsDamaged(false)
      setSelectedSale(null)
      loadData()
      loadReturns()
    }
  }

  const handleReturnAllItems = async () => {
    if (!selectedSale || !selectedSale.items) return
    const unreturnedItems = selectedSale.items.filter((item: any) => !returnedIds.has(`${selectedSale.id}-${item.productId}`))
    if (unreturnedItems.length === 0) return
    setShowReturnAllConfirm(true)
  }

  const confirmReturnAll = async () => {
    if (!selectedSale || !returnAllReason.trim()) return
    const unreturnedItems = selectedSale.items.filter((item: any) => !returnedIds.has(`${selectedSale.id}-${item.productId}`))
    for (const item of unreturnedItems) {
      await window.api.returns.create({
        saleId: selectedSale.id,
        userId: user?.id || 1,
        productId: item.productId,
        quantity: item.quantity,
        reason: returnAllReason,
        refundAmount: item.unitPrice * item.quantity,
        isDamaged: returnAllDamaged,
      })
    }
    setShowReturnAllConfirm(false)
    setReturnAllReason('')
    setReturnAllDamaged(false)
    setSelectedSale(null)
    loadData()
    loadReturns()
  }

  const filteredSales = sales.filter((s) => {
    if (filterMethod !== 'all' && s.paymentMethod !== filterMethod) return false
    if (filterSaleType !== 'all' && s.saleType !== filterSaleType) return false
    const hasReturns = s.items?.some((item: any) => returnedIds.has(`${s.id}-${item.productId}`))
    if (filterStatus === 'returned' && !hasReturns) return false
    if (filterStatus === 'normal' && hasReturns) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return s.invoiceNumber.toLowerCase().includes(q) || s.userName?.toLowerCase().includes(q) || s.customerName?.toLowerCase().includes(q) || String(s.total_amount).includes(q)
    }
    return true
  })

  const totalRevenue = filteredSales.filter(s => !s.items?.every((item: any) => returnedIds.has(`${s.id}-${item.productId}`))).reduce((sum, s) => sum + s.total_amount, 0)
  const pagedSales = filteredSales.slice(page * pageSize, (page + 1) * pageSize)
  const { sorted: sortedSales, sortKey, sortDir, toggleSort } = useSortable(pagedSales)
  const [showPrintDialog, setShowPrintDialog] = useState(false)

  const handlePrintSales = async (range: { start: number; end: number } | 'all', selectedColumns?: string[]) => {
    let data = filteredSales
    if (range !== 'all') {
      data = filteredSales.slice(range.start - 1, range.end)
    }
    const cols = selectedColumns || ['invoiceNumber', 'createdAt', 'userName', 'customerName', 'items', 'paymentMethod', 'total_amount']
    const colMap: Record<string, { header: string; cell: (s: any) => string }> = {
      invoiceNumber: { header: 'فاکتور', cell: s => s.invoiceNumber },
      createdAt: { header: 'تاریخ', cell: s => formatJalaliDateTime(s.createdAt) },
      userName: { header: 'صندوقدار', cell: s => s.userName },
      customerName: { header: 'مشتری', cell: s => s.customerName || '-' },
      items: { header: 'تعداد اقلام', cell: s => String(s.items?.length || 0) },
      paymentMethod: { header: 'نوع پرداخت', cell: s => formatSalePayments(s) },
      total_amount: { header: 'مبلغ', cell: s => s.total_amount.toLocaleString('fa-IR') },
    }
    let html = '<h1>گزارش فروش</h1>'
    html += `<div class="header-info"><span>از: ${startDate || 'همه'} تا: ${endDate || 'همه'}</span><span>تعداد: ${data.length}</span></div>`
    html += '<table><thead><tr>'
    cols.forEach(c => { if (colMap[c]) html += `<th>${colMap[c].header}</th>` })
    html += '</tr></thead><tbody>'
    data.forEach(s => {
      html += '<tr>'
      cols.forEach(c => { if (colMap[c]) html += `<td>${colMap[c].cell(s)}</td>` })
      html += '</tr>'
    })
    html += '</tbody></table>'
    if (cols.includes('total_amount')) {
      html += `<p>جمع کل: ${data.reduce((sum, s) => sum + s.total_amount, 0).toLocaleString('fa-IR')} تومان</p>`
    }
    showPrint(html, 'گزارش فروش')
  }

  const handleExcelSales = () => {
    const headers = ['فاکتور', 'تاریخ', 'صندوق دار', 'مشتری', 'تعداد اقلام', 'نوع پرداخت', 'نوع فروش', 'مبلغ']
    const csvRows = filteredSales.map(s => [s.invoiceNumber, formatJalaliDateTime(s.createdAt), s.userName, s.customerName || '-', s.items?.length || 0, formatSalePayments(s), s.saleType === 'online' ? 'آنلاین' : 'حضوری', s.total_amount])
    downloadExcel('sales-history.csv', headers, csvRows)
  }

  const statsCards = [
    {
      label: fa.dashboard.invoices,
      value: filteredSales.length,
      gradient: isDark ? 'linear-gradient(135deg, #0f2940, #1a3a5c)' : 'linear-gradient(135deg, #e0f2fe, #bae6fd)',
      accent: '#0ea5e9',
    },
    {
      label: fa.dashboard.totalSales,
      value: totalRevenue.toLocaleString('fa-IR'),
      gradient: isDark ? 'linear-gradient(135deg, #052e16, #14532d)' : 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
      accent: '#22c55e',
    },
    {
      label: 'فیلتر شده',
      value: filteredSales.length,
      gradient: isDark ? 'linear-gradient(135deg, #0c1e3a, #1e3a5f)' : 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
      accent: primary,
    },
  ]

  const unreturnedItems = selectedSale?.items?.filter((item: any) => !returnedIds.has(`${selectedSale.id}-${item.productId}`)) || []

  return (
    <div className="h-full p-4 overflow-auto" style={{ background: isDark ? '#0f172a' : '#f8fafc' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #006194, #007bb9)' }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
          </div>
          <h2 className="text-xl font-extrabold" style={{ color: textPrimary }}>{fa.dashboard.recentSales}</h2>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <input ref={searchRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field" placeholder="جستجوی فاکتور، مشتری، صندوق‌دار... (F2)" />
        </div>
        <ShamsiDateInput value={startDate} onChange={setStartDate} label={fa.dashboard.dateFrom} />
        <ShamsiDateInput value={endDate} onChange={setEndDate} label={fa.dashboard.dateTo} />
        <div className="flex items-end gap-2">
          <button onClick={loadData} className="btn btn-primary text-sm py-2">{fa.dashboard.refresh}</button>
          <button onClick={() => { setStartDate(''); setEndDate(''); setSearchQuery(''); setFilterMethod('all'); setFilterStatus('all') }} className="text-sm px-4 py-2 rounded-xl font-bold transition-all duration-200" style={{ backgroundColor: btnBg, color: textSecondary }}>{fa.dashboard.all}</button>
          <button onClick={() => setShowPrintDialog(true)} className="text-xs px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all duration-200"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: textSecondary, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            چاپ گزارش فروش
          </button>
          <button onClick={handleExcelSales} className="text-xs px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all duration-200"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: textSecondary, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            خروجی اکسل
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {['all', 'cash', 'card', 'ledger'].map((m) => (
          <button key={m} onClick={() => setFilterMethod(m)}
            className="px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200"
            style={{
              background: filterMethod === m ? primary : btnBg,
              color: filterMethod === m ? '#fff' : textSecondary,
              boxShadow: filterMethod === m ? '0 2px 8px rgba(0,97,148,0.3)' : 'none',
            }}>
            {m === 'all' ? fa.dashboard.all : m === 'cash' ? fa.payment.cash : m === 'card' ? fa.payment.card : fa.payment.ledger}
          </button>
        ))}
        <div className="w-px h-6 self-center mx-1" style={{ backgroundColor: cardBorder }} />
        {['all', 'normal', 'returned'].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200"
            style={{
              background: filterStatus === s ? (s === 'returned' ? '#f59e0b' : primary) : btnBg,
              color: filterStatus === s ? '#fff' : textSecondary,
              boxShadow: filterStatus === s ? `0 2px 8px ${s === 'returned' ? 'rgba(245,158,11,0.3)' : 'rgba(0,97,148,0.3)'}` : 'none',
            }}>
            {s === 'all' ? 'همه' : s === 'normal' ? 'عادی' : 'بازگشتی'}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-3">
        <span className="text-[10px] font-bold self-center" style={{ color: textSecondary }}>نوع فروش:</span>
        {['all', 'in-person', 'online'].map((t) => (
          <button key={t} onClick={() => setFilterSaleType(t)}
            className="px-3 py-1.5 rounded-full text-[10px] font-bold transition-all"
            style={{ background: filterSaleType === t ? '#22c55e' : btnBg, color: filterSaleType === t ? '#fff' : textSecondary }}>
            {t === 'all' ? 'همه' : t === 'in-person' ? 'حضوری' : 'آنلاین'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {statsCards.map((kpi, i) => (
          <div key={i} className="rounded-2xl p-4 text-center border overflow-hidden relative"
            style={{
              background: kpi.gradient,
              borderColor: 'transparent',
              boxShadow: isDark ? '0 2px 12px rgba(0,0,0,0.3)' : '0 2px 12px rgba(0,0,0,0.06)',
            }}>
            <div className="text-[11px] font-bold mb-1.5 relative" style={{ color: kpi.accent, opacity: 0.9 }}>{kpi.label}</div>
            <div className="text-lg font-extrabold relative" style={{ color: kpi.accent }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: cardBorder, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
        {/*
          Table layout note for developers:
          The <th> headers render the SORTABLE columns first (from the array
          below), then the fixed columns (اقلام/نوع پرداخت/نوع فروش/وضعیت).
          The <tbody> cells MUST be in the SAME visual order: id, invoice,
          cashier, customer, total, date, items, payment, saleType, status.
          If you add/remove a column, update BOTH the headers and the cells
          together, and keep sortKey labels matching what the cell shows.
        */}
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)' }}>
              {([
                { key: 'id' as keyof Sale, label: '#' },
                { key: 'invoiceNumber' as keyof Sale, label: 'فاکتور' },
                { key: 'userName' as keyof Sale, label: fa.admin.cashier },
                { key: 'customerName' as keyof Sale, label: 'مشتری' },
                { key: 'total_amount' as keyof Sale, label: fa.pos.total },
                { key: 'createdAt' as keyof Sale, label: 'تاریخ' },
              ]).map(col => (
                <th key={String(col.key)}
                  className="px-4 py-2.5 cursor-pointer select-none transition-all duration-200 text-xs font-bold text-right"
                  style={{ color: sortKey === col.key ? primary : textSecondary }}
                  onClick={() => toggleSort(col.key)}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <span className="text-[10px] opacity-40">{sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </span>
                </th>
              ))}
              <th className="text-center px-4 py-2.5 text-xs font-bold" style={{ color: textSecondary }}>اقلام</th>
              <th className="text-center px-4 py-2.5 text-xs font-bold" style={{ color: textSecondary }}>{fa.payment.method}</th>
              <th className="text-center px-4 py-2.5 text-xs font-bold" style={{ color: textSecondary }}>نوع فروش</th>
              <th className="text-center px-4 py-2.5 text-xs font-bold" style={{ color: textSecondary }}>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {sortedSales.map((s) => {
              const hasReturns = s.items?.some((item: any) => returnedIds.has(`${s.id}-${item.productId}`))
              const isFullyReturned = s.items?.every((item: any) => returnedIds.has(`${s.id}-${item.productId}`))
              return (
                <tr key={s.id}
                  className="cursor-pointer transition-all duration-150"
                  style={{
                    borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                    backgroundColor: isFullyReturned ? 'rgba(239,68,68,0.08)' : hasReturns ? 'rgba(245,158,11,0.08)' : 'transparent',
                  }}
                  onClick={() => setSelectedSale(s)}
                  onMouseEnter={(e) => { if (!hasReturns) e.currentTarget.style.backgroundColor = isDark ? 'rgba(0,97,148,0.06)' : 'rgba(0,97,148,0.03)' }}
                  onMouseLeave={(e) => { if (!hasReturns) e.currentTarget.style.backgroundColor = isFullyReturned ? 'rgba(239,68,68,0.08)' : hasReturns ? 'rgba(245,158,11,0.08)' : 'transparent' }}>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: textSecondary }}>{s.id}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-bold" style={{ color: primary }}>{s.invoiceNumber}</td>
                  <td className="px-4 py-2.5 font-bold" style={{ color: textPrimary }}>{s.userName}</td>
                  <td className="px-4 py-2.5" style={{ color: s.customerName ? textPrimary : textSecondary }}>{s.customerName || '-'}</td>
                  <td className="px-4 py-2.5 font-extrabold text-right" style={{ color: isFullyReturned ? '#ef4444' : textPrimary, textDecoration: isFullyReturned ? 'line-through' : 'none' }}>{s.total_amount.toLocaleString('fa-IR')}</td>
                  <td className="px-5 py-2.5 text-xs" style={{ color: textSecondary }}>{formatJalaliDateTime(s.createdAt)}</td>
                  <td className="px-4 py-2.5 text-center font-bold" style={{ color: textPrimary }}>{s.items.length}</td>
                  <td className="px-4 py-2.5 text-center">
                    <SalePaymentBadge sale={s} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{
                      backgroundColor: s.saleType === 'online' ? (isDark ? 'rgba(59,130,246,0.15)' : '#dbeafe') : (isDark ? 'rgba(34,197,94,0.15)' : '#dcfce7'),
                      color: s.saleType === 'online' ? '#3b82f6' : '#22c55e',
                    }}>{s.saleType === 'online' ? 'آنلاین' : 'حضوری'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isFullyReturned ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2', color: '#ef4444' }}>بازگشت کامل</span>
                    ) : hasReturns ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7', color: '#f59e0b' }}>بازگشت جزئی</span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ backgroundColor: isDark ? 'rgba(34,197,94,0.15)' : '#dcfce7', color: '#22c55e' }}>عادی</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {pagedSales.length === 0 && <tr><td colSpan={10} className="text-center py-12" style={{ color: textSecondary }}>{fa.dashboard.noData}</td></tr>}
          </tbody>
        </table>
      </div>

      <Pagination total={filteredSales.length} pageSize={pageSize} page={page}
        onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(0) }} />

      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedSale(null)}>
          <div className="rounded-2xl p-6 max-w-lg w-full mx-4 border"
            style={{
              backgroundColor: cardBg,
              borderColor: selectedSale.items?.some((item: any) => returnedIds.has(`${selectedSale.id}-${item.productId}`)) ? '#f59e0b' : cardBorder,
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #006194, #007bb9)' }}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-lg" style={{ color: textPrimary }}>{fa.receipt.invoice}</h3>
                  <p className="text-sm font-mono" style={{ color: textSecondary }}>{selectedSale.invoiceNumber}</p>
                  {selectedSale.items?.some((item: any) => returnedIds.has(`${selectedSale.id}-${item.productId}`)) && (
                    <span className="inline-block mt-1 px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7', color: '#f59e0b' }}>بازگشت شده</span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedSale(null)} className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
                style={{ backgroundColor: btnBg, color: textSecondary }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = textSecondary }}>&times;</button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
                <div className="text-xs mb-1" style={{ color: textSecondary }}>{fa.receipt.cashier}</div>
                <div className="text-sm font-bold" style={{ color: textPrimary }}>{selectedSale.userName}</div>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
                <div className="text-xs mb-1" style={{ color: textSecondary }}>{fa.payment.method}</div>
                <div className="text-sm font-bold" style={{ color: textPrimary }}>{formatSalePayments(selectedSale)}</div>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
                <div className="text-xs mb-1" style={{ color: textSecondary }}>{fa.receipt.date}</div>
                <div className="text-sm font-bold" style={{ color: textPrimary }}>{formatJalaliDateTime(selectedSale.createdAt)}</div>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
                <div className="text-xs mb-1" style={{ color: textSecondary }}>مشتری</div>
                <div className="text-sm font-bold" style={{ color: textPrimary }}>{selectedSale.customerName || 'ناشناس'}</div>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
                <div className="text-xs mb-1" style={{ color: textSecondary }}>نوع فروش</div>
                <div className="text-sm font-bold" style={{ color: selectedSale.saleType === 'online' ? '#3b82f6' : '#22c55e' }}>{selectedSale.saleType === 'online' ? 'آنلاین' : 'حضوری'}</div>
              </div>
            </div>

            {(selectedSale.description || (selectedSale as any).invoiceDescription) && (
              <div className="rounded-xl p-3 mb-4 space-y-2" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
                {(selectedSale as any).invoiceDescription && (
                  <div>
                    <div className="text-[10px] font-bold mb-0.5" style={{ color: textSecondary }}>توضیحات فاکتور (قابل چاپ)</div>
                    <div className="text-sm" style={{ color: textPrimary }}>{(selectedSale as any).invoiceDescription}</div>
                  </div>
                )}
                {selectedSale.description && (
                  <div>
                    <div className="text-[10px] font-bold mb-0.5" style={{ color: textSecondary }}>توضیحات خصوصی</div>
                    <div className="text-sm" style={{ color: textPrimary }}>{selectedSale.description}</div>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1px solid ${cardBorder}` }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `2px solid ${cardBorder}` }}>
                    <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>کالا</th>
                    <th className="text-center px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>تعداد</th>
                    <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>قیمت واحد</th>
                    <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>جمع</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSale.items?.map((item: any) => {
                    const isItemReturned = returnedIds.has(`${selectedSale.id}-${item.productId}`)
                    return (
                      <tr key={item.id} style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
                        <td className="px-3 py-2 font-bold" style={{ color: textPrimary }}>{item.productTitle}</td>
                        <td className="px-3 py-2 text-center" style={{ color: textPrimary }}>{item.quantity}</td>
                        <td className="px-3 py-2 text-right" style={{ color: textPrimary }}>{item.unitPrice.toLocaleString('fa-IR')}</td>
                        <td className="px-3 py-2 text-right font-extrabold" style={{ color: textPrimary }}>{item.subtotal.toLocaleString('fa-IR')}</td>
                        <td className="px-3 py-2 text-center">
                          {isItemReturned ? (
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2', color: '#ef4444' }}>مرجوعی</span>
                          ) : (
                            <button onClick={() => { setReturnItem({ sale: selectedSale, item }); setReturnQty(String(item.quantity)); setReturnReason('') }}
                              className="text-[10px] font-bold px-2.5 py-1 rounded-full transition-all duration-200"
                              style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7', color: '#f59e0b' }}>مرجوع</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-3 mb-4" style={{ borderTop: `2px solid ${cardBorder}` }}>
              <span className="font-extrabold" style={{ color: textPrimary }}>{fa.pos.total}</span>
              <span className="text-xl font-extrabold" style={{ color: '#22c55e' }}>{selectedSale.total_amount.toLocaleString('fa-IR')} {fa.common.toman}</span>
            </div>

            <div className="flex gap-2">
              <button onClick={async () => {
                if (!selectedSale) return
                let html = ''
                const customerInfo = selectedSale.customerName ? `<div class="header-info"><span>مشتری: ${selectedSale.customerName}</span></div>` : ''
                html += customerInfo
                html += `<div class="header-info"><span>شماره فاکتور: ${selectedSale.invoiceNumber}</span><span>تاریخ: ${formatJalaliDateTime(selectedSale.createdAt)}</span></div>`
                html += `<div class="header-info"><span>صندوق دار: ${selectedSale.userName}</span><span>نوع پرداخت: ${formatSalePayments(selectedSale)}</span><span>نوع فروش: ${selectedSale.saleType === 'online' ? 'آنلاین' : 'حضوری'}</span></div>`
                html += '<table><thead><tr><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>'
                selectedSale.items?.forEach((item: any) => { html += `<tr><td>${item.productTitle}</td><td>${item.quantity}</td><td>${item.unitPrice.toLocaleString('fa-IR')}</td><td>${item.subtotal.toLocaleString('fa-IR')}</td></tr>` })
                html += '</tbody></table>'
                html += `<p><strong>جمع کل: ${selectedSale.total_amount.toLocaleString('fa-IR')} تومان</strong></p>`
                html += `<div style="margin-top:16px;padding-top:8px;border-top:1px solid #ccc;text-align:left;font-size:8pt;color:#999">چاپ مجدد — ${new Date().toLocaleString('fa-IR')}</div>`
                showPrint(html, selectedSale.paymentMethod === 'ledger' ? 'صورتحساب بدهی' : 'فاکتور فروش', true, selectedSale.invoiceNumber, undefined, { name: selectedSale.customerName, type: selectedSale.customerType })
              }}
                className="text-sm px-5 py-2.5 rounded-xl font-bold flex-1 transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, #006194, #007bb9)', color: '#fff', boxShadow: '0 2px 8px rgba(0,97,148,0.3)' }}>چاپ فاکتور</button>
              {!selectedSale.items?.every((item: any) => returnedIds.has(`${selectedSale.id}-${item.productId}`)) && (
                <button onClick={handleReturnAllItems}
                  className="text-sm px-5 py-2.5 rounded-xl font-bold flex-1 transition-all duration-200"
                  style={{ backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7', color: '#f59e0b' }}>بازگشت کل فاکتور</button>
              )}
              <button onClick={() => setSelectedSale(null)}
                className="text-sm px-5 py-2.5 rounded-xl font-bold flex-1 transition-all duration-200"
                style={{ backgroundColor: btnBg, color: textSecondary }}>{fa.common.close}</button>
            </div>
          </div>
        </div>
      )}

      {returnItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setReturnItem(null)}>
          <div className="rounded-2xl p-6 max-w-md w-full mx-4 border"
            style={{ backgroundColor: cardBg, borderColor: '#ef4444', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              </div>
              <h3 className="font-extrabold text-lg" style={{ color: '#ef4444' }}>مرجوع کالا</h3>
            </div>
            <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#fee2e2' }}>
              <div className="text-sm font-bold" style={{ color: textPrimary }}>{returnItem.item.productTitle}</div>
              <div className="text-xs mt-1" style={{ color: textSecondary }}>تعداد خریداری شده: {returnItem.item.quantity} — قیمت واحد: {returnItem.item.unitPrice.toLocaleString('fa-IR')}</div>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: textSecondary }}>تعداد مرجوع</label>
                <input type="number" min="1" max={returnItem.item.quantity} value={returnQty} onChange={(e) => setReturnQty(e.target.value)} className="input-field text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: textSecondary }}>نوع مرجوعی</label>
                <div className="flex gap-2">
                  <button onClick={() => setIsDamaged(false)} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: !isDamaged ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'transparent', color: !isDamaged ? '#fff' : textSecondary, border: `1px solid ${!isDamaged ? '#22c55e' : cardBorder}` }}>
                    بازگشت کالا سالم
                  </button>
                  <button onClick={() => setIsDamaged(true)} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: isDamaged ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'transparent', color: isDamaged ? '#fff' : textSecondary, border: `1px solid ${isDamaged ? '#ef4444' : cardBorder}` }}>
                    کالا معیوب / ضرر
                  </button>
                </div>
                <p className="text-[10px] mt-1" style={{ color: textSecondary }}>
                  هر دو حالت شامل بازگشت وجه و ثبت سند حسابداری هستند — تفاوت فقط در وضعیت کالا
                </p>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: textSecondary }}>دلیل مرجوعی</label>
                <input type="text" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="input-field text-sm" placeholder="مثال: کالای معیوب" />
              </div>
              {isDamaged && returnQty && parseInt(returnQty) > 0 && (
                <div className="rounded-xl p-3" style={{ backgroundColor: isDark ? '#450a0a' : '#fee2e2' }}>
                  <div className="text-xs" style={{ color: textSecondary }}>مبلغ کسر شده از فاکتور</div>
                  <div className="text-lg font-extrabold" style={{ color: '#ef4444' }}>{(returnItem.item.unitPrice * parseInt(returnQty)).toLocaleString('fa-IR')} تومان</div>
                </div>
              )}
              {!isDamaged && returnQty && parseInt(returnQty) > 0 && (
                <div className="rounded-xl p-3" style={{ backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : '#dcfce7' }}>
                  <div className="text-xs" style={{ color: textSecondary }}>موجودی بازیابی می‌شود — بدون تغییر مالی</div>
                  <div className="text-sm font-bold" style={{ color: '#22c55e' }}>{returnQty} عدد به انبار اضافه می‌شود</div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handleReturnItem} disabled={!returnQty || !returnReason || parseInt(returnQty) <= 0 || parseInt(returnQty) > returnItem.item.quantity}
                className="btn btn-danger flex-1 py-2.5 disabled:opacity-40">تایید مرجوعی</button>
              <button onClick={() => setReturnItem(null)}
                className="text-sm px-5 py-2.5 rounded-xl font-bold flex-1 transition-all duration-200"
                style={{ backgroundColor: btnBg, color: textSecondary }}>{fa.common.close}</button>
            </div>
          </div>
        </div>
      )}

      {showReturnAllConfirm && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center" onClick={() => setShowReturnAllConfirm(false)}>
          <div className="rounded-2xl p-6 max-w-md w-full mx-4 border-2" style={{ backgroundColor: cardBg, borderColor: '#f59e0b' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <h3 className="font-extrabold text-lg" style={{ color: '#f59e0b' }}>بازگشت کل فاکتور</h3>
            </div>
            <p className="text-sm mb-3" style={{ color: textSecondary }}>آیا از بازگشت تمام اقلام این فاکتور اطمینان دارید؟</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: textSecondary }}>نوع مرجوعی</label>
                <div className="flex gap-2">
                  <button onClick={() => setReturnAllDamaged(false)} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: !returnAllDamaged ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'transparent', color: !returnAllDamaged ? '#fff' : textSecondary, border: `1px solid ${!returnAllDamaged ? '#22c55e' : cardBorder}` }}>
                    بازگشت کالا سالم
                  </button>
                  <button onClick={() => setReturnAllDamaged(true)} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: returnAllDamaged ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'transparent', color: returnAllDamaged ? '#fff' : textSecondary, border: `1px solid ${returnAllDamaged ? '#ef4444' : cardBorder}` }}>
                    کالا معیوب / ضرر
                  </button>
                </div>
                <p className="text-[10px] mt-1" style={{ color: textSecondary }}>
                  هر دو حالت شامل بازگشت وجه به مشتری و ثبت سند حسابداری هستند
                </p>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: returnAllDamaged ? (isDark ? '#450a0a' : '#fee2e2') : (isDark ? '#0f2922' : '#dcfce7') }}>
                <div className="text-xs" style={{ color: textSecondary }}>
                  {returnAllDamaged ? 'مبلغ کسر شده از فاکتور' : 'بازگشت کل اقلام — فقط موجودی انبار'}
                </div>
                <div className="text-sm font-bold" style={{ color: returnAllDamaged ? '#ef4444' : '#22c55e' }}>
                  {returnAllDamaged
                    ? `${unreturnedItems.reduce((s: number, i: any) => s + i.unitPrice * i.quantity, 0).toLocaleString('fa-IR')} تومان`
                    : `${unreturnedItems.length} قلم — بدون تغییر مالی`}
                </div>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs font-medium block mb-1" style={{ color: textSecondary }}>دلیل مرجوعی *</label>
              <input type="text" value={returnAllReason} onChange={(e) => setReturnAllReason(e.target.value)} className="input-field w-full text-sm" placeholder="دلیل بازگشت را وارد کنید" autoFocus />
            </div>
            <div className="flex gap-2">
              <button onClick={confirmReturnAll} disabled={!returnAllReason.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200"
                style={{ backgroundColor: returnAllReason.trim() ? '#f59e0b' : '#94a3b8', color: '#fff', opacity: returnAllReason.trim() ? 1 : 0.5, boxShadow: returnAllReason.trim() ? '0 2px 8px rgba(245,158,11,0.3)' : 'none' }}>تایید بازگشت</button>
              <button onClick={() => { setShowReturnAllConfirm(false); setReturnAllReason('') }}
                className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200"
                style={{ backgroundColor: btnBg, color: textSecondary }}>لغو</button>
            </div>
          </div>
        </div>
      )}

      <PrintDialog open={showPrintDialog} title="چاپ گزارش فروش" totalCount={filteredSales.length}
        columns={[
          { key: 'invoiceNumber', label: 'فاکتور' },
          { key: 'createdAt', label: 'تاریخ' },
          { key: 'userName', label: 'صندوق دار' },
          { key: 'customerName', label: 'مشتری' },
          { key: 'items', label: 'تعداد اقلام' },
          { key: 'paymentMethod', label: 'نوع پرداخت' },
          { key: 'total_amount', label: 'مبلغ' },
        ]}
        onClose={() => setShowPrintDialog(false)} onPrint={(range, cols) => { setShowPrintDialog(false); handlePrintSales(range, cols) }} />
    </div>
  )
}
