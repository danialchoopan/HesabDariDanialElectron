import { useState, useEffect } from 'react'
import { fa } from '../../i18n'
import { printA4Report } from '../../utils/a4Print'
import { formatJalaliDateTime } from '../../utils/jalali'
import ShamsiDateInput from '../../components/business/ShamsiDateInput'
import Pagination from '../../components/ui/Pagination'
import HelpPopup from '../../components/ui/HelpPopup'
import { useSortable } from '../../hooks/useSortable'
import { useTheme } from '../../hooks/useTheme'

export default function JournalEntries() {
  const [entries, setEntries] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterType, setFilterType] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  const { isDark } = useTheme()
  const cardBg = isDark ? '#1e293b' : '#ffffff'
  const cardBorder = isDark ? '#334155' : '#e2e8f0'
  const textPrimary = isDark ? '#f1f5f9' : '#0f172a'
  const textSecondary = isDark ? '#94a3b8' : '#64748b'

  const refColors: Record<string, { bg: string; fg: string }> = {
    sale: { bg: '#dcfce7', fg: '#16a34a' },
    expense: { bg: '#fee2e2', fg: '#dc2626' },
    return: { bg: '#fef3c7', fg: '#d97706' },
    manual: { bg: '#dbeafe', fg: '#2563eb' },
  }

  const load = async () => {
    const r = await window.api.journal.getEntries({ startDate: startDate || undefined, endDate: endDate || undefined, referenceType: filterType || undefined, limit: pageSize, offset: page * pageSize })
    if (r.success && r.data) { setEntries(r.data.entries); setTotal(r.data.total) }
  }

  useEffect(() => { load() }, [startDate, endDate, filterType, page])

  const toggleExpand = (id: number) => setExpandedId(expandedId === id ? null : id)

  const totalDebit = entries.reduce((s: number, e: any) => s + (e.totalDebit || 0), 0)
  const totalCredit = entries.reduce((s: number, e: any) => s + (e.totalCredit || 0), 0)
  const { sorted, sortKey, sortDir, toggleSort } = useSortable(entries)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold" style={{ color: textPrimary }}>{fa.accounting.journal.title}</h3>
          <HelpPopup title="راهنمای روزنامه" sections={[
            { heading: 'اسناد حسابداری', items: ['هر سند شامل حداقل دو ردیف بدهکار و بستانکار است', 'جمع بدهکار باید با جمع بستانکار برابر باشد', 'اسناد خودکار از فروش، هزینه و مرجوعی ایجاد می‌شوند'] },
            { heading: 'فیلتر و جستجو', items: ['فیلتر بر اساس تاریخ شمسی', 'فیلتر بر اساس نوع سند (فروش/هزینه/مرجوعی/دستی)', 'کلیک روی سند برای مشاهده ردیف‌ها'] },
            { heading: 'سند دستی', items: ['با زدن + سند دستی ایجاد کنید', 'مطمئن شوید جمع بدهکار با بستانکار برابر است'] }
          ]} />
        </div>
        <button onClick={async () => {
          let html = '<table><thead><tr><th>#</th><th>تاریخ</th><th>شرح</th><th>نوع</th></tr></thead><tbody>'
          entries.forEach((e, i) => {
            html += `<tr><td>${page * pageSize + i + 1}</td><td>${formatJalaliDateTime(e.entryDate)}</td><td>${e.description}</td><td>${fa.accounting.journal.types[e.referenceType as keyof typeof fa.accounting.journal.types] || e.referenceType}</td></tr>`
          })
          html += '</tbody></table>'
          await printA4Report(html, 'روزنامه حسابداری')
        }} className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: textSecondary }}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
          چاپ
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-3 border flex items-center gap-3" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" className="w-5 h-5 flex-shrink-0">
            <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
          </svg>
          <div>
            <div className="text-[10px]" style={{ color: textSecondary }}>{fa.accounting.journal.debit}</div>
            <div className="text-sm font-bold font-mono" style={{ color: '#22c55e' }}>{totalDebit.toLocaleString('fa-IR')}</div>
          </div>
        </div>
        <div className="rounded-xl p-3 border flex items-center gap-3" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="w-5 h-5 flex-shrink-0">
            <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
          </svg>
          <div>
            <div className="text-[10px]" style={{ color: textSecondary }}>{fa.accounting.journal.credit}</div>
            <div className="text-sm font-bold font-mono" style={{ color: '#ef4444' }}>{totalCredit.toLocaleString('fa-IR')}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <ShamsiDateInput value={startDate} onChange={setStartDate} label={fa.dashboard.dateFrom} />
        <ShamsiDateInput value={endDate} onChange={setEndDate} label={fa.dashboard.dateTo} />
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(0) }} className="input-field w-36 text-sm">
          <option value="">همه انواع</option>
          {Object.entries(fa.accounting.journal.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
              {([
                { key: 'id' as any, label: '#' },
                { key: 'entryDate' as any, label: fa.accounting.journal.date },
                { key: 'description' as any, label: fa.accounting.journal.description },
                { key: 'referenceType' as any, label: fa.accounting.journal.reference, align: 'center' as const },
              ]).map(col => (
                <th key={String(col.key)}
                  className={`px-4 py-2 cursor-pointer select-none transition-all hover:bg-blue-500/10 ${col.align === 'center' ? 'text-center' : 'text-right'}`}
                  style={{ color: sortKey === col.key ? '#3b82f6' : textSecondary }}
                  onClick={() => toggleSort(col.key)}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <span className="text-[10px] opacity-50">{sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </span>
                </th>
              ))}
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => {
              const rc = refColors[e.referenceType || 'manual'] || refColors.manual
              return (
                <tr key={e.id} style={{ borderBottom: `1px solid ${cardBorder}` }}>
                  <td className="px-4 py-2" style={{ color: textSecondary }}>{page * pageSize + i + 1}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: textPrimary }}>{formatJalaliDateTime(e.entryDate)}</td>
                  <td className="px-4 py-2 font-medium" style={{ color: textPrimary }}>{e.description}</td>
                  <td className="px-4 py-2 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: rc.bg, color: rc.fg }}>
                      {fa.accounting.journal.types[e.referenceType as keyof typeof fa.accounting.journal.types] || e.referenceType}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => toggleExpand(e.id)} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: textSecondary }}>
                      {expandedId === e.id ? 'بستن' : fa.accounting.journal.viewLines}
                    </button>
                  </td>
                </tr>
              )
            })}
            {entries.length === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: textSecondary }}>{fa.accounting.journal.noEntries}</td></tr>}
          </tbody>
        </table>
      </div>

      <Pagination total={total} pageSize={pageSize} page={page} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(0) }} />

      {expandedId && <ExpandedEntry entryId={expandedId} cardBg={cardBg} cardBorder={cardBorder} textPrimary={textPrimary} textSecondary={textSecondary} />}
    </div>
  )
}

