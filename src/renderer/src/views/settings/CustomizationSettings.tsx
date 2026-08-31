/**
 * CustomizationSettings — print customization panel for invoices and reports.
 *
 * Controls print appearance:
 *   - Shop name, phone, address (displayed on invoices)
 *   - Tax rate and toggle
 *   - Invoice title, report title, footer text
 *   - Print template selection (default, formal, minimal, etc.)
 *   - Signature display toggle
 *   - Live preview showing exactly how the printed output will look
 *
 * Settings are stored in the printSettings table and applied at print time
 * via the a4Print module's cached values.
 */

import { useState, useEffect, useRef } from 'react'
import { printA4Report, setPrintCustomization } from '../../utils/a4Print'
import { formatDateNow } from '../../utils/jalali'
import { useTheme } from '../../hooks/useTheme'

interface PrintSettings {
  printInvoiceTitle: string
  printReprintTitle: string
  printReportTitle: string
  printFooter: string
  printColorScheme: string
  printShowSignature: string
  printShowTax: string
  printLogo: string
  printSignature: string
  printWatermark: string
  printWatermarkOpacity: string
  printFontSize: string
  printHeaderSize: string
  printLineSpacing: string
  printMarginTop: string
  printMarginBottom: string
  printMarginLeft: string
  printMarginRight: string
  printPaperSize: string
  printHeaderField1: string
  printHeaderField2: string
  printHeaderField3: string
  printBorderStyle: string
  printHeaderAlign: string
  printFontFamily: string
  printActiveTemplate: string
}

const defaults: PrintSettings = {
  printInvoiceTitle: 'فاکتور فروش', printReprintTitle: 'چاپ دوباره فاکتور', printReportTitle: 'گزارش',
  printFooter: '', printColorScheme: '#006194', printShowSignature: 'true', printShowTax: 'true',
  printLogo: '', printSignature: '', printWatermark: '', printWatermarkOpacity: '20',
  printFontSize: '11pt', printHeaderSize: '18pt', printLineSpacing: '1.5',
  printMarginTop: '15', printMarginBottom: '15', printMarginLeft: '15', printMarginRight: '15',
  printPaperSize: 'A4', printHeaderField1: '', printHeaderField2: '', printHeaderField3: '',
  printBorderStyle: 'none', printHeaderAlign: 'center', printFontFamily: 'Vazirmatn', printActiveTemplate: 'default',
}

const BUILT_IN_TEMPLATES = [
  { key: 'default', name: 'پیش‌فرض', color: '#006194', border: 'none', align: 'center' },
  { key: 'classic', name: 'کلاسیک', color: '#1a1a1a', border: 'double', align: 'center' },
  { key: 'modern', name: 'مدرن', color: '#2563eb', border: 'simple', align: 'center' },
  { key: 'minimal', name: 'مینیمال', color: '#64748b', border: 'none', align: 'right' },
  { key: 'elegant', name: 'شیک', color: '#7c3aed', border: 'decorative', align: 'center' },
  { key: 'corporate', name: 'شرکتی', color: '#0f766e', border: 'simple', align: 'center' },
  { key: 'warm', name: 'گرم', color: '#b45309', border: 'decorative', align: 'center' },
]

