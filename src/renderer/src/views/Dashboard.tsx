/**
 * Dashboard — main overview screen showing business KPIs and charts.
 *
 * Displays:
 *   - Today's sales summary (total, transaction count, cash/card/ledger split)
 *   - Quick action buttons (new sale, inventory, etc.)
 *   - Sales trend chart (daily totals over selected period)
 *   - Top products by revenue
 *   - Low stock alerts
 *   - Customer debt summary
 *   - Recent transactions list
 *
 * All data is fetched from IPC handlers on mount and when the refresh key changes.
 * Dates use Jalali calendar for display.
 */

import { useState, useEffect } from 'react'
import { fa } from '../i18n'
import { formatJalaliDateTime, gregorianToJalali, formatPriceFA, formatPriceFull } from '../utils/jalali'
import { generateReceiptHTML, printContent } from '../utils/receipt'
import { printA4Report, downloadExcel } from '../utils/a4Print'
import { paymentChannels, formatSalePayments } from '../utils/payment'
import SalePaymentBadge from '../components/business/SalePaymentBadge'
import ShamsiDateInput from '../components/business/ShamsiDateInput'
import Pagination from '../components/ui/Pagination'
import { useSortable } from '../hooks/useSortable'
import PrintDialog from '../components/print/PrintDialog'
import { TrendingUpIcon } from '../components/ui/Icons'
import { useTheme } from '../hooks/useTheme'
import { useSettingsStore } from '../store/settingsStore'

const primary = '#006194'