function ExpandedEntry({ entryId, cardBg, cardBorder, textPrimary, textSecondary }: { entryId: number; cardBg: string; cardBorder: string; textPrimary: string; textSecondary: string }) {
  const [entry, setEntry] = useState<any>(null)
  useEffect(() => {
    window.api.journal.getById(entryId).then(r => { if (r.success) setEntry(r.data) })
  }, [entryId])
  if (!entry) return null
  return (
    <div className="rounded-2xl border p-4 mt-3" style={{ backgroundColor: cardBg, borderColor: '#3b82f6' }}>
      <div className="text-sm font-bold mb-3" style={{ color: textPrimary }}>{entry.description} — {formatJalaliDateTime(entry.entryDate)}</div>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-right px-3 py-1" style={{ color: textSecondary }}>حساب</th>
            <th className="text-right px-3 py-1" style={{ color: textSecondary }}>بدهکار</th>
            <th className="text-right px-3 py-1" style={{ color: textSecondary }}>بستانکار</th>
            <th className="text-right px-3 py-1" style={{ color: textSecondary }}>شرح</th>
          </tr>
        </thead>
        <tbody>
          {entry.lines?.map((l: any) => (
            <tr key={l.id} style={{ borderBottom: `1px solid ${cardBorder}` }}>
              <td className="px-3 py-1.5" style={{ color: textPrimary }}>
                {l.accountCode ? <span className="font-mono text-xs mr-1" style={{ color: '#3b82f6' }}>{l.accountCode}</span> : null}
                {l.accountName || l.accountId}
              </td>
              <td className="px-3 py-1.5 font-bold" style={{ color: l.debit > 0 ? '#22c55e' : textSecondary }}>{l.debit > 0 ? l.debit.toLocaleString('fa-IR') : '-'}</td>
              <td className="px-3 py-1.5 font-bold" style={{ color: l.credit > 0 ? '#ef4444' : textSecondary }}>{l.credit > 0 ? l.credit.toLocaleString('fa-IR') : '-'}</td>
              <td className="px-3 py-1.5 text-xs" style={{ color: textSecondary }}>{l.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
