/**
 * Settings Store — manages theme, language, UI preferences, scanner toggle, and nav config.
 *
 * Persists all settings to the database via IPC (settings:set/get).
 * Restores settings from DB on app startup.
 *
 * Settings managed:
 *   - theme: 'dark' | 'light'
 *   - language: 'fa' | 'en'
 *   - navTheme: sidebar appearance
 *   - fontSize / fontSizeCustom: text size control
 *   - highContrast: accessibility mode
 *   - showCameraScanner: enables barcode/QR camera in POS and AddProduct
 *   - navConfig: ordered list of nav items with visibility flags
 */

import { create } from 'zustand'

// ── Theme settings ──────────────────────────────────────────────────────────
export type Theme = 'dark' | 'light'
export type NavTheme = 'blue' | 'green' | 'purple' | 'orange' | 'teal' | 'slate'

// ── Nav configuration ───────────────────────────────────────────────────────
export interface NavConfigItem {
  key: string
  label: string
  visible: boolean
}

/** Default navigation items in display order with Persian labels. */
export const DEFAULT_NAV_CONFIG: NavConfigItem[] = [
  { key: 'dashboard', label: 'داشبورد', visible: true },
  { key: 'pos', label: 'فروش', visible: true },
  { key: 'sales', label: 'فروش‌های اخیر', visible: true },
  { key: 'proformas', label: 'پیش‌فاکتور', visible: true },
  { key: 'addproduct', label: 'افزودن کالا', visible: true },
  { key: 'categories', label: 'دسته‌بندی‌ها', visible: true },
  { key: 'inventory', label: 'انبار', visible: true },
  { key: 'accounting', label: 'حسابداری', visible: true },
  { key: 'reports', label: 'گزارش‌ها', visible: true },
  { key: 'crossSell', label: 'فروش مکمل', visible: true },
  { key: 'service', label: 'تعمیرات', visible: true },
  { key: 'customers', label: 'مشتریان', visible: true },
  { key: 'suppliers', label: 'تأمین\u200cکنندگان', visible: true },
  { key: 'calculator', label: 'ماشین حساب', visible: false },
  { key: 'bankAccounts', label: 'حساب‌های بانکی', visible: true },
  { key: 'employees', label: 'کارمندان', visible: true },
  { key: 'auditLog', label: 'لاگ فعالیت', visible: true },
  { key: 'settings', label: 'تنظیمات', visible: true },
  { key: 'admin', label: 'مدیریت', visible: true },
  { key: 'help', label: 'راهنما', visible: true },
]

const navColors: Record<NavTheme, { dark: string; light: string }> = {
  blue: { dark: '#1e293b', light: '#2563eb' },
  green: { dark: '#0f2922', light: '#16a34a' },
  purple: { dark: '#1e1533', light: '#9333ea' },
  orange: { dark: '#1c1308', light: '#ea580c' },
  teal: { dark: '#0f292a', light: '#0d9488' },
  slate: { dark: '#1e293b', light: '#475569' },
}

export function getNavColors(navTheme: NavTheme, isDark: boolean) {
  const colors = navColors[navTheme] || navColors.blue
  return isDark ? colors.dark : colors.light
}

function mergeNavConfig(saved: NavConfigItem[] | null): NavConfigItem[] {
  if (!saved || saved.length === 0) return [...DEFAULT_NAV_CONFIG]
  const savedMap = new Map(saved.map(i => [i.key, i.visible]))
  const result: NavConfigItem[] = []
  const seen = new Set<string>()
  // Follow DEFAULT order, use saved visibility
  for (const def of DEFAULT_NAV_CONFIG) {
    const visible = savedMap.has(def.key) ? savedMap.get(def.key)! : def.visible
    result.push({ key: def.key, label: def.label, visible })
    seen.add(def.key)
  }
  // Append any saved items not in defaults (future items)
  for (const s of saved) {
    if (!seen.has(s.key)) {
      result.push({ key: s.key, label: s.key, visible: s.visible })
    }
  }
  return result
}

