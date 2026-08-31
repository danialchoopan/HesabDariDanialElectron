/** SettingsTab — shop info, tax, smart export/import, and backup settings.
 *  Extracted from AdminPanel to prevent focus loss during parent re-renders.
 *  Helper components (Card, Label, Input) are defined outside to prevent
 *  React from recreating them on each render, which would unmount inputs.
 */

import { useState, useEffect } from 'react'
import { fa } from '../../i18n'
import { setShopName } from '../../utils/a4Print'
import BackupSection from './BackupSection'
import { useTheme } from '../../hooks/useTheme'

const primary = '#006194'

const Card = ({ children, className = '', isDark }: { children: React.ReactNode; className?: string; isDark: boolean }) => (
  <div className={`rounded-xl p-4 border ${className}`} style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }}>{children}</div>
)
const Label = ({ children, isDark }: { children: React.ReactNode; isDark: boolean }) => (
  <label className="text-xs font-bold block mb-1.5" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>{children}</label>
)
const Input = ({ label, value, onChange, placeholder, isDark }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; isDark: boolean }) => (
  <div className="mb-3"><Label isDark={isDark}>{label}</Label><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className="w-full px-3 py-2 rounded-lg text-sm font-bold transition-all outline-none" style={{ background: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, color: isDark ? '#f1f5f9' : '#0f172a' }} /></div>
)

interface Props {
  onExport: () => void
  onImport: () => void
}

export default function SettingsTab({ onExport, onImport }: Props) {
  const [taxRate, setTaxRate] = useState(0)
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [storeName, setStoreName] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [storePhone, setStorePhone] = useState('')
  const [saved, setSaved] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const { isDark } = useTheme()

  const tPri = isDark ? '#f1f5f9' : '#0f172a'
  const tSec = isDark ? '#94a3b8' : '#64748b'

  useEffect(() => {
    window.api.settings.getAll().then((r) => {
      if (r.success && r.data) {
        setTaxRate(parseFloat(r.data.taxRate ?? '0'))
        setTaxEnabled(r.data.taxEnabled === 'true')
        setStoreName(r.data.storeName ?? '')
        setStoreAddress(r.data.storeAddress ?? '')
        setStorePhone(r.data.storePhone ?? '')
      }
    })
    window.api.system.getVersion().then((r) => {
      if (r.success && r.data) setAppVersion(r.data)
    })
  }, [])

  const saveAll = async () => {
    await Promise.all([
      window.api.settings.set('taxRate', String(taxRate)),
      window.api.settings.set('taxEnabled', String(taxEnabled)),
      window.api.settings.set('storeName', storeName),
      window.api.settings.set('storeAddress', storeAddress),
      window.api.settings.set('storePhone', storePhone),
    ])
    setShopName(storeName, storePhone)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Inputs (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          <Card isDark={isDark}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: isDark ? 'rgba(0,97,148,0.2)' : 'rgba(0,97,148,0.08)' }}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <h3 className="font-extrabold text-sm" style={{ color: tPri }}>اطلاعات فروشگاه</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label={fa.admin.storeName} value={storeName} onChange={setStoreName} placeholder="نام فروشگاه" isDark={isDark} />
              <Input label={fa.admin.storePhone} value={storePhone} onChange={setStorePhone} placeholder="021..." isDark={isDark} />
              <div className="col-span-2"><Input label={fa.admin.storeAddress} value={storeAddress} onChange={setStoreAddress} placeholder="آدرس فروشگاه" isDark={isDark} /></div>
            </div>
          </Card>

          <button onClick={saveAll} className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all"
            style={{ background: saved ? 'linear-gradient(135deg, #22c55e, #16a34a)' : `linear-gradient(135deg, ${primary}, #007bb9)`, boxShadow: saved ? '0 4px 12px rgba(34,197,94,0.3)' : `0 4px 12px ${primary}4d` }}>
            {saved ? 'ذخیره شد!' : fa.admin.save}
          </button>

          {/* Version Info */}
          <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>
            <span className="text-xs font-bold" style={{ color: tSec }}>نسخه برنامه</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: `${primary}15`, color: primary }}>v{appVersion || '…'}</span>
          </div>
        </div>

        {/* Left: Tax + Backup + Export (2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <Card isDark={isDark}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-bold" style={{ color: tPri }}>مالیات بر ارزش افزوده</div>
                <div className="text-[10px]" style={{ color: tSec }}>اعمال خودکار در فاکتور</div>
              </div>
              <button onClick={() => setTaxEnabled(!taxEnabled)}
                className="relative w-10 h-5 rounded-full transition-all" style={{ backgroundColor: taxEnabled ? primary : isDark ? '#475569' : '#d1d5db' }}>
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: taxEnabled ? '20px' : '2px' }} />
              </button>
            </div>
            {taxEnabled && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input type="range" min="0" max="30" step="0.5" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value))}
                    className="flex-1 h-2 rounded-lg appearance-none cursor-pointer" style={{ accentColor: primary }} />
                  <span className="text-sm font-bold font-mono min-w-[45px] text-center" style={{ color: primary }}>{taxRate}%</span>
                </div>
                <div className="flex gap-1">
                  {[0, 5, 9, 10, 15].map(v => (
                    <button key={v} onClick={() => setTaxRate(v)} className="flex-1 py-1 rounded-lg text-[10px] font-bold"
                      style={{ background: taxRate === v ? primary : (isDark ? '#0f172a' : '#f8fafc'), color: taxRate === v ? '#fff' : tSec }}>{v}%</button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card isDark={isDark}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#22c55e15' }}>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </div>
              <h3 className="font-extrabold text-xs" style={{ color: tPri }}>خروجی/واردات هوشمند</h3>
            </div>
            <p className="text-[10px] mb-3" style={{ color: tSec }}>انتخاب بخش‌ها + رمزگذاری + اعتبارسنجی</p>
            <div className="flex gap-2">
              <button onClick={onExport} className="flex-1 px-3 py-2 rounded-xl text-[10px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>خروجی</button>
              <button onClick={onImport} className="flex-1 px-3 py-2 rounded-xl text-[10px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>واردات</button>
            </div>
          </Card>

          <Card isDark={isDark}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: isDark ? 'rgba(0,97,148,0.2)' : 'rgba(0,97,148,0.08)' }}>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
              </div>
              <h3 className="font-extrabold text-xs" style={{ color: tPri }}>پشتیبان‌گیری</h3>
            </div>
            <p className="text-[10px] mb-3" style={{ color: tSec }}>کالاها، فاکتورها، مشتریان، تنظیمات</p>
            <BackupSection />
          </Card>
        </div>
      </div>
    </div>
  )
}
