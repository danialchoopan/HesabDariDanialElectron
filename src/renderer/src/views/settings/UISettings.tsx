/**
 * UISettings — appearance and accessibility settings panel.
 *
 * Controls:
 *   - Theme: dark/light mode toggle
 *   - Language: Farsi/English switch
 *   - Navigation theme: sidebar color variants
 *   - Font size: slider with custom override
 *   - High contrast: accessibility mode for visually impaired
 *   - Camera scanner toggle: enables barcode/QR scanning in POS and AddProduct
 *   - Navigation customization: reorder, enable/disable nav items, reset defaults
 */

import { useState, useEffect } from 'react'
import { t, setLanguage } from '../../i18n'
import { useSettingsStore, type NavTheme } from '../../store/settingsStore'
import { useTheme } from '../../hooks/useTheme'

const themes: { key: NavTheme; name: string; colors: string[] }[] = [
  { key: 'blue', name: 'آبی', colors: ['#006194', '#007bb9'] },
  { key: 'green', name: 'سبز', colors: ['#16a34a', '#22c55e'] },
  { key: 'purple', name: 'بنفش', colors: ['#7c3aed', '#a855f7'] },
  { key: 'orange', name: 'نارنجی', colors: ['#ea580c', '#f97316'] },
  { key: 'teal', name: 'سبزآبی', colors: ['#0d9488', '#14b8a6'] },
  { key: 'slate', name: 'خاکستری', colors: ['#475569', '#64748b'] },
]

const fontSizes = [
  { key: 'sm', label: 'کوچک', scale: 0.85 },
  { key: 'md', label: 'متوسط', scale: 1 },
  { key: 'md-lg', label: 'متوسط بزرگ', scale: 1.08 },
  { key: 'lg', label: 'بزرگ', scale: 1.15 },
  { key: 'xl', label: 'خیلی بزرگ', scale: 1.3 },
]