// ── Price format ────────────────────────────────────────────────────────────
interface SettingsState {
  theme: Theme
  language: 'fa' | 'en'
  navTheme: NavTheme
  fontSize: string
  fontSizeCustom: number
  highContrast: boolean
  showCameraScanner: boolean
  abbreviatedPrices: boolean
  navConfig: NavConfigItem[]
  setTheme: (theme: Theme) => void
  setLanguage: (lang: 'fa' | 'en') => void
  setNavTheme: (navTheme: NavTheme) => void
  setFontSize: (size: string) => void
  setFontSizeCustom: (size: number) => void
  setHighContrast: (hc: boolean) => void
  setShowCameraScanner: (v: boolean) => void
  setAbbreviatedPrices: (v: boolean) => void
  setNavConfig: (config: NavConfigItem[]) => void
  resetNavConfig: () => void
  init: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark',
  language: 'fa',
  navTheme: 'blue',
  fontSize: 'md',
  fontSizeCustom: 1,
  highContrast: false,
  showCameraScanner: true,
  abbreviatedPrices: true,
  navConfig: [...DEFAULT_NAV_CONFIG],

  setTheme: (theme) => {
    set({ theme })
    applyTheme(theme)
    window.api.settings.set('theme', theme)
  },

  setLanguage: (language) => {
    set({ language })
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr'
    document.documentElement.lang = language
    window.api.settings.set('language', language)
  },

  setNavTheme: (navTheme) => {
    set({ navTheme })
    window.api.settings.set('navTheme', navTheme)
  },

  setFontSize: (fontSize) => {
    const scaleMap: Record<string, number> = { sm: 0.85, md: 1, 'md-lg': 1.08, lg: 1.15, xl: 1.3 }
    const scale = scaleMap[fontSize] || 1
    set({ fontSize, fontSizeCustom: scale })
    document.documentElement.style.fontSize = `${scale * 16}px`
    window.api.settings.set('fontSize', fontSize)
    window.api.settings.set('fontSizeCustom', String(scale))
  },

  setFontSizeCustom: (scale) => {
    set({ fontSize: 'custom', fontSizeCustom: scale })
    document.documentElement.style.fontSize = `${scale * 16}px`
    window.api.settings.set('fontSize', 'custom')
    window.api.settings.set('fontSizeCustom', String(scale))
  },

  setHighContrast: (highContrast) => {
    set({ highContrast })
    if (highContrast) document.documentElement.classList.add('high-contrast')
    else document.documentElement.classList.remove('high-contrast')
    window.api.settings.set('highContrast', String(highContrast))
  },

  setShowCameraScanner: (showCameraScanner) => {
    set({ showCameraScanner })
    window.api.settings.set('showCameraScanner', String(showCameraScanner))
  },

  setAbbreviatedPrices: (abbreviatedPrices) => {
    set({ abbreviatedPrices })
    window.api.settings.set('abbreviatedPrices', String(abbreviatedPrices))
  },

  setNavConfig: (navConfig) => {
    set({ navConfig })
    window.api.settings.set('navConfig', JSON.stringify(navConfig))
  },

  resetNavConfig: () => {
    const navConfig = [...DEFAULT_NAV_CONFIG]
    set({ navConfig })
    window.api.settings.set('navConfig', JSON.stringify(navConfig))
  },

  init: async () => {
    const result = await window.api.settings.getAll()
    if (result.success && result.data) {
      const VALID_NAV = ['blue', 'green', 'purple', 'orange', 'teal', 'slate']
      // Guard against corrupt/invalid persisted values (would crash useTheme otherwise)
      const theme = result.data.theme === 'light' ? 'light' : 'dark'
      const language = (result.data.language === 'en' ? 'en' : 'fa') as 'fa' | 'en'
      const navTheme = (VALID_NAV.includes(result.data.navTheme) ? result.data.navTheme : 'blue') as NavTheme
      const fontSize = result.data.fontSize || 'md'
      const fontSizeCustom = parseFloat(result.data.fontSizeCustom) || 1
      const highContrast = result.data.highContrast === 'true'
      const showCameraScanner = result.data.showCameraScanner !== 'false'
      const abbreviatedPrices = result.data.abbreviatedPrices !== 'false'
      let navConfig = [...DEFAULT_NAV_CONFIG]
      try {
        if (result.data.navConfig) navConfig = mergeNavConfig(JSON.parse(result.data.navConfig))
      } catch {}
      set({ theme, language, navTheme, fontSize, fontSizeCustom, highContrast, showCameraScanner, abbreviatedPrices, navConfig })
      applyTheme(theme)
      document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr'
      document.documentElement.lang = language
      document.documentElement.style.fontSize = `${fontSizeCustom * 16}px`
      if (highContrast) document.documentElement.classList.add('high-contrast')
    }
  },
}))

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'light') {
    root.classList.remove('dark')
    root.classList.add('light')
  } else {
    root.classList.remove('light')
    root.classList.add('dark')
  }
}
