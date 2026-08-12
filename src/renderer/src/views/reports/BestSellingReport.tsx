/**
 * BestSellingReport — top-selling products with ranking, comparison, and charts.
 *
 * Features:
 *   - Top 10 products bar chart with revenue
 *   - Ranking table with units sold, revenue, avg price
 *   - Period comparison (current vs previous) with change indicators
 *   - Date range filters: today, week, month, quarter, year
 *   - Category filter
 *   - Excel export
 *   - "No data" empty state
 */

import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { formatPriceFA, formatPriceComma } from '../../utils/jalali'
import { downloadExcel } from '../../utils/a4Print'

type Period = 'today' | 'week' | 'month' | 'quarter' | 'year'

export default function BestSellingReport() {
  const theme = useSettingsStore(s => s.theme)
  const isDark = theme === 'dark'
  const [data, setData] = useState<any[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [category, setCategory] = useState('all')
  const [categories, setCategories] = useState<string[]>([])

  const tPri = isDark ? '#f1f5f9' : '#0f172a'
  const tSec = isDark ? '#94a3b8' : '#64748b'
  const cardBg = isDark ? '#1e293b' : '#ffffff'
  const cardBorder = isDark ? '#334155' : '#e2e8f0'
  const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316']

  const getDateRange = useCallback((): { start?: string; end?: string } => {
    const now = new Date()
    const toISO = (d: Date) => d.toISOString().slice(0, 10)
    switch (period) {
      case 'today': return { start: toISO(now), end: toISO(now) }
      case 'week': { const d = new Date(now); d.setDate(d.getDate() - 7); return { start: toISO(d), end: toISO(now) } }
      case 'month': { const d = new Date(now); d.setMonth(d.getMonth() - 1); return { start: toISO(d), end: toISO(now) } }
      case 'quarter': { const d = new Date(now); d.setMonth(d.getMonth() - 3); return { start: toISO(d), end: toISO(now) } }
      case 'year': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return { start: toISO(d), end: toISO(now) } }
    }
  }, [period])

  const loadData = useCallback(async () => {
    const range = getDateRange()
    const cat = category === 'all' ? undefined : category
    const r = await window.api.reports.getBestSelling(range.start, range.end, cat)
    if (r.success && r.data) {
      setData(r.data)
      if (categories.length === 0) {
        const catR = await window.api.products.getCategories()
        if (catR.success && catR.data) setCategories(catR.data)
      }
    }
  }, [getDateRange, category])

  useEffect(() => { loadData() }, [loadData])

  const top10 = data.slice(0, 10)
  const maxRevenue = Math.max(...top10.map(r => r.totalRevenue), 1)

  const handleExport = () => {
    const headers = ['رتبه', 'کالا', 'بارکد', 'دسته', 'تعداد فروش', 'درآمد کل', 'میانگین قیمت', 'فروش دوره قبل']
    const rows = data.map(r => [r.rank, r.productTitle, r.barcode, r.category, r.unitsSold, r.totalRevenue, Math.round(r.avgPrice), r.prevUnitsSold])
    downloadExcel('best-selling.csv', headers, rows)
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <svg className="w-16 h-16 mb-4" viewBox="0 0 24 24" fill="none" stroke={tSec} strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-5.18 2.75L8 13.61l-5-4.87 6.91-1.01L12 2z"/></svg>
        <p className="text-sm font-bold" style={{ color: tSec }}>داده‌ای موجود نیست</p>
        <p className="text-xs mt-1" style={{ color: tSec }}>فروشی در این بازه ثبت نشده</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
        {([['today', 'امروز'], ['week', 'هفته'], ['month', 'ماه'], ['quarter', '۳ ماه'], ['year', 'سال']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setPeriod(key)} className="px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: period === key ? '#006194' : 'transparent', color: period === key ? '#fff' : tSec, border: `1px solid ${period === key ? '#006194' : cardBorder}` }}>{label}</button>
        ))}
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-bold outline-none" style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${cardBorder}`, color: tPri }}>
          <option value="all">همه دسته‌ها</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={handleExport} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>خروجی اکسل</button>
      </div>

      {/* Bar Chart: Top 10 */}
      <div className="rounded-xl p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: tPri }}>۱۰ کالای پرفروش</h3>
        <div className="space-y-2">
          {top10.map((r, i) => {
            const pct = (r.totalRevenue / maxRevenue) * 100
            return (
              <div key={r.productId} className="flex items-center gap-2">
                <span className="text-xs font-bold w-6 text-center" style={{ color: i < 3 ? COLORS[i] : tSec }}>{r.rank}</span>
                <span className="text-xs truncate font-bold w-24" style={{ color: tPri }}>{r.productTitle}</span>
                <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length], opacity: 0.85 }} />
                </div>
                <span className="text-xs font-mono font-bold w-20 text-left" style={{ fontFamily: "'Vazirmatn'" ,color: tPri }}>{formatPriceComma(r.totalRevenue)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: r.unitsSold > r.prevUnitsSold ? '#22c55e' : r.unitsSold < r.prevUnitsSold ? '#ef4444' : tSec, backgroundColor: r.unitsSold > r.prevUnitsSold ? 'rgba(34,197,94,0.1)' : r.unitsSold < r.prevUnitsSold ? 'rgba(239,68,68,0.1)' : 'transparent' }}>
                  {r.unitsSold > r.prevUnitsSold ? '↑' : r.unitsSold < r.prevUnitsSold ? '↓' : '—'} {Math.abs(r.unitsSold - r.prevUnitsSold)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: cardBorder }}>
        <table className="w-full text-xs">
          <thead><tr style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
            <th className="px-3 py-2 text-center" style={{ color: tSec }}>#</th>
            <th className="px-3 py-2 text-right" style={{ color: tSec }}>کالا</th>
            <th className="px-3 py-2 text-right" style={{ color: tSec }}>دسته</th>
            <th className="px-3 py-2 text-center" style={{ color: tSec }}>فروش</th>
            <th className="px-3 py-2 text-center" style={{ color: tSec }}>قبل</th>
            <th className="px-3 py-2 text-left" style={{ color: tSec }}>درآمد</th>
            <th className="px-3 py-2 text-left" style={{ color: tSec }}>میانگین قیمت</th>
            <th className="px-3 py-2 text-center" style={{ color: tSec }}>تغییر %</th>
          </tr></thead>
          <tbody>
            {data.map(r => {
              const changePercent = r.prevUnitsSold > 0 ? ((r.unitsSold - r.prevUnitsSold) / r.prevUnitsSold) * 100 : r.unitsSold > 0 ? 100 : 0
              return (
                <tr key={r.productId} style={{ borderTop: `1px solid ${cardBorder}` }}>
                  <td className="px-3 py-2 text-center font-bold" style={{fontFamily: "'Vazirmatn'" , color: r.rank <= 3 ? COLORS[r.rank - 1] : tSec }}>{r.rank}</td>
                  <td className="px-3 py-2 font-bold" style={{ fontFamily: "'Vazirmatn'" ,color: tPri }}>{r.productTitle}</td>
                  <td className="px-3 py-2" style={{ fontFamily: "'Vazirmatn'" ,color: tSec }}>{r.category}</td>
                  <td className="px-3 py-2 text-center font-mono" style={{ fontFamily: "'Vazirmatn'" ,color: tPri }}>{r.unitsSold.toLocaleString('fa-IR')}</td>
                  <td className="px-3 py-2 text-center font-mono" style={{ fontFamily: "'Vazirmatn'" ,color: tSec }}>{r.prevUnitsSold.toLocaleString('fa-IR')}</td>
                  <td className="px-3 py-2 text-left font-mono" style={{ fontFamily: "'Vazirmatn'" ,color: '#22c55e' }}>{formatPriceComma(r.totalRevenue)}</td>
                  <td className="px-3 py-2 text-left font-mono"  style={{ fontFamily: "'Vazirmatn'" ,color: tSec }}>{formatPriceFA(r.avgPrice)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ fontFamily: "'Vazirmatn'" ,color: changePercent > 0 ? '#22c55e' : changePercent < 0 ? '#ef4444' : tSec, backgroundColor: changePercent > 0 ? 'rgba(34,197,94,0.1)' : changePercent < 0 ? 'rgba(239,68,68,0.1)' : 'transparent' }}>
                      {changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
