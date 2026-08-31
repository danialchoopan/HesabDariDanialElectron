/**
 * InventoryAnalytics — rich data visualization tab for inventory insights.
 *
 * Features:
 *   - Stock status donut chart
 *   - Category value bar chart (with toggle: bar/donut)
 *   - Top 10 products horizontal bar chart
 *   - Stock level histogram
 *   - Price comparison (purchase vs sale) per category
 *   - Text size control (small/medium/large)
 *   - Color theme selector (default/ocean/forest/warm)
 *   - Export chart as PNG (via SVG-to-canvas)
 *
 * Shows "no data" empty state when inventory is empty.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Product } from '../../../types'
import { useSettingsStore } from '../store/settingsStore'
import { formatPriceFA, formatPriceComma } from '../utils/jalali'
import { exportSvgToPng } from '../utils/exportPng'

const COLOR_THEMES = {
  default: ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'],
  ocean: ['#0077b6', '#00b4d8', '#90e0ef', '#48cae4', '#023e8a', '#0096c7', '#ade8f4', '#caf0f8', '#03045e', '#005f73'],
  forest: ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#b7e4c7', '#d8f3dc', '#1b4332', '#081c15', '#344e41'],
  warm: ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#e76f51', '#fca311', '#1d3557', '#457b9d', '#a8dadc'],
}

export default function InventoryAnalytics() {
  const theme = useSettingsStore(s => s.theme)
  const isDark = theme === 'dark'
  const [products, setProducts] = useState<Product[]>([])
  const [textSize, setTextSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [colorTheme, setColorTheme] = useState<keyof typeof COLOR_THEMES>('default')
  const [catChartType, setCatChartType] = useState<'bar' | 'donut'>('bar')

  const COLORS = COLOR_THEMES[colorTheme]
  const chartRef = useRef<HTMLDivElement>(null)

  const tPri = isDark ? '#f1f5f9' : '#0f172a'
  const tSec = isDark ? '#94a3b8' : '#64748b'
  const cardBg = isDark ? '#1e293b' : '#ffffff'
  const cardBorder = isDark ? '#334155' : '#e2e8f0'

  const fs = textSize === 'sm' ? { label: '10', value: '9', kpi: '18', title: '14' } : textSize === 'lg' ? { label: '16', value: '13', kpi: '28', title: '20' } : { label: '13', value: '11', kpi: '24', title: '17' }

  // ─── Data loading ─────────────────────────────────────
  // Fetch all active products from the database on mount
  useEffect(() => {
    window.api.products.getAll().then(r => { if (r.success && r.data) setProducts(r.data) })
  }, [])

  // ─── PNG export ────────────────────────────────────────
  // Convert the first SVG in chartRef to a PNG via canvas, then trigger download
  const handleExport = useCallback(() => {
    if (!chartRef.current) return
    const svgEl = chartRef.current.querySelector('svg')
    if (!svgEl) return
    exportSvgToPng(svgEl, 'inventory-analytics.png', isDark ? '#0f172a' : '#ffffff')
  }, [isDark])

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <svg className="w-16 h-16 mb-4" viewBox="0 0 24 24" fill="none" stroke={tSec} strokeWidth="1.5"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        <p className="text-sm font-bold" style={{ color: tSec }}>داده‌ای موجود نیست</p>
        <p className="text-xs mt-1" style={{ color: tSec }}>کالایی برای نمودار وجود ندارد</p>
      </div>
    )
  }

  // ─── Computed data from products ──────────────────────
  // Classify products by stock level: healthy (>2x min), low (0 < stock ≤ 2x min), out (= 0)
  const healthy = products.filter(p => p.stock > p.minStock * 2).length
  const low = products.filter(p => p.stock > 0 && p.stock <= p.minStock * 2).length
  const out = products.filter(p => p.stock === 0).length
  const total = products.length

  const catMap = new Map<string, { count: number; value: number; purchaseValue: number }>()
  products.forEach(p => {
    const cat = p.category || 'سایر'
    const existing = catMap.get(cat) || { count: 0, value: 0, purchaseValue: 0 }
    existing.count++; existing.value += p.stock * p.sale_price; existing.purchaseValue += p.stock * p.purchase_price
    catMap.set(cat, existing)
  })
  const categories = Array.from(catMap.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.value - a.value)
  const topProducts = [...products].sort((a, b) => (b.stock * b.sale_price) - (a.stock * a.sale_price)).slice(0, 10)

  const stockRanges = [
    { label: '0', min: 0, max: 0, count: 0 },
    { label: '1-10', min: 1, max: 10, count: 0 },
    { label: '11-30', min: 11, max: 30, count: 0 },
    { label: '31-50', min: 31, max: 50, count: 0 },
    { label: '51-100', min: 51, max: 100, count: 0 },
    { label: '100+', min: 101, max: Infinity, count: 0 },
  ]
  products.forEach(p => { const range = stockRanges.find(r => p.stock >= r.min && p.stock <= r.max); if (range) range.count++ })
  const maxHistogramCount = Math.max(...stockRanges.map(r => r.count), 1)

  const donutData = [
    { label: 'سالم', value: healthy, color: '#22c55e' },
    { label: 'کم‌موجودی', value: low, color: '#f59e0b' },
    { label: 'تمام شده', value: out, color: '#ef4444' },
  ].filter(d => d.value > 0)

  const totalValue = products.reduce((s, p) => s + p.stock * p.sale_price, 0)
  const totalCost = products.reduce((s, p) => s + p.stock * p.purchase_price, 0)
  const maxValue = Math.max(...categories.map(c => c.value), 1)

  // ─── Controls bar ─────────────────────────────────────
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

  // ─── Donut ────────────────────────────────────────────
  const Donut = ({ data, size = 200 }: { data: { label: string; value: number; color: string }[]; size?: number }) => {
    const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r
    let offset = 0
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className="mx-auto">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={isDark ? '#334155' : '#e2e8f0'} strokeWidth="8" />
        {data.map((d, i) => { const pct = d.value / total; const dash = circ * pct; const gap = circ - dash; const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth="8" strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />; offset += dash; return el })}
        <text x={cx} y={cy - 2} textAnchor="middle" fill={tPri} fontSize={fs.value} fontWeight="bold">{total}</text>
        <text x={cx} y={cy + 5} textAnchor="middle" fill={tSec} fontSize="3.5">کالا</text>
      </svg>
    )
  }

  // ─── Card wrapper ─────────────────────────────────────
  const Card = ({ title, children, span }: { title: string; children: React.ReactNode; span?: boolean }) => (
    <div className={`rounded-xl p-4 ${span ? 'lg:col-span-2' : ''}`} style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
      <h3 className="font-bold mb-3" style={{ color: tPri, fontSize: `${parseInt(fs.title) + 1}px` }}>{title}</h3>
      {children}
    </div>
  )

  return (
    <div className="space-y-4">
      <Controls />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'کل کالاها', value: total, color: '#3b82f6' },
          { label: 'ارزش فروش', value: formatPriceFA(totalValue), color: '#22c55e' },
          { label: 'ارزش خرید', value: formatPriceFA(totalCost), color: '#f59e0b' },
          { label: 'سود بالقوه', value: formatPriceFA(totalValue - totalCost), color: '#a855f7' },
        ].map((kpi, i) => (
          <div key={i} className="rounded-xl p-3" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="font-bold" style={{ color: tSec, fontSize: `${fs.label}px` }}>{kpi.label}</div>
            <div className="font-bold mt-1" style={{ color: kpi.color, fontSize: `${fs.kpi}px` }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stock Status */}
        <Card title="وضعیت موجودی">
          <div ref={chartRef} className="flex flex-col items-center">
            <Donut data={donutData} />
            <div className="flex justify-center gap-4 mt-3">
              {donutData.map(d => (
                <div key={d.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span style={{ color: tSec, fontSize: `${fs.label}px` }}>{d.label}: {d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Stock Histogram */}
        <Card title="توزيع موجودی">
            <svg viewBox="0 0 260 120" className="w-full" style={{ maxHeight: 140 }}>
              {stockRanges.map((r, i) => { const x = i * 40; const h = (r.count / maxHistogramCount) * 85; return (<g key={r.label}><rect x={x} y={110 - h} width={32} height={h} rx="3" fill={COLORS[i % COLORS.length]} opacity="0.8" /><text x={x + 16} y={110 - h - 4} textAnchor="middle" fill={tPri} fontSize={fs.value} fontWeight="bold">{r.count}</text><text x={x + 16} y={120} textAnchor="middle" fill={tSec} fontSize={fs.value}>{r.label}</text></g>) })}
          </svg>
        </Card>

        {/* Category Chart with toggle */}
        <Card title="ارزش موجودی به تفکیک دسته">
          <div className="flex gap-1 mb-2">
            <button onClick={() => setCatChartType('bar')} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: catChartType === 'bar' ? '#006194' : 'transparent', color: catChartType === 'bar' ? '#fff' : tSec }}>میله‌ای</button>
            <button onClick={() => setCatChartType('donut')} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: catChartType === 'donut' ? '#006194' : 'transparent', color: catChartType === 'donut' ? '#fff' : tSec }}>دایره‌ای</button>
          </div>
          {catChartType === 'bar' ? (
            <svg viewBox="0 0 320 200" className="w-full" style={{ maxHeight: 220 }}>
              {categories.slice(0, 8).map((cat, i) => { const y = i * 24; const w = (cat.value / maxValue) * 200; return (<g key={cat.name}><text x="0" y={y + 14} fill={tSec} fontSize={fs.value}>{cat.name}</text><rect x="65" y={y} width={w} height={20} rx="3" fill={COLORS[i % COLORS.length]} opacity="0.85" /><text x={70 + w} y={y + 15} fill={tPri} fontSize={fs.value} fontWeight="bold">{formatPriceComma(cat.value)}</text></g>) })}
            </svg>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Donut data={categories.slice(0, 8).map((c, i) => ({ label: c.name, value: c.value, color: COLORS[i % COLORS.length] }))} size={140} />
              <div className="space-y-1">
                {categories.slice(0, 8).map((c, i) => (<div key={c.name} className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} /><span className="text-[10px]" style={{ color: tPri }}>{c.name}</span></div>))}
              </div>
            </div>
          )}
        </Card>

        {/* Top Products */}
        <Card title="۱۰ کالای برتر (ارزش فروش)">
          <div className="space-y-1.5">
            {topProducts.map((p, i) => { const val = p.stock * p.sale_price; const maxP = topProducts[0]?.stock * topProducts[0]?.sale_price || 1; return (<div key={p.id} className="flex items-center gap-2"><span className="truncate font-bold" style={{ color: tPri, fontSize: `${fs.label}px`, width: '5rem' }}>{p.title}</span><div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }}><div className="h-full rounded-full" style={{ width: `${(val / maxP) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} /></div><span className="font-mono font-bold" style={{ color: tPri, fontSize: `${fs.label}px`, width: '4rem', textAlign: 'left' }}>{formatPriceFA(val)}</span></div>) })}
          </div>
        </Card>

        {/* Price Comparison */}
        <Card title="مقایسه قیمت خرید و فروش" span>
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#22c55e' }} /><span className="text-[10px]" style={{ color: tSec }}>فروش</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: '#3b82f6' }} /><span className="text-[10px]" style={{ color: tSec }}>خرید</span></div>
          </div>
          <svg viewBox="0 0 340 260" className="w-full" style={{ maxHeight: 280 }}>
            {categories.slice(0, 7).map((cat, i) => { const y = i * 36; const saleW = (cat.value / maxValue) * 200; const purchaseW = (cat.purchaseValue / maxValue) * 200; return (<g key={cat.name}><text x="0" y={y + 8} fill={tSec} fontSize={fs.value}>{cat.name}</text><rect x="55" y={y} width={saleW} height={14} rx="2" fill="#22c55e" opacity="0.8" /><text x={60 + saleW} y={y + 11} fill={tPri} fontSize={fs.value}>{formatPriceComma(cat.value)}</text><rect x="55" y={y + 16} width={purchaseW} height={14} rx="2" fill="#3b82f6" opacity="0.8" /><text x={60 + purchaseW} y={y + 27} fill={tPri} fontSize={fs.value}>{formatPriceComma(cat.purchaseValue)}</text></g>) })}
          </svg>
        </Card>
      </div>
    </div>
  )
}
