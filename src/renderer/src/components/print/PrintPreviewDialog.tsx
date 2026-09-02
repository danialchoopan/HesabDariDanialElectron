import { useState, useEffect } from 'react'
import { printA4Report } from '../../utils/a4Print'
import { formatDateNow } from '../../utils/jalali'
import { usePrintPreviewStore } from '../../store/printPreviewStore'
import { useTheme } from '../../hooks/useTheme'

interface TemplateInfo { key: string; name: string; color: string; border: string; align: string; shopName?: string }

const BUILT_IN: TemplateInfo[] = [
  { key: 'default', name: 'پیش‌فرض', color: '#006194', border: 'none', align: 'center' },
  { key: 'classic', name: 'کلاسیک', color: '#1a1a1a', border: 'double', align: 'center' },
  { key: 'modern', name: 'مدرن', color: '#2563eb', border: 'simple', align: 'center' },
  { key: 'minimal', name: 'مینیمال', color: '#64748b', border: 'none', align: 'right' },
  { key: 'elegant', name: 'شیک', color: '#7c3aed', border: 'decorative', align: 'center' },
  { key: 'corporate', name: 'شرکتی', color: '#0f766e', border: 'simple', align: 'center' },
  { key: 'warm', name: 'گرم', color: '#b45309', border: 'decorative', align: 'center' },
]