export default function CustomizationSettings() {
  const [settings, setSettings] = useState<PrintSettings>(defaults)
  const [saved, setSaved] = useState(false)
  const [previews, setPreviews] = useState<{ logo: string; signature: string; watermark: string }>({ logo: '', signature: '', watermark: '' })
  const [customTemplates, setCustomTemplates] = useState<string[]>([])
  const [newTemplateName, setNewTemplateName] = useState('')
  const [showNewInput, setShowNewInput] = useState(false)
  const [templateShopNames, setTemplateShopNames] = useState<Record<string, string>>({})
  const [editingShopName, setEditingShopName] = useState(false)
  const [tempShopName, setTempShopName] = useState('')
  const logoRef = useRef<HTMLInputElement>(null)
  const sigRef = useRef<HTMLInputElement>(null)
  const wmRef = useRef<HTMLInputElement>(null)
  const { isDark } = useTheme()
  const primary = settings.printColorScheme || '#006194'

  const cardBg = isDark ? '#1e293b' : '#ffffff'
  const cardBorder = isDark ? '#334155' : '#e2e8f0'
  const textPrimary = isDark ? '#f1f5f9' : '#0f172a'
  const textSecondary = isDark ? '#94a3b8' : '#64748b'
  const inputBg = isDark ? '#0f172a' : '#f8fafc'
  const inputStyle = { background: inputBg, border: `1px solid ${cardBorder}`, color: textPrimary }
  const inputClass = "w-full px-3 py-2 rounded-lg text-sm font-bold transition-all outline-none"

  const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`rounded-xl p-4 border ${className}`} style={{ backgroundColor: cardBg, borderColor: cardBorder }}>{children}</div>
  )

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-xs font-bold block mb-1.5" style={{ color: textSecondary }}>{children}</label>
  )

  useEffect(() => { loadSettings(); loadCustomTemplates(); loadTemplateShopNames() }, [])

  const loadSettings = async () => {
    const r = await window.api.printSettings.getAll()
    if (r.success && r.data) {
      setSettings((prev) => ({ ...prev, ...r.data }))
      setPrintCustomization(r.data)
      const p = { logo: '', signature: '', watermark: '' }
      if (r.data.printLogo) { const ar = await window.api.printSettings.getAsset(r.data.printLogo); if (ar.success && ar.data) p.logo = ar.data }
      if (r.data.printSignature) { const ar = await window.api.printSettings.getAsset(r.data.printSignature); if (ar.success && ar.data) p.signature = ar.data }
      if (r.data.printWatermark) { const ar = await window.api.printSettings.getAsset(r.data.printWatermark); if (ar.success && ar.data) p.watermark = ar.data }
      setPreviews(p)
    }
  }

  const loadCustomTemplates = async () => {
    const r = await window.api.settings.get('printTemplates')
    if (r.success && r.data) { try { setCustomTemplates(JSON.parse(r.data)) } catch {} }
  }

  const loadTemplateShopNames = async () => {
    const r = await window.api.settings.get('printTemplateShopNames')
    if (r.success && r.data) { try { setTemplateShopNames(JSON.parse(r.data)) } catch {} }
  }

  const saveCustomTemplates = async (list: string[]) => {
    setCustomTemplates(list)
    await window.api.settings.set('printTemplates', JSON.stringify(list))
  }

  const getTemplateData = async (): Promise<Record<string, any>> => {
    const r = await window.api.settings.get('printTemplateData')
    return r.success && r.data ? JSON.parse(r.data || '{}') : {}
  }

  const selectTemplate = async (key: string) => {
    const builtIn = BUILT_IN_TEMPLATES.find(t => t.key === key)
    if (builtIn) {
      setSettings(prev => ({ ...prev, printActiveTemplate: key, printColorScheme: builtIn.color, printBorderStyle: builtIn.border, printHeaderAlign: builtIn.align }))
      return
    }
    const allData = await getTemplateData()
    if (allData[key]) setSettings(prev => ({ ...prev, ...allData[key], printActiveTemplate: key }))
  }

  const handleSave = async () => {
    await window.api.printSettings.save(settings as unknown as Record<string, string>)
    setPrintCustomization(settings as unknown as Record<string, string>)
    if (settings.printActiveTemplate && settings.printActiveTemplate !== 'default' && !BUILT_IN_TEMPLATES.find(t => t.key === settings.printActiveTemplate)) {
      const allData = await getTemplateData()
      allData[settings.printActiveTemplate] = { ...settings }
      await window.api.settings.set('printTemplateData', JSON.stringify(allData))
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const createTemplate = async () => {
    if (!newTemplateName.trim()) return
    const name = newTemplateName.trim()
    const allData = await getTemplateData()
    allData[name] = { ...settings, printActiveTemplate: name }
    await window.api.settings.set('printTemplateData', JSON.stringify(allData))
    await saveCustomTemplates([...customTemplates, name])
    setSettings(prev => ({ ...prev, printActiveTemplate: name }))
    setNewTemplateName(''); setShowNewInput(false)
  }

  const deleteTemplate = async (name: string) => {
    const allData = await getTemplateData()
    delete allData[name]
    await window.api.settings.set('printTemplateData', JSON.stringify(allData))
    await saveCustomTemplates(customTemplates.filter(t => t !== name))
    setSettings(prev => ({ ...prev, printActiveTemplate: 'default' }))
  }

  const update = (key: keyof PrintSettings, val: string) => setSettings(prev => ({ ...prev, [key]: val }))

  const handleUpload = async (type: 'logo' | 'signature' | 'watermark', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      const result = await window.api.printSettings.uploadAsset(type, base64)
      if (result.success && result.data) {
        const key = type === 'logo' ? 'printLogo' : type === 'signature' ? 'printSignature' : 'printWatermark'
        await window.api.printSettings.save({ [key]: result.data.filename })
        await loadSettings()
      }
    }
    reader.readAsDataURL(file); e.target.value = ''
  }

  const handleRemove = async (type: 'logo' | 'signature' | 'watermark') => {
    const key = type === 'logo' ? 'printLogo' : type === 'signature' ? 'printSignature' : 'printWatermark'
    await window.api.printSettings.save({ [key]: '' }); await loadSettings()
  }

  const handlePreview = async () => {
    let logoData = previews.logo || '', sigData = previews.signature || '', wmData = previews.watermark || ''
    const templateShopName = templateShopNames[settings.printActiveTemplate || 'default']
    await printA4Report(
      `<table><thead><tr><th>ردیف</th><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>
      <tr><td>۱</td><td>محصول نمونه</td><td>۲</td><td>۵۰,۰۰۰</td><td>۱۰۰,۰۰۰</td></tr>
      <tr><td>۲</td><td>محصول نمونه ۲</td><td>۱</td><td>۳۰,۰۰۰</td><td>۳۰,۰۰۰</td></tr>
      <tr style="font-weight:bold;background:#e8f0fe"><td colspan="4">جمع کل</td><td>۱۳۰,۰۰۰</td></tr></tbody></table>`,
      settings.printInvoiceTitle,
      { isInvoice: true, shopName: templateShopName, customization: { ...settings, printLogo: logoData, printSignature: sigData, printWatermark: wmData } }
    )
  }

  const Input = ({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
    <div><Label>{label}</Label><input type={type} value={value} onChange={e => onChange(e.target.value)} className={inputClass} style={inputStyle} placeholder={placeholder} /></div>
  )

  const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
    <div><Label>{label}</Label><select value={value} onChange={e => onChange(e.target.value)} className={inputClass} style={inputStyle}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
  )

  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs font-bold" style={{ color: textSecondary }}>{label}</span>
      <button onClick={() => onChange(!value)} className="relative w-10 h-5 rounded-full transition-all" style={{ backgroundColor: value ? primary : isDark ? '#475569' : '#d1d5db' }}>
        <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: value ? '20px' : '2px' }} />
      </button>
    </div>
  )

  const allTemplates = [...BUILT_IN_TEMPLATES, ...customTemplates.map(t => ({ key: t, name: t, color: '#6366f1', border: 'none', align: 'center' }))]

  return (
    <div className="w-full mx-auto">
      {/* Template Selector */}
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          <span className="text-sm font-extrabold" style={{ color: textPrimary }}>قالب چاپ</span>
        </div>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {allTemplates.map(t => {
            const isActive = (settings.printActiveTemplate || 'default') === t.key
            return (
              <button key={t.key} onClick={() => selectTemplate(t.key)}
                className="p-3 rounded-xl text-center transition-all border-2"
                style={{
                  borderColor: isActive ? t.color || primary : 'transparent',
                  backgroundColor: isActive ? (t.color || primary) + '10' : inputBg,
                }}>
                <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center" style={{ backgroundColor: t.color || '#666' }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div className="text-xs font-bold" style={{ color: isActive ? (t.color || primary) : textSecondary }}>{t.name}</div>
                {!BUILT_IN_TEMPLATES.find(b => b.key === t.key) && (
                  <button onClick={(e) => { e.stopPropagation(); deleteTemplate(t.key) }}
                    className="text-[10px] mt-1 px-2 py-0.5 rounded" style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)' }}>حذف</button>
                )}
              </button>
            )
          })}
          {/* New Template Button */}
          <button onClick={() => { if (showNewInput && newTemplateName.trim()) { createTemplate() } else { setShowNewInput(true) } }}
            className="p-3 rounded-xl text-center transition-all border-2 border-dashed"
            style={{ borderColor: cardBorder, backgroundColor: inputBg }}>
            <div className="w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center" style={{ backgroundColor: isDark ? '#334155' : '#e2e8f0' }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={textSecondary} strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div className="text-xs font-bold" style={{ color: textSecondary }}>{showNewInput ? 'ذخیره' : 'قالب جدید'}</div>
          </button>
        </div>
        {showNewInput && (
          <div className="flex gap-2">
            <input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} placeholder="نام قالب جدید..."
              className={inputClass} style={inputStyle} autoFocus onKeyDown={e => { if (e.key === 'Enter') createTemplate(); if (e.key === 'Escape') { setShowNewInput(false); setNewTemplateName('') } }} />
            <button onClick={() => { setShowNewInput(false); setNewTemplateName('') }} className="text-xs px-3 rounded-lg" style={{ color: textSecondary, backgroundColor: inputBg }}>لغو</button>
          </div>
        )}

        {/* Per-template Shop Name */}
        <div className="mt-3 pt-3 flex items-center gap-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
          <div className="flex-1">
            <Label>نام فروشگاه این قالب</Label>
            <div className="text-[10px] mb-1" style={{ color: textSecondary }}>
              هر قالب می‌تواند نام فروشگاه متفاوتی داشته باشد. مثلاً برای فروش آنلاین نام فروشگاه اینترنتی و برای فروش حضوری نام فروشگاه فیزیکی
            </div>
            {editingShopName ? (
              <div className="flex gap-2 items-center">
                <input value={tempShopName} onChange={e => setTempShopName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { setTemplateShopNames(prev => ({ ...prev, [settings.printActiveTemplate || 'default']: tempShopName })); window.api.settings.set('printTemplateShopNames', JSON.stringify({ ...templateShopNames, [settings.printActiveTemplate || 'default']: tempShopName })); setEditingShopName(false) } if (e.key === 'Escape') setEditingShopName(false) }}
                  className={`${inputClass} flex-1`} style={inputStyle} autoFocus placeholder="نام فروشگاه برای این قالب" />
                <button onClick={() => { const key = settings.printActiveTemplate || 'default'; setTemplateShopNames(prev => ({ ...prev, [key]: tempShopName })); window.api.settings.set('printTemplateShopNames', JSON.stringify({ ...templateShopNames, [key]: tempShopName })); setEditingShopName(false) }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>ذخیره</button>
              </div>
            ) : (
              <button onClick={() => { setEditingShopName(true); setTempShopName(templateShopNames[settings.printActiveTemplate || 'default'] || settings.printInvoiceTitle || '') }}
                className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all" style={{ background: inputBg, border: `1px solid ${cardBorder}`, color: textPrimary }}>
                {templateShopNames[settings.printActiveTemplate || 'default'] || 'از نام فروشگاه پیش‌فرض استفاده کن'}
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Split Layout: Settings Left | Quick Preview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT: Settings (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          {/* Images */}
          <Card>
            <div className="grid grid-cols-3 gap-3">
              {[
                { type: 'logo' as const, label: 'لوگو', ref: logoRef, preview: previews.logo },
                { type: 'signature' as const, label: 'امضا', ref: sigRef, preview: previews.signature },
                { type: 'watermark' as const, label: 'واترمارک', ref: wmRef, preview: previews.watermark },
              ].map(img => (
                <div key={img.type}>
                  <Label>{img.label}</Label>
                  <input ref={img.ref} type="file" accept="image/*" className="hidden" onChange={e => handleUpload(img.type, e)} />
                  {img.preview ? (
                    <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: cardBorder }}>
                      <img src={img.preview} className="h-20 w-full object-contain" />
                      <button onClick={() => handleRemove(img.type)} className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: '#ef4444', color: '#fff' }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => img.ref.current?.click()} className="h-20 w-full rounded-lg flex items-center justify-center text-xs" style={{ backgroundColor: inputBg, border: `1px dashed ${cardBorder}`, color: textSecondary }}>بارگذاری</button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Color + Typography */}
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>رنگ اصلی</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={primary} onChange={e => update('printColorScheme', e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border" style={{ borderColor: cardBorder }} />
                  <span className="text-xs font-mono" style={{ color: textSecondary }}>{primary}</span>
                </div>
              </div>
              <Select label="سایز کاغذ" value={settings.printPaperSize} onChange={v => update('printPaperSize', v)}
                options={[{ value: 'A4', label: 'A4' }, { value: 'A5', label: 'A5' }, { value: 'Letter', label: 'Letter' }]} />
              <Select label="فونت چاپ" value={settings.printFontFamily} onChange={v => update('printFontFamily', v)}
                options={[{ value: 'Vazirmatn', label: 'وزیرمتن' }, { value: 'Tahoma', label: 'تاهوما' }, { value: 'Arial', label: 'آریال' }, { value: 'Courier New', label: 'کوریر (تک‌فاصله)' }]} />
              <Select label="اندازه قلم" value={settings.printFontSize} onChange={v => update('printFontSize', v)}
                options={[{ value: '9pt', label: '۹' }, { value: '10pt', label: '۱۰' }, { value: '11pt', label: '۱۱' }, { value: '12pt', label: '۱۲' }, { value: '14pt', label: '۱۴' }]} />
              <Select label="اندازه عنوان" value={settings.printHeaderSize} onChange={v => update('printHeaderSize', v)}
                options={[{ value: '14pt', label: '۱۴' }, { value: '16pt', label: '۱۶' }, { value: '18pt', label: '۱۸' }, { value: '20pt', label: '۲۰' }, { value: '24pt', label: '۲۴' }]} />
              <Select label="فاصله خطوط" value={settings.printLineSpacing} onChange={v => update('printLineSpacing', v)}
                options={[{ value: '1.2', label: 'فشرده' }, { value: '1.5', label: 'عادی' }, { value: '2.0', label: 'باز' }]} />
              <Select label="جهت سربرگ" value={settings.printHeaderAlign} onChange={v => update('printHeaderAlign', v)}
                options={[{ value: 'center', label: 'وسط' }, { value: 'right', label: 'راست' }]} />
            </div>
          </Card>

          {/* Margins */}
          <Card>
            <Label>حاشیه کاغذ (mm)</Label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {[['top', 'بالا'], ['bottom', 'پایین'], ['left', 'چپ'], ['right', 'راست']].map(([dir, label]) => {
                const key = `printMargin${dir.charAt(0).toUpperCase() + dir.slice(1)}` as keyof PrintSettings
                return <div key={dir}><Label>{label}</Label><input type="number" min={5} max={50} value={parseInt(settings[key] || '15')} onChange={e => update(key, e.target.value)} className={inputClass} style={inputStyle} /></div>
              })}
            </div>
          </Card>

          {/* Border */}
          <Card>
            <Label>حاشیه تزئینی</Label>
            <div className="flex gap-2 mt-1">
              {[['none', 'بدون'], ['simple', 'ساده'], ['double', 'دوخط'], ['decorative', 'مُدِل']].map(([val, label]) => (
                <button key={val} onClick={() => update('printBorderStyle', val)} className="flex-1 py-2 rounded-lg text-xs font-bold"
                  style={{ backgroundColor: settings.printBorderStyle === val ? primary : inputBg, color: settings.printBorderStyle === val ? '#fff' : textSecondary }}>{label}</button>
              ))}
            </div>
          </Card>

          {/* Texts */}
          <Card>
            <Label>متن‌های چاپ</Label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <Input label="عنوان فاکتور" value={settings.printInvoiceTitle} onChange={v => update('printInvoiceTitle', v)} placeholder="فاکتور فروش" />
              <Input label="عنوان گزارش" value={settings.printReportTitle} onChange={v => update('printReportTitle', v)} placeholder="گزارش" />
              <Input label="فوتر" value={settings.printFooter} onChange={v => update('printFooter', v)} placeholder="متن پایانی" />
              <Input label="عنوان چاپ مجدد" value={settings.printReprintTitle} onChange={v => update('printReprintTitle', v)} placeholder="چاپ دوباره" />
            </div>
            <div className="mt-3">
              <Label>فیلدهای سربرگ</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[1, 2, 3].map(i => (
                  <input key={i} value={settings[`printHeaderField${i}` as keyof PrintSettings] || ''} onChange={e => update(`printHeaderField${i}` as keyof PrintSettings, e.target.value)}
                    className={inputClass} style={inputStyle} placeholder={`فیلد ${i}`} />
                ))}
              </div>
            </div>
          </Card>

          {/* Toggles */}
          <Card>
            <Toggle label="نمایش امضا در فاکتور" value={settings.printShowSignature === 'true'} onChange={v => update('printShowSignature', String(v))} />
            <Toggle label="نمایش مالیات" value={settings.printShowTax === 'true'} onChange={v => update('printShowTax', String(v))} />
          </Card>
        </div>

        {/* RIGHT: Live Preview (2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <Card className="sticky top-4">
            <Label>پیش‌نمایش</Label>
            {/* The preview simulates a real print on WHITE paper, so it must
                force dark text regardless of the app theme (otherwise text
                inherits the theme color and becomes unreadable in dark mode). */}
            <div className="rounded-lg overflow-hidden mt-2 border" style={{ borderColor: cardBorder, backgroundColor: '#fff', color: '#1a1a1a', transform: 'scale(0.65)', transformOrigin: 'top center' }}>
              <div className="p-4 text-center" style={{ color: '#1a1a1a', borderTop: settings.printBorderStyle === 'simple' ? `3px solid ${primary}` : settings.printBorderStyle === 'double' ? `6px double ${primary}` : settings.printBorderStyle === 'decorative' ? `8px solid ${primary}` : 'none' }}>
                {previews.logo && <img src={previews.logo} className="max-h-8 mx-auto mb-1" alt="" />}
                {settings.printHeaderField1 && <div className="text-[7px] text-gray-400 border-b border-dashed pb-0.5 mb-0.5">{settings.printHeaderField1}</div>}
                {settings.printHeaderField2 && <div className="text-[7px] text-gray-400 border-b border-dashed pb-0.5 mb-0.5">{settings.printHeaderField2}</div>}
                <div className="text-sm font-bold" style={{ color: primary, textAlign: settings.printHeaderAlign as any }}>{settings.printInvoiceTitle}</div>
                <div className="text-[7px] text-gray-500 mt-0.5">تلفن: ۰۲۱-۱۲۳۴۵۶۷۸</div>
                <div className="text-[8px] font-bold border-b-2 pb-1 mb-2 mt-1" style={{ borderColor: primary }}>{settings.printReportTitle}</div>
                <table className="w-full text-[7px]" style={{ borderCollapse: 'collapse' }}>
                  <thead><tr style={{ backgroundColor: '#f0f4f8' }}><th className="p-1 border-b border-gray-300 text-right">کالا</th><th className="p-1 border-b border-gray-300">تعداد</th><th className="p-1 border-b border-gray-300">قیمت</th><th className="p-1 border-b border-gray-300">جمع</th></tr></thead>
                  <tbody>
                    <tr><td className="p-1 border-b border-gray-200">محصول نمونه</td><td className="p-1 border-b border-gray-200 text-center">۲</td><td className="p-1 border-b border-gray-200">۵۰,۰۰۰</td><td className="p-1 border-b border-gray-200">۱۰۰,۰۰۰</td></tr>
                    <tr><td className="p-1 border-b border-gray-200">محصول ۲</td><td className="p-1 border-b border-gray-200 text-center">۱</td><td className="p-1 border-b border-gray-200">۳۰,۰۰۰</td><td className="p-1 border-b border-gray-200">۳۰,۰۰۰</td></tr>
                    <tr><td className="p-1 font-bold" colSpan={3}>جمع کل</td><td className="p-1 font-bold">۱۳۰,۰۰۰</td></tr>
                  </tbody>
                </table>
                {settings.printShowSignature === 'true' && (
                  <div className="flex justify-between text-[7px] mt-4 pt-2 border-t border-gray-300">
                    <div className="w-2/5 text-center"><div className="border-t border-black mt-6 pt-1">محل امضای خریدار</div></div>
                    <div className="w-2/5 text-center">
                      {previews.signature && <img src={previews.signature} className="max-h-5 mx-auto" alt="" />}
                      <div className="border-t border-black mt-6 pt-1">محل امضای فروشنده</div>
                    </div>
                  </div>
                )}
                <div className="text-[6px] text-gray-400 mt-2 border-t border-gray-200 pt-1">{settings.printFooter || `تاریخ چاپ: ${formatDateNow()}`}</div>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <Card>
            <button onClick={handlePreview} className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all mb-2"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 4px 12px ${primary}33` }}>
              پیش‌نمایش و چاپ
            </button>
            <button onClick={handleSave} className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all"
              style={{ background: saved ? 'linear-gradient(135deg, #22c55e, #16a34a)' : `linear-gradient(135deg, ${primary}, ${primary}cc)` }}>
              {saved ? 'ذخیره شد!' : 'ذخیره تنظیمات'}
            </button>
          </Card>
        </div>
      </div>
    </div>
  )
}
