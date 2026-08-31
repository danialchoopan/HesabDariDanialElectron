/**
 * AccountingAnalytics — rich data visualization tab for accounting insights.
 *
 * Features:
 *   - P&L bar chart (Revenue, COGS, OpEx, Net Profit)
 *   - Expense breakdown donut chart (toggleable bar/donut)
 *   - Revenue breakdown progress bars
 *   - Balance distribution (Assets vs Liabilities vs Equity)
 *   - Cash flow summary cards
 *   - Journal entry volume per month
 *   - Text size control (small/medium/large)
 *   - Color theme selector (default/ocean/forest/warm)
 *   - Export chart as PNG
 *
 * Shows "no data" empty state when no accounting data exists.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { formatPriceFA, formatPriceComma } from '../../utils/jalali'
import { exportSvgToPng } from '../../utils/exportPng'

const COLOR_THEMES = {
  default: ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'],
  ocean: ['#0077b6', '#00b4d8', '#90e0ef', '#48cae4', '#023e8a', '#0096c7', '#ade8f4', '#caf0f8', '#03045e', '#005f73'],
  forest: ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#b7e4c7', '#d8f3dc', '#1b4332', '#081c15', '#344e41'],
  warm: ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#e76f51', '#fca311', '#1d3557', '#457b9d', '#a8dadc'],
}

interface PLData { revenue: { accountName: string; amount: number }[]; totalRevenue: number; cogs: { accountName: string; amount: number }[]; totalCogs: number; operatingExpenses: { accountName: string; amount: number }[]; totalOperatingExpenses: number; netProfit: number }
interface BSData { totalAssets: number; totalLiabilities: number; totalEquity: number; currentAssets: { accountName: string; amount: number }[]; currentLiabilities: { accountName: string; amount: number }[] }
interface CashFlow { totalInflow: number; totalOutflow: number; netCashFlow: number }
interface JournalEntry { id: number; entryDate: string; description: string }

export default function AccountingAnalytics() {
  const theme = useSettingsStore(s => s.theme)
  const isDark = theme === 'dark'

  // ─── State ─────────────────────────────────────────────
  // Data from reports API and journal entries for chart rendering
  const [pl, setPl] = useState<PLData | null>(null)       // Profit & Loss report
  const [bs, setBs] = useState<BSData | null>(null)       // Balance Sheet report
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null) // Cash flow statement
  const [allJournal, setAllJournal] = useState<JournalEntry[]>([]) // All journal entries for volume chart
  const [textSize, setTextSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [colorTheme, setColorTheme] = useState<keyof typeof COLOR_THEMES>('default')
  const [expenseChartType, setExpenseChartType] = useState<'bar' | 'donut'>('donut')

  const COLORS = COLOR_THEMES[colorTheme]
  const chartRef = useRef<HTMLDivElement>(null)

  const tPri = isDark ? '#f1f5f9' : '#0f172a'
  const tSec = isDark ? '#94a3b8' : '#64748b'
  const cardBg = isDark ? '#1e293b' : '#ffffff'
  const cardBorder = isDark ? '#334155' : '#e2e8f0'

  const fs = textSize === 'sm' ? { label: '10', value: '9', kpi: '18', title: '14' } : textSize === 'lg' ? { label: '16', value: '13', kpi: '28', title: '20' } : { label: '13', value: '11', kpi: '24', title: '17' }

  // ─── Data loading ─────────────────────────────────────
  // Fetch P&L, balance sheet, cash flow, and journal entries in parallel
  useEffect(() => {
    const load = async () => {
      const [plRes, bsRes, cfRes, allJeRes] = await Promise.all([
        window.api.reports.getProfitLoss(),
        window.api.reports.getBalanceSheet(),
        window.api.reports.getCashFlow(),
        window.api.journal.getEntries({ limit: 500 }),  // Note: returns { entries: [...], total }
      ])
      if (plRes.success && plRes.data) setPl(plRes.data)
      if (bsRes.success && bsRes.data) setBs(bsRes.data)
      if (cfRes.success && cfRes.data) setCashFlow(cfRes.data)
      if (allJeRes.success && allJeRes.data) setAllJournal(allJeRes.data.entries || [])
    }
    load()
  }, [])

  const handleExport = useCallback(() => {
    if (!chartRef.current) return
    const svgEl = chartRef.current.querySelector('svg')
    if (!svgEl) return
    exportSvgToPng(svgEl, 'accounting-analytics.png', isDark ? '#0f172a' : '#ffffff')
  }, [isDark])

  const hasData = pl || bs || cashFlow || allJournal.length > 0

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <svg className="w-16 h-16 mb-4" viewBox="0 0 24 24" fill="none" stroke={tSec} strokeWidth="1.5"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <p className="text-sm font-bold" style={{ color: tSec }}>داده‌ای موجود نیست</p>
        <p className="text-xs mt-1" style={{ color: tSec }}>اسناد حسابداری ثبت نشده است</p>
      </div>
    )
  }

  const Controls = () => (
    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold" style={{ color: tSec }}>متن:</span>
        {(['sm', 'md', 'lg'] as const).map(s => (
          <button key={s} onClick={() => setTextSize(s)} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: textSize === s ? '#006194' : 'transparent', color: textSize === s ? '#fff' : tSec }}>{s === 'sm' ? 'کوچک' : s === 'md' ? 'متوسط' : 'بزرگ'}</button>
        ))}
      </div>
      <div className="w-px h-4" style={{ backgroundColor: cardBorder }} />
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold" style={{ color: tSec }}>رنگ:</span>
        {(Object.keys(COLOR_THEMES) as (keyof typeof COLOR_THEMES)[]).map(k => (
          <button key={k} onClick={() => setColorTheme(k)} className="w-4 h-4 rounded-full border-2" style={{ borderColor: colorTheme === k ? '#fff' : 'transparent', backgroundColor: COLOR_THEMES[k][0] }} />
        ))}
      </div>
      <div className="flex-1" />
      <button onClick={handleExport} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: tSec }}>
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        خروجی PNG
      </button>
    </div>
  )

  const Card = ({ title, children, span }: { title: string; children: React.ReactNode; span?: boolean }) => (
    <div className={`rounded-xl p-4 ${span ? 'lg:col-span-2' : ''}`} style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
      <h3 className="font-bold mb-3" style={{ color: tPri, fontSize: `${parseInt(fs.title) + 1}px` }}>{title}</h3>
      {children}
    </div>
  )

  const Donut = ({ data, size = 180, total: donutTotal }: { data: { label: string; amount: number; color: string }[]; size?: number; total?: number }) => {
    const t = donutTotal || data.reduce((s, d) => s + d.amount, 0) || 1
    const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r
    let offset = 0
    return (
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" width={size} height={size} className="flex-shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={isDark ? '#334155' : '#e2e8f0'} strokeWidth="8" />
          {data.map((d, i) => { const pct = d.amount / t; const dash = circ * pct; const gap = circ - dash; const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth="8" strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />; offset += dash; return el })}
          <text x={cx} y={cy - 2} textAnchor="middle" fill={tPri} fontSize="8" fontWeight="bold">{formatPriceFA(t)}</text>
          <text x={cx} y={cy + 5} textAnchor="middle" fill={tSec} fontSize="3.5">تومان</text>
        </svg>
        <div className="space-y-1">
          {data.map((d, i) => (<div key={i} className="flex items-center gap-2"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} /><span style={{ color: tPri, fontSize: `${fs.label}px` }} className="truncate">{d.label}</span><span className="font-mono" style={{ color: tSec, fontSize: `${fs.label}px` }}>{((d.amount / t) * 100).toFixed(0)}%</span></div>))}
        </div>
      </div>
    )
  }

  // ─── Chart data ──────────────────────────────────────
  // ─── Computed chart data ──────────────────────────────
  // P&L bar items: revenue, COGS, opEx, net profit with colors
  const plItems = [
    { label: 'درآمد', value: pl?.totalRevenue || 0, color: '#22c55e' },
    { label: 'بهای تمام شده', value: pl?.totalCogs || 0, color: '#ef4444' },
    { label: 'هزینه‌ها', value: pl?.totalOperatingExpenses || 0, color: '#f59e0b' },
    { label: 'سود خالص', value: pl?.netProfit || 0, color: (pl?.netProfit || 0) >= 0 ? '#3b82f6' : '#ef4444' },
  ]
  const maxPL = Math.max(...plItems.map(i => Math.abs(i.value)), 1)

  const bsItems = [
    { label: 'دارایی‌ها', value: bs?.totalAssets || 0, color: '#3b82f6' },
    { label: 'بدهی‌ها', value: bs?.totalLiabilities || 0, color: '#ef4444' },
    { label: 'سرمایه', value: bs?.totalEquity || 0, color: '#22c55e' },
  ]
  const maxBS = Math.max(...bsItems.map(i => Math.abs(i.value)), 1)

  // ─── Journal volume: count entries per month ───────────
  // Group journal entries by month (YYYY-MM) for the monthly bar chart
  const monthMap = new Map<string, number>()
  allJournal.forEach(je => { const m = je.entryDate?.slice(0, 7) || 'نامشخص'; monthMap.set(m, (monthMap.get(m) || 0) + 1) })
  const months = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
  const maxMonthCount = Math.max(...months.map(m => m[1]), 1)

  return (
    <div className="space-y-4">
      <Controls />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'درآمد', value: formatPriceFA(pl?.totalRevenue || 0), color: '#22c55e' },
          { label: 'هزینه‌ها', value: formatPriceFA(pl?.totalOperatingExpenses || 0), color: '#ef4444' },
          { label: 'سود خالص', value: formatPriceFA(pl?.netProfit || 0), color: (pl?.netProfit || 0) >= 0 ? '#3b82f6' : '#ef4444' },
          { label: 'اسناد حسابداری', value: allJournal.length.toLocaleString('fa-IR'), color: '#a855f7' },
        ].map((kpi, i) => (
          <div key={i} className="rounded-xl p-3" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="font-bold" style={{ color: tSec, fontSize: `${fs.label}px` }}>{kpi.label}</div>
            <div className="font-bold mt-1" style={{ color: kpi.color, fontSize: `${fs.kpi}px` }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* P&L Bars */}
        <Card title="صورت سود و زیان">
          <div ref={chartRef}>
            <svg viewBox="0 0 340 180" className="w-full" style={{ maxHeight: 200 }}>
              {plItems.map((item, i) => { const x = i * 85 + 10; const h = (Math.abs(item.value) / maxPL) * 140; return (<g key={item.label}><rect x={x} y={160 - h} width={60} height={h} rx="4" fill={item.color} opacity="0.85" /><text x={x + 30} y={156 - h} textAnchor="middle" fill={tPri} fontSize={fs.value} fontWeight="bold">{formatPriceComma(item.value)}</text><text x={x + 30} y={174} textAnchor="middle" fill={tSec} fontSize={fs.value}>{item.label}</text></g>) })}
            </svg>
          </div>
        </Card>

        {/* Expense Breakdown */}
        <Card title="ترکیب هزینه‌های عملیاتی">
          <div className="flex gap-1 mb-2">
            <button onClick={() => setExpenseChartType('donut')} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: expenseChartType === 'donut' ? '#006194' : 'transparent', color: expenseChartType === 'donut' ? '#fff' : tSec }}>دایره‌ای</button>
            <button onClick={() => setExpenseChartType('bar')} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: expenseChartType === 'bar' ? '#006194' : 'transparent', color: expenseChartType === 'bar' ? '#fff' : tSec }}>میله‌ای</button>
          </div>
          {pl && pl.operatingExpenses.length > 0 ? (
            expenseChartType === 'donut' ? (
              <Donut data={pl.operatingExpenses.slice(0, 8).map((e, i) => ({ label: e.accountName, amount: e.amount, color: COLORS[i % COLORS.length] }))} size={180} />
            ) : (
              <div className="space-y-1.5">
                {pl.operatingExpenses.slice(0, 8).map((e, i) => {
                  const pct = (e.amount / (pl.totalOperatingExpenses || 1)) * 100
                  return (<div key={i}><div className="flex items-center justify-between mb-0.5"><span style={{ color: tPri, fontSize: `${fs.label}px` }} className="font-bold">{e.accountName}</span><span className="font-mono" style={{ color: COLORS[i % COLORS.length], fontSize: `${fs.label}px` }}>{formatPriceComma(e.amount)}</span></div><div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }}><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length], opacity: 0.8 }} /></div></div>)
                })}
              </div>
            )
          ) : <p className="text-xs text-center" style={{ color: tSec }}>هزینه‌ای ثبت نشده</p>}
        </Card>

        {/* Revenue Breakdown */}
        <Card title="ترکیب درآمدها">
          {pl && pl.revenue.length > 0 ? (
            <div className="space-y-2">
              {pl.revenue.map((r, i) => { const pct = (r.amount / (pl.totalRevenue || 1)) * 100; return (<div key={i}><div className="flex items-center justify-between mb-0.5"><span style={{ color: tPri, fontSize: `${fs.label}px` }} className="font-bold">{r.accountName}</span><span className="font-mono" style={{ color: '#22c55e', fontSize: `${fs.label}px` }}>{formatPriceComma(r.amount)}</span></div><div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }}><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#22c55e', opacity: 0.8 }} /></div></div>) })}
            </div>
          ) : <p className="text-xs text-center" style={{ color: tSec }}>درآمدی ثبت نشده</p>}
        </Card>

        {/* Balance Distribution */}
        <Card title="توزیع ترازنامه">
          <div className="space-y-3">
            {bsItems.map((item) => { const pct = (Math.abs(item.value) / maxBS) * 100; return (<div key={item.label}><div className="flex items-center justify-between mb-1"><span className="font-bold" style={{ color: tPri, fontSize: `${fs.label}px` }}>{item.label}</span><span className="font-mono font-bold" style={{ color: item.color, fontSize: `${fs.label}px` }}>{formatPriceFA(item.value)}</span></div><div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }}><div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: item.color, opacity: 0.85 }} /></div></div>) })}
            <p className="text-center mt-2" style={{ color: tSec, fontSize: `${fs.label}px` }}>ترازنامه: دارایی = بدهی + سرمایه</p>
          </div>
        </Card>

        {/* Cash Flow */}
        <Card title="جریان وجوه نقد">
          {cashFlow ? (
            <div className="grid grid-cols-3 gap-3">
              {[{ label: 'ورودی', value: cashFlow.totalInflow, color: '#22c55e' }, { label: 'خروجی', value: cashFlow.totalOutflow, color: '#ef4444' }, { label: 'خالص', value: cashFlow.netCashFlow, color: cashFlow.netCashFlow >= 0 ? '#3b82f6' : '#f59e0b' }].map(item => (
                <div key={item.label} className="text-center rounded-xl p-3" style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${cardBorder}` }}>
                  <div className="font-bold" style={{ color: tSec, fontSize: `${fs.label}px` }}>{item.label}</div>
                  <div className="font-bold font-mono mt-1" style={{ color: item.color, fontSize: `${fs.kpi}px` }}>{formatPriceFA(item.value)}</div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-center" style={{ color: tSec }}>داده‌ای موجود نیست</p>}
        </Card>

        {/* Journal Volume */}
        <Card title="تعداد اسناد ماهانه">
          {months.length > 0 ? (
            <svg viewBox={`0 0 ${months.length * 32} 120`} className="w-full" style={{ maxHeight: 140 }}>
              {months.map(([month, count], i) => { const x = i * 32; const h = (count / maxMonthCount) * 85; return (<g key={month}><rect x={x} y={100 - h} width={26} height={h} rx="2" fill={COLORS[i % COLORS.length]} opacity="0.8" /><text x={x + 13} y={100 - h - 4} textAnchor="middle" fill={tPri} fontSize={fs.value} fontWeight="bold">{count}</text><text x={x + 13} y={115} textAnchor="middle" fill={tSec} fontSize={fs.value}>{month.slice(5)}</text></g>) })}
            </svg>
          ) : <p className="text-xs text-center" style={{ color: tSec }}>سندی ثبت نشده</p>}
        </Card>
      </div>
    </div>
  )
}