export default function PrintPreviewDialog() {
  const pending = usePrintPreviewStore(s => s.pending)
  const clear = usePrintPreviewStore(s => s.clear)
  const [templates, setTemplates] = useState<TemplateInfo[]>(BUILT_IN)
  const [activeTemplate, setActiveTemplate] = useState('default')
  const [loading, setLoading] = useState(false)
  const [customSettings, setCustomSettings] = useState<Record<string, any>>({})
  const [shopName, setShopName] = useState('')
  const [templateShopNames, setTemplateShopNames] = useState<Record<string, string>>({})
  const [editingShopName, setEditingShopName] = useState(false)
  const [tempShopName, setTempShopName] = useState('')
  const { isDark } = useTheme()

  const cardBg = isDark ? '#1e293b' : '#ffffff'
  const cardBorder = isDark ? '#334155' : '#e2e8f0'
  const textPrimary = isDark ? '#f1f5f9' : '#0f172a'
  const textSecondary = isDark ? '#94a3b8' : '#64748b'
  const sidebarBg = isDark ? '#151d2e' : '#f8fafc'

  useEffect(() => {
    if (!pending) return
    ;(async () => {
      const r = await window.api.settings.get('printTemplates')
      const customNames: string[] = r.success && r.data ? (() => { try { return JSON.parse(r.data) } catch { return [] } })() : []
      setTemplates([...BUILT_IN, ...customNames.map(n => ({ key: n, name: n, color: '#6366f1', border: 'none', align: 'center' }))])

      const allData = await (async () => {
        const rd = await window.api.settings.get('printTemplateData')
        return rd.success && rd.data ? JSON.parse(rd.data || '{}') : {}
      })()
      setCustomSettings(allData)

      const shopNamesData = await (async () => {
        const rn = await window.api.settings.get('printTemplateShopNames')
        return rn.success && rn.data ? JSON.parse(rn.data || '{}') : {}
      })()
      setTemplateShopNames(shopNamesData)

      const s = await window.api.printSettings.getAll()
      if (s.success && s.data?.printActiveTemplate) setActiveTemplate(s.data.printActiveTemplate)

      const shopR = await window.api.settings.getAll()
      if (shopR.success && shopR.data?.storeName) setShopName(shopR.data.storeName)
    })()
  }, [pending])

  if (!pending) return null

  const t = templates.find(x => x.key === activeTemplate) || templates[0]
  const color = customSettings[activeTemplate]?.printColorScheme || t.color
  const borderStyle = customSettings[activeTemplate]?.printBorderStyle || t.border
  const align = customSettings[activeTemplate]?.printHeaderAlign || t.align
  const activeShopName = templateShopNames[activeTemplate] || shopName

  const getBorderCSS = () => {
    if (borderStyle === 'simple') return `3px solid ${color}`
    if (borderStyle === 'double') return `6px double ${color}`
    if (borderStyle === 'decorative') return `8px solid ${color}`
    return 'none'
  }

  const getPreviewHTML = () => {
    const signatureHtml = pending.isInvoice ? `
      <div style="margin-top:12px;font-size:9pt"><strong>خریدار:</strong> ${pending.customerName || '…'}</div>
      <div style="display:flex;gap:16px;margin:4px 0;font-size:9pt">
        <label><input type="checkbox" ${pending.customerType === 'real' ? 'checked' : ''}/> حقیقی</label>
        <label><input type="checkbox" ${pending.customerType === 'legal' ? 'checked' : ''}/> حقوقی</label>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:24px;padding-top:12px;border-top:1px solid #ccc;font-size:8pt">
        <div style="width:45%;text-align:center"><div style="border-top:1px solid #333;margin-top:24px;padding-top:4px">محل امضای خریدار</div></div>
        <div style="width:45%;text-align:center"><div style="border-top:1px solid #333;margin-top:24px;padding-top:4px">محل امضای فروشنده</div></div>
      </div>` : ''

    return `
      <div style="font-family:'Vazirmatn',sans-serif;font-size:11pt;line-height:1.5;color:#1a1a1a;padding:16px;border-top:${getBorderCSS()}">
        <div style="text-align:${align};font-size:14pt;font-weight:700;color:${color};margin-bottom:2px">${activeShopName}</div>
        <div style="text-align:center;font-size:12pt;font-weight:700;color:${color};margin-bottom:4px">${pending.title}</div>
        ${pending.html}
        ${signatureHtml}
        <div style="text-align:center;margin-top:16px;font-size:8pt;color:#666;border-top:1px solid #ccc;padding-top:8px">تاریخ چاپ: ${formatDateNow()}</div>
      </div>`
  }

  const handlePrint = async () => {
    setLoading(true)
    try {
      const allData = customSettings
      const custom: Record<string, string> = allData[activeTemplate] || {}
      if (activeTemplate !== 'default' && !allData[activeTemplate]) {
        custom.printColorScheme = color
        if (t.border !== 'none') custom.printBorderStyle = t.border
        if (t.align !== 'center') custom.printHeaderAlign = t.align
      }

      const printName = templateShopNames[activeTemplate] || shopName
      await printA4Report(pending.html, pending.title, {
        isInvoice: pending.isInvoice,
        shopName: printName,
        customization: custom,
        qrData: pending.qrData,
        customerName: pending.customerName,
        customerType: pending.customerType,
      })
    } catch (err) {
      console.error('[PrintPreview] Print failed:', err)
      alert('خطا در چاپ — دوباره تلاش کنید')
    } finally {
      // ALWAYS dismiss the preview so its full-screen overlay can never stay
      // up and block the whole UI after a print attempt.
      setLoading(false)
      pending.onClose?.()
      clear()
    }
  }

  const handleClose = () => { pending.onClose?.(); clear() }

  const saveShopName = () => {
    setTemplateShopNames(prev => ({ ...prev, [activeTemplate]: tempShopName }))
    window.api.settings.set('printTemplateShopNames', JSON.stringify({ ...templateShopNames, [activeTemplate]: tempShopName }))
    setEditingShopName(false)
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={handleClose}>
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: textPrimary }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${cardBorder}` }}>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            <span className="text-sm font-bold" style={{ color: textPrimary }}>پیش‌نمایش و انتخاب قالب</span>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg transition-all hover:bg-white/10">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={textSecondary} strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex min-h-0">
          {/* Template Sidebar */}
          <div className="w-52 shrink-0 p-3 space-y-1.5 overflow-y-auto" style={{ backgroundColor: sidebarBg, borderLeft: `1px solid ${cardBorder}` }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2 px-1" style={{ color: textSecondary }}>قالب‌ها</div>
            {templates.map(tmpl => {
              const isActive = activeTemplate === tmpl.key
              const tmplColor = customSettings[tmpl.key]?.printColorScheme || tmpl.color
              const tmplBorder = customSettings[tmpl.key]?.printBorderStyle || tmpl.border
              const tmplShopName = templateShopNames[tmpl.key]
              return (
                <button key={tmpl.key} onClick={() => { setActiveTemplate(tmpl.key); setEditingShopName(false) }}
                  className="w-full text-right p-2.5 rounded-xl transition-all"
                  style={{
                    backgroundColor: isActive ? tmplColor + '18' : 'transparent',
                    border: `2px solid ${isActive ? tmplColor : 'transparent'}`,
                  }}>
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded shrink-0" style={{ backgroundColor: tmplColor }} />
                    <span className="text-xs font-bold" style={{ color: isActive ? tmplColor : textSecondary }}>{tmpl.name}</span>
                  </div>
                  {tmplShopName && <div className="text-[9px] mt-1 px-1" style={{ color: textSecondary }}>{tmplShopName}</div>}
                  <div className="flex gap-1 mt-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', color: textSecondary }}>
                      {tmplBorder === 'none' ? 'ساده' : tmplBorder === 'double' ? 'دوخط' : tmplBorder === 'decorative' ? 'تزئینی' : 'حاشیه'}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', color: textSecondary }}>
                      {tmpl.align === 'right' ? 'راست' : 'وسط'}
                    </span>
                  </div>
                </button>
              )
            })}

            {/* Per-template shop name */}
            <div className="pt-2 mt-2" style={{ borderTop: `1px solid ${cardBorder}` }}>
              <div className="text-[10px] font-bold mb-1.5 px-1" style={{ color: textSecondary }}>نام فروشگاه این قالب</div>
              {editingShopName ? (
                <div className="flex gap-1">
                  <input value={tempShopName} onChange={e => setTempShopName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveShopName(); if (e.key === 'Escape') setEditingShopName(false) }}
                    className="flex-1 px-2 py-1 rounded-lg text-[11px] font-bold outline-none" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: textPrimary }} autoFocus />
                  <button onClick={saveShopName} className="px-2 py-1 rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: '#22c55e' }}>ذخیره</button>
                </div>
              ) : (
                <button onClick={() => { setEditingShopName(true); setTempShopName(templateShopNames[activeTemplate] || shopName) }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-bold" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: textPrimary }}>
                  {templateShopNames[activeTemplate] || shopName}
                </button>
              )}
            </div>
          </div>

          {/* Preview Area */}
          <div className="flex-1 p-4 overflow-y-auto flex items-start justify-center" style={{ backgroundColor: isDark ? '#0a0f1a' : '#f0f4f8' }}>
            {/* White "paper" so the preview always reads like the real print,
                regardless of the app theme (dark mode must not white-out text). */}
            <div className="w-full max-w-lg shadow-xl rounded-lg overflow-hidden" style={{ transform: 'scale(0.7)', transformOrigin: 'top center', backgroundColor: '#fff', color: '#1a1a1a' }}>
              <div dangerouslySetInnerHTML={{ __html: getPreviewHTML() }} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderTop: `1px solid ${cardBorder}` }}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            <span className="text-xs font-bold" style={{ color: textPrimary }}>{t.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: color + '15', color }}>
              {borderStyle === 'double' ? 'دوخط' : borderStyle === 'simple' ? 'ساده' : borderStyle === 'decorative' ? 'تزئینی' : 'بدون حاشیه'}
            </span>
            {activeShopName !== shopName && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#22c55e15', color: '#22c55e' }}>{activeShopName}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={handleClose} className="px-4 py-2 rounded-xl text-xs font-bold" style={{ backgroundColor: isDark ? '#334155' : '#f1f5f9', color: textSecondary }}>لغو</button>
            <button onClick={handlePrint} disabled={loading}
              className="px-8 py-2.5 rounded-xl text-sm font-bold text-white transition-all flex items-center gap-2"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)`, boxShadow: `0 4px 16px ${color}40`, opacity: loading ? 0.5 : 1 }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              {loading ? 'در حال چاپ...' : 'چاپ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