export default function Dashboard() {
  const [sales, setSales] = useState<any[]>([])
  const [performance, setPerformance] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [totalExpenses, setTotalExpenses] = useState(0)
  const [returnStats, setReturnStats] = useState({ totalReturns: 0, totalRefund: 0, todayReturns: 0 })
  const [lowStockAlerts, setLowStockAlerts] = useState<any[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedSale, setSelectedSale] = useState<any>(null)
  const [salesPage, setSalesPage] = useState(0)
  const [salesPageSize, setSalesPageSize] = useState(10)

  const { isDark, colors } = useTheme()
  const abbreviatedPrices = useSettingsStore(s => s.abbreviatedPrices)
  const cardBg = colors.bg.card
  const cardBorder = colors.border.default
  const textPrimary = colors.text.primary
  const textSecondary = colors.text.secondary
  const btnBg = colors.bg.tertiary

  const loadData = async () => {
    let s: string
    let e: string
    if (startDate && endDate) {
      s = startDate
      e = endDate + 'T23:59:59'
    } else if (startDate) {
      s = startDate
      e = '2099-12-31T23:59:59'
    } else if (endDate) {
      s = '2020-01-01'
      e = endDate + 'T23:59:59'
    } else {
      s = '2020-01-01'
      e = '2099-12-31T23:59:59'
    }

    const [sl, perf, tp, exp, ret, ls] = await Promise.all([
      window.api.sales.getByDateRange(s, e),
      window.api.sales.getUserPerformance(startDate || undefined, endDate ? endDate + 'T23:59:59' : undefined),
      window.api.sales.getTopProducts(startDate || undefined, endDate ? endDate + 'T23:59:59' : undefined),
      window.api.expenses.getTotal(startDate || undefined, endDate || undefined),
      window.api.returns.getStats(),
      window.api.products.getLowStock(),
    ])

    if (sl.success && sl.data) setSales(sl.data)
    if (perf.success && perf.data) setPerformance(perf.data)
    if (tp.success && tp.data) setTopProducts(tp.data)
    if (exp.success && exp.data !== undefined) setTotalExpenses(exp.data)
    if (ret.success && ret.data) setReturnStats(ret.data)
    if (ls.success && ls.data) setLowStockAlerts(ls.data)
  }

  useEffect(() => { loadData() }, [startDate, endDate])

  const totalSales = sales.reduce((a: number, s: any) => a + s.total_amount, 0)
  // Split payments: total each channel across the sale's actual payment rows
  const channels = sales.reduce((acc: any, s: any) => {
    const c = paymentChannels(s)
    acc.cash += c.cash; acc.bank += c.bank; acc.ledger += c.ledger
    return acc
  }, { cash: 0, bank: 0, ledger: 0 })
  const cashTotal = channels.cash
  const cardTotal = channels.bank
  const ledgerTotal = channels.ledger
  const pagedSales = sales.slice(salesPage * salesPageSize, (salesPage + 1) * salesPageSize)
  const { sorted: sortedSales, sortKey, sortDir, toggleSort } = useSortable(pagedSales)
  const [showPrintDialog, setShowPrintDialog] = useState(false)

  const getShamsiToday = () => {
    const d = new Date()
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    const jMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
    return `${jd} ${jMonths[jm - 1]} ${jy}`
  }

  const kpis = [
    {
      label: fa.dashboard.invoices,
      value: sales.length.toLocaleString('fa-IR'),
      rawValue: sales.length,
      isPrice: false,
      gradient: isDark ? 'linear-gradient(135deg, #0f2940 0%, #1a3a5c 100%)' : 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
      accent: '#0ea5e9',
      iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    },
    {
      label: fa.dashboard.totalSales,
      value: formatPriceFA(totalSales),
      rawValue: totalSales,
      isPrice: true,
      gradient: isDark ? 'linear-gradient(135deg, #052e16 0%, #14532d 100%)' : 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
      accent: '#22c55e',
      iconPath: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
    },
    {
      label: fa.dashboard.cash,
      value: formatPriceFA(cashTotal),
      rawValue: cashTotal,
      isPrice: true,
      gradient: isDark ? 'linear-gradient(135deg, #052e16 0%, #14532d 100%)' : 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
      accent: '#16a34a',
      iconPath: 'M20 12V8H6a2 2 0 010-4h14v4M4 6v12a2 2 0 002 2h14v-5M18 12a2 2 0 000 4h4v-4z',
    },
    {
      label: fa.dashboard.card,
      value: formatPriceFA(cardTotal),
      rawValue: cardTotal,
      isPrice: true,
      gradient: isDark ? 'linear-gradient(135deg, #0c1e3a 0%, #1e3a5f 100%)' : 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
      accent: '#3b82f6',
      iconPath: 'M1 4h22v16H1zM1 10h22',
    },
    {
      label: fa.dashboard.ledger,
      value: formatPriceFA(ledgerTotal),
      rawValue: ledgerTotal,
      isPrice: true,
      gradient: isDark ? 'linear-gradient(135deg, #2e1065 0%, #4c1d95 100%)' : 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
      accent: '#a855f7',
      iconPath: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
    },
    {
      label: fa.dashboard.expenses,
      value: formatPriceFA(totalExpenses),
      rawValue: totalExpenses,
      isPrice: true,
      gradient: isDark ? 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
      accent: '#ef4444',
      iconPath: 'M12 9v2m0 4h.01M5.07 19H18.93A2 2 0 0020.82 16L13.9 3.46a2 2 0 00-3.8 0L3.18 16a2 2 0 001.89 3z',
    },
    {
      label: 'مرجوعی',
      value: returnStats.totalReturns.toLocaleString('fa-IR'),
      rawValue: returnStats.totalReturns,
      isPrice: false,
      gradient: isDark ? 'linear-gradient(135deg, #451a03 0%, #78350f 100%)' : 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
      accent: '#f59e0b',
      iconPath: 'M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4',
    },
  ]

  const handlePrintA4 = async (range: { start: number; end: number } | 'all') => {
    const printSales = range === 'all' ? sales : sales.slice(range.start - 1, range.end)
    let html = '<h1>گزارش داشبورد فروشگاه</h1>'
    html += `<div class="header-info"><span>تاریخ: ${getShamsiToday()}</span><span>تعداد فاکتور: ${printSales.length}</span></div>`
    html += '<table><thead><tr><th>شاخص</th><th>مقدار</th></tr></thead><tbody>'
    kpis.forEach(s => { html += `<tr><td>${s.label}</td><td>${s.value}</td></tr>` })
    html += '</tbody></table>'
    if (topProducts.length > 0) {
      html += '<h2>پرفروش\u200cترین کالاها</h2><table><thead><tr><th>کالا</th><th>تعداد فروش</th><th>درآمد</th></tr></thead><tbody>'
      topProducts.forEach((p: any) => { html += `<tr><td>${p.productTitle || p.title}</td><td>${p.totalQty}</td><td>${p.totalRevenue?.toLocaleString('fa-IR')}</td></tr>` })
      html += '</tbody></table>'
    }
    await printA4Report(html, 'گزارش داشبورد فروشگاه')
  }

  const handleExcelExport = () => {
    const headers = ['فاکتور', 'تاریخ', 'صندوقدار', 'مشتری', 'مبلغ', 'نوع پرداخت']
    const csvRows = sales.map((s: any) => [s.invoiceNumber, formatJalaliDateTime(s.createdAt), s.userName, s.customerName || '-', s.total_amount, s.paymentMethod])
    downloadExcel('sales-report.csv', headers, csvRows)
  }

  return (
    <div className="h-full p-5 overflow-auto" style={{ background: isDark ? '#0f172a' : '#f8fafc' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${primary}, #007bb9)`,
              boxShadow: '0 2px 8px rgba(0,97,148,0.25)',
            }}
          >
            <TrendingUpIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight" style={{ color: textPrimary }}>
              {fa.dashboard.title}
            </h2>
            <p className="text-xs font-medium" style={{ color: textSecondary }}>{getShamsiToday()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrintDialog(true)}
            className="text-xs px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all duration-200"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: textSecondary, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = primary; e.currentTarget.style.color = primary }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = cardBorder; e.currentTarget.style.color = textSecondary }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            چاپ گزارش
          </button>
          <button
            onClick={handleExcelExport}
            className="text-xs px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all duration-200"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: textSecondary, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = primary; e.currentTarget.style.color = primary }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = cardBorder; e.currentTarget.style.color = textSecondary }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            خروجی اکسل
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <ShamsiDateInput value={startDate} onChange={setStartDate} label={fa.dashboard.dateFrom} />
        <ShamsiDateInput value={endDate} onChange={setEndDate} label={fa.dashboard.dateTo} />
        <div className="flex items-end gap-2">
          <button
            onClick={loadData}
            className="btn-primary text-sm py-2"
          >
            {fa.dashboard.refresh}
          </button>
          <button
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="text-sm px-4 py-2 rounded-xl font-bold transition-all duration-200"
            style={{ backgroundColor: btnBg, color: textSecondary }}
          >
            {fa.dashboard.all}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-7 gap-3 mb-6">
        {kpis.map((kpi, i) => (
          <div
            key={i}
            className="rounded-2xl p-4 text-center border overflow-hidden relative"
            style={{
              background: kpi.gradient,
              borderColor: 'transparent',
              boxShadow: isDark ? '0 2px 12px rgba(0,0,0,0.3)' : '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <div className="absolute top-2 left-2 opacity-10">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke={kpi.accent} strokeWidth="1.5">
                <path d={kpi.iconPath} />
              </svg>
            </div>
            <div className="text-[11px] font-bold mb-1.5 relative" style={{ color: kpi.accent, opacity: 0.9 }}>
              {kpi.label}
            </div>
            <div className="text-lg font-extrabold relative" style={{ color: kpi.accent }}>
              {kpi.isPrice && abbreviatedPrices ? formatPriceFA(kpi.rawValue) : kpi.value}
              {kpi.isPrice && abbreviatedPrices && kpi.rawValue > 999 && (
                <div className="text-[10px] font-bold opacity-60 mt-0.5" style={{ color: kpi.accent }}>
                  {formatPriceFull(kpi.rawValue)} تومان
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {lowStockAlerts.length > 0 && (
        <div className="rounded-2xl p-4 border mb-6" style={{ backgroundColor: isDark ? '#451a03' : '#fef3c7', borderColor: '#f59e0b' }}>
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span className="text-sm font-bold" style={{ color: '#f59e0b' }}>کالاهای کم‌موجودی ({lowStockAlerts.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockAlerts.slice(0, 8).map((p: any) => (
              <span key={p.id} className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>{p.title} ({p.stock})</span>
            ))}
            {lowStockAlerts.length > 8 && <span className="text-xs" style={{ color: '#f59e0b' }}>+{lowStockAlerts.length - 8} بیشتر</span>}
          </div>
        </div>
      )}

      {/* Performance & Top Products */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {performance.length > 0 && (
          <div
            className="rounded-2xl p-5 border overflow-hidden"
            style={{
              backgroundColor: cardBg,
              borderColor: cardBorder,
              boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: isDark ? 'rgba(0,97,148,0.2)' : 'rgba(0,97,148,0.08)' }}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <h3 className="font-extrabold text-sm" style={{ color: textPrimary }}>{fa.dashboard.cashierPerformance}</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `2px solid ${cardBorder}` }}>
                  <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.admin.name}</th>
                  <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.dashboard.invoices}</th>
                  <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.dashboard.totalSales}</th>
                  <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.dashboard.profit}</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((p) => (
                  <tr
                    key={p.userId}
                    className="transition-all duration-150"
                    style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <td className="px-3 py-2.5 font-bold" style={{ color: textPrimary }}>{p.userName}</td>
                    <td className="px-3 py-2.5" style={{ color: textSecondary }}>{p.invoiceCount}</td>
                    <td className="px-3 py-2.5 font-extrabold" style={{ color: textPrimary }}>{p.totalSales.toLocaleString('fa-IR')}</td>
                    <td className="px-3 py-2.5 font-extrabold" style={{ color: '#22c55e' }}>{p.totalProfit.toLocaleString('fa-IR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {topProducts.length > 0 && (
          <div
            className="rounded-2xl p-5 border overflow-hidden"
            style={{
              backgroundColor: cardBg,
              borderColor: cardBorder,
              boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: isDark ? 'rgba(0,97,148,0.2)' : 'rgba(0,97,148,0.08)' }}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              </div>
              <h3 className="font-extrabold text-sm" style={{ color: textPrimary }}>{fa.dashboard.topProducts}</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `2px solid ${cardBorder}` }}>
                  <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.admin.title}</th>
                  <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.pos.qty}</th>
                  <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.dashboard.totalSales}</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.slice(0, 5).map((p, i) => (
                  <tr
                    key={i}
                    className="transition-all duration-150"
                    style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <td className="px-3 py-2.5 font-bold" style={{ color: textPrimary }}>{p.productTitle}</td>
                    <td className="px-3 py-2.5" style={{ color: textSecondary }}>{p.totalQty}</td>
                    <td className="px-3 py-2.5 font-extrabold" style={{ color: textPrimary }}>{p.totalRevenue.toLocaleString('fa-IR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Sales */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          backgroundColor: cardBg,
          borderColor: cardBorder,
          boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div
          className="px-5 py-3.5 flex items-center gap-2.5"
          style={{ borderBottom: `2px solid ${cardBorder}` }}
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: isDark ? 'rgba(0,97,148,0.2)' : 'rgba(0,97,148,0.08)' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          </div>
          <span className="font-extrabold text-sm" style={{ color: textPrimary }}>{fa.dashboard.recentSales}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)' }}>
              {([
                { key: 'id' as any, label: '#' },
                { key: 'invoiceNumber' as any, label: 'فاکتور' },
                { key: 'userName' as any, label: fa.admin.cashier },
                { key: 'paymentMethod' as any, label: fa.payment.method, align: 'center' as const },
                { key: 'total_amount' as any, label: fa.pos.total },
                { key: 'createdAt' as any, label: 'تاریخ' },
              ]).map(col => (
                <th
                  key={String(col.key)}
                  className={`px-5 py-2.5 cursor-pointer select-none transition-all duration-200 text-xs font-bold ${col.align === 'center' ? 'text-center' : 'text-right'}`}
                  style={{ color: sortKey === col.key ? primary : textSecondary }}
                  onClick={() => toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <span className="text-[10px] opacity-40">{sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedSales.map((s) => (
              <tr
                key={s.id}
                className="cursor-pointer transition-all duration-150"
                style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}
                onClick={() => setSelectedSale(s)}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isDark ? 'rgba(0,97,148,0.06)' : 'rgba(0,97,148,0.03)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <td className="px-5 py-2.5" style={{ color: textSecondary }}>{sales.indexOf(s) + 1}</td>
                <td className="px-5 py-2.5 font-mono text-xs font-bold" style={{ color: primary }}>{s.invoiceNumber}</td>
                <td className="px-5 py-2.5 font-bold" style={{ color: textPrimary }}>{s.userName}</td>
                <td className="px-5 py-2.5 text-center">
                  <SalePaymentBadge sale={s} />
                </td>
                <td className="px-5 py-2.5 font-extrabold" style={{ color: textPrimary }}>{s.total_amount.toLocaleString('fa-IR')}</td>
                <td className="px-5 py-2.5 text-xs" style={{ color: textSecondary }}>{formatJalaliDateTime(s.createdAt)}</td>
              </tr>
            ))}
            {pagedSales.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke={textSecondary} strokeWidth="1" opacity="0.5">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <span className="text-sm font-bold" style={{ color: textSecondary }}>{fa.dashboard.noData}</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <Pagination total={sales.length} pageSize={salesPageSize} page={salesPage}
          onPageChange={setSalesPage} onPageSizeChange={(s) => { setSalesPageSize(s); setSalesPage(0) }} />
      </div>

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedSale(null)}>
          <div
            className="rounded-2xl p-6 max-w-lg w-full mx-4 border"
            style={{
              backgroundColor: cardBg,
              borderColor: isDark ? '#334155' : '#e2e8f0',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primary}, #007bb9)` }}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-base" style={{ color: textPrimary }}>{fa.receipt.invoice}</h3>
                  <p className="text-xs font-mono" style={{ color: primary }}>{selectedSale.invoiceNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
                style={{ backgroundColor: btnBg, color: textSecondary }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = textSecondary }}
              >
                &times;
              </button>
            </div>
            <div className="text-xs mb-4" style={{ color: textSecondary }}>
              {fa.receipt.cashier}: <b style={{ color: textPrimary }}>{selectedSale.userName}</b> · {formatJalaliDateTime(selectedSale.createdAt)}
            </div>
            <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1px solid ${cardBorder}` }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)' }}>
                    <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.receipt.item}</th>
                    <th className="text-center px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.receipt.qty}</th>
                    <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.receipt.price}</th>
                    <th className="text-right px-3 py-2 text-xs font-bold" style={{ color: textSecondary }}>{fa.receipt.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSale.items?.map((item: any) => (
                    <tr key={item.id} style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
                      <td className="px-3 py-2.5 font-bold" style={{ color: textPrimary }}>{item.productTitle}</td>
                      <td className="px-3 py-2.5 text-center" style={{ color: textSecondary }}>{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right" style={{ color: textSecondary }}>{item.unitPrice.toLocaleString('fa-IR')}</td>
                      <td className="px-3 py-2.5 text-right font-extrabold" style={{ color: textPrimary }}>{item.subtotal.toLocaleString('fa-IR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center pt-3 mb-4" style={{ borderTop: `2px solid ${cardBorder}` }}>
              <span className="font-extrabold" style={{ color: textPrimary }}>{fa.pos.total}</span>
              <span className="text-xl font-extrabold" style={{ color: '#22c55e' }}>{selectedSale.total_amount.toLocaleString('fa-IR')} {fa.common.toman}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const html = generateReceiptHTML({
                    title: fa.receipt.invoice,
                    invoiceNumber: selectedSale.invoiceNumber,
                    date: formatJalaliDateTime(selectedSale.createdAt),
                    cashier: selectedSale.userName,
                    method: formatSalePayments(selectedSale),
                    items: (selectedSale.items || []).map((item: any) => ({ name: item.productTitle, qty: item.quantity, price: item.unitPrice, total: item.subtotal })),
                    subtotal: selectedSale.subtotal, total: selectedSale.total_amount,
                    footer: 'فروشگاه',
                    storeName: 'فروشگاه',
                  })
                  printContent(html)
                }}
                className="btn-primary flex-1 py-2.5"
              >
                چاپ مجدد فاکتور
              </button>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-sm px-5 py-2.5 rounded-xl font-bold transition-all duration-200"
                style={{ backgroundColor: btnBg, color: textSecondary }}
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
      <PrintDialog open={showPrintDialog} title="چاپ گزارش داشبورد" totalCount={sales.length} onClose={() => setShowPrintDialog(false)} onPrint={(range) => { setShowPrintDialog(false); handlePrintA4(range) }} />
    </div>
  )
}