export default function UISettings() {
  const { theme, setTheme, language, setLanguage: setLang, navTheme, setNavTheme, fontSize, setFontSize, fontSizeCustom, setFontSizeCustom, highContrast, setHighContrast, showCameraScanner, setShowCameraScanner, abbreviatedPrices, setAbbreviatedPrices, navConfig, setNavConfig, resetNavConfig } = useSettingsStore()
  const { isDark, colors, primary } = useTheme()
  const ui = t()
  const cBg = colors.bg.card
  const cBorder = colors.border.default
  const tPri = colors.text.primary
  const tSec = colors.text.secondary
  const [checkUpdatesOnStart, setCheckUpdatesOnStart] = useState(true)

  // Load the persisted "check updates on start" preference so the toggle reflects it
  useEffect(() => {
    window.api.settings.get('checkUpdatesOnStart').then((r) => {
      if (r.success && r.data) setCheckUpdatesOnStart(r.data !== 'false')
    })
  }, [])

  const moveItem = (index: number, direction: -1 | 1) => {
    const newConfig = [...navConfig]
    const target = index + direction
    if (target < 0 || target >= newConfig.length) return
    const temp = newConfig[index]
    newConfig[index] = newConfig[target]
    newConfig[target] = temp
    setNavConfig(newConfig)
  }

  const toggleItem = (key: string) => {
    setNavConfig(navConfig.map(item => item.key === key ? { ...item, visible: !item.visible } : item))
  }

  const Card = ({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) => (
    <div className={`rounded-xl p-4 border ${className}`} style={{ backgroundColor: cBg, borderColor: cBorder }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${primary}15` }}>
          <div className="w-3 h-3 rounded" style={{ backgroundColor: primary }} />
        </div>
        <h3 className="text-sm font-extrabold" style={{ color: tPri }}>{title}</h3>
      </div>
      {children}
    </div>
  )

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Theme */}
        <Card title={ui.admin.theme}>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setTheme('dark')} className="py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: theme === 'dark' ? `linear-gradient(135deg, ${primary}, ${primary}cc)` : colors.bg.tertiary, color: theme === 'dark' ? '#fff' : tSec, border: `1px solid ${theme === 'dark' ? primary : cBorder}` }}>
              {ui.admin.darkMode}
            </button>
            <button onClick={() => setTheme('light')} className="py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: theme === 'light' ? `linear-gradient(135deg, ${primary}, ${primary}cc)` : colors.bg.tertiary, color: theme === 'light' ? '#fff' : tSec, border: `1px solid ${theme === 'light' ? primary : cBorder}` }}>
              {ui.admin.lightMode}
            </button>
            <button onClick={() => setHighContrast(!highContrast)} className="py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: highContrast ? `linear-gradient(135deg, ${primary}, ${primary}cc)` : colors.bg.tertiary, color: highContrast ? '#fff' : tSec, border: `1px solid ${highContrast ? primary : cBorder}` }}>
              کنتراست
            </button>
          </div>
        </Card>

        {/* Nav Color */}
        <Card title="رنگ اصلی برنامه">
          <div className="grid grid-cols-3 gap-2">
            {themes.map((th) => (
              <button key={th.key} onClick={() => setNavTheme(th.key)}
                className="py-2.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: navTheme === th.key ? `linear-gradient(135deg, ${th.colors[0]}, ${th.colors[1]})` : colors.bg.tertiary, color: navTheme === th.key ? '#fff' : tSec, border: `1px solid ${navTheme === th.key ? th.colors[0] : cBorder}`, transform: navTheme === th.key ? 'scale(1.05)' : 'scale(1)' }}>
                {th.name}
              </button>
            ))}
          </div>
          <div className="mt-3 p-2 rounded-lg" style={{ backgroundColor: colors.bg.tertiary, border: `1px solid ${cBorder}` }}>
            <div className="text-[10px] font-bold mb-1" style={{ color: tSec }}>پیش‌نمایش</div>
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-lg" style={{ backgroundColor: primary }} />
              <div className="w-6 h-6 rounded-lg" style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }} />
              <div className="flex-1 h-6 rounded-lg" style={{ backgroundColor: primary + '20' }} />
            </div>
          </div>
        </Card>

        {/* Language */}
        <Card title={ui.admin.language}>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setLang('fa'); setLanguage('fa') }} className="py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ background: language === 'fa' ? `linear-gradient(135deg, ${primary}, ${primary}cc)` : colors.bg.tertiary, color: language === 'fa' ? '#fff' : tSec, border: `1px solid ${language === 'fa' ? primary : cBorder}` }}>فارسی</button>
            <button onClick={() => { setLang('en'); setLanguage('en') }} className="py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ background: language === 'en' ? `linear-gradient(135deg, ${primary}, ${primary}cc)` : colors.bg.tertiary, color: language === 'en' ? '#fff' : tSec, border: `1px solid ${language === 'en' ? primary : cBorder}` }}>English</button>
          </div>
        </Card>

        {/* Font Size */}
        <Card title="اندازه متن">
          <div className="grid grid-cols-5 gap-1.5 mb-3">
            {fontSizes.map((fs) => (
              <button key={fs.key} onClick={() => setFontSize(fs.key)}
                className="py-2 rounded-lg font-bold text-center transition-all"
                style={{ background: fontSize === fs.key ? `linear-gradient(135deg, ${primary}, ${primary}cc)` : colors.bg.tertiary, color: fontSize === fs.key ? '#fff' : tSec, fontSize: `${fs.scale * 14}px`, border: `1px solid ${fontSize === fs.key ? primary : cBorder}` }}>
                {fs.label}
              </button>
            ))}
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold" style={{ color: tSec }}>دستی</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.bg.tertiary, color: tPri }}>{Math.round(fontSizeCustom * 100)}%</span>
            </div>
            <input type="range" min="0.7" max="1.6" step="0.01" value={fontSizeCustom} onChange={(e) => setFontSizeCustom(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: primary }} />
          </div>
        </Card>

        {/* Camera Scanner */}
        <Card title="اسکنر دوربین">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: tSec }}>فعال‌سازی اسکن بارکد و QR با دوربین</p>
              <p className="text-[10px] mt-0.5" style={{ color: colors.text.muted }}>صفحه فروش + صفحه افزودن کالا</p>
            </div>
            <button onClick={() => setShowCameraScanner(!showCameraScanner)}
              className="relative w-11 h-6 rounded-full transition-all duration-200"
              style={{ backgroundColor: showCameraScanner ? primary : colors.toggle.track }}>
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
                style={{ left: showCameraScanner ? '22px' : '2px' }} />
            </button>
          </div>
        </Card>

        {/* Price Format */}
        <Card title="فرمت قیمت">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: tSec }}>نمایش خلاصه قیمت‌ها</p>
              <p className="text-[10px] mt-0.5" style={{ color: colors.text.muted }}>۵۰ میلیون / ۱.۵ میلیارد به جای اعداد کامل</p>
            </div>
            <button onClick={() => setAbbreviatedPrices(!abbreviatedPrices)}
              className="relative w-11 h-6 rounded-full transition-all duration-200"
              style={{ backgroundColor: abbreviatedPrices ? primary : colors.toggle.track }}>
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
                style={{ left: abbreviatedPrices ? '22px' : '2px' }} />
            </button>
          </div>
        </Card>

        {/* Update Checker */}
        <Card title="بروزرسانی">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: tSec }}>بررسی نسخه جدید هنگام شروع برنامه</p>
              <p className="text-[10px] mt-0.5" style={{ color: colors.text.muted }}>در صورت وجود نسخه جدید در GitHub اطلاع‌رسانی می‌شود</p>
            </div>
            <button onClick={async () => {
              const newVal = !checkUpdatesOnStart
              setCheckUpdatesOnStart(newVal)
              await window.api.settings.set('checkUpdatesOnStart', String(newVal))
            }}
              className="relative w-11 h-6 rounded-full transition-all duration-200"
              style={{ backgroundColor: checkUpdatesOnStart ? primary : colors.toggle.track }}>
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
                style={{ left: checkUpdatesOnStart ? '22px' : '2px' }} />
            </button>
          </div>
        </Card>

        {/* Navigation Customization */}
        <Card title="سفارشی‌سازی منوی ناوبری" className="md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px]" style={{ color: tSec }}>ترتیب و نمایش آیتم‌های منوی سمت راست را تغییر دهید</p>
            <button onClick={resetNavConfig}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
              style={{ backgroundColor: colors.bg.tertiary, color: '#ef4444', border: `1px solid ${cBorder}` }}>
              بازنشانی پیش‌فرض
            </button>
          </div>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
            {navConfig.map((item, index) => (
              <div key={item.key} className="flex items-center gap-2 p-2 rounded-lg transition-all"
                style={{
                  backgroundColor: item.visible ? (colors.bg.tertiary) : (isDark ? '#0a0f1a' : '#f1f5f9'),
                  border: `1px solid ${cBorder}`,
                  opacity: item.visible ? 1 : 0.5,
                }}>
                {/* Up/Down arrows */}
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveItem(index, -1)} disabled={index === 0}
                    className="w-5 h-5 flex items-center justify-center rounded transition-all hover:bg-blue-500/20 disabled:opacity-20"
                    style={{ color: tSec }}>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg>
                  </button>
                  <button onClick={() => moveItem(index, 1)} disabled={index === navConfig.length - 1}
                    className="w-5 h-5 flex items-center justify-center rounded transition-all hover:bg-blue-500/20 disabled:opacity-20"
                    style={{ color: tSec }}>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                  </button>
                </div>
                {/* Label */}
                <span className="flex-1 text-xs font-bold" style={{ color: item.visible ? tPri : tSec }}>{item.label}</span>
                {/* Visibility toggle */}
                <button onClick={() => toggleItem(item.key)}
                  className="relative w-9 h-5 rounded-full transition-all duration-200"
                  style={{ backgroundColor: item.visible ? primary : colors.toggle.track }}>
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
                    style={{ left: item.visible ? '18px' : '2px' }} />
                </button>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  )
}
