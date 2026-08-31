/**
 * App — root component and router for the entire application.
 *
 * Handles:
 *   - Auth gate: shows Login screen until user authenticates
 *   - View routing: maps view names to page components (POS, Inventory, Dashboard, etc.)
 *   - Navigation via keyboard shortcuts (global event listener)
 *   - Theme application: applies dark/light class to <html> element
 *   - Settings synchronization: loads shop name, tax rate, print settings on startup
 *   - Setup wizard: first-run detection via system:isFirstRun IPC
 *   - Highlight support: deep-link to specific items (products, customers) via URL-like params
 *
 * View routing is event-based: components dispatch 'navigate' events with view names,
 * and App.tsx handles them by updating currentView state.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from './store/authStore'
import { useSettingsStore } from './store/settingsStore'
import { useShortcutsStore } from './store/shortcutsStore'
import { setLanguage } from './i18n'
import { setShopName, setTaxRate, setPrintCustomization } from './utils/a4Print'
import LockScreen from './views/LockScreen'
import SalesTerminal from './views/SalesTerminal'
import Dashboard from './views/Dashboard'
import AdminPanel from './views/AdminPanel'
import CustomerManagement from './views/CustomerManagement'
import SalesHistory from './views/SalesHistory'
import AddProduct from './views/AddProduct'
import Accounting from './views/Accounting'
import Reports from './views/Reports'
import CrossSellRulesView from './views/CrossSellRules'
import InstallmentsView from './views/InstallmentsView'
import ProformasView from './views/ProformasView'
import ServiceTicketsView from './views/ServiceTicketsView'
import CustomerCreditView from './views/CustomerCreditView'
import AuditLogView from './views/AuditLogView'
import RestorePointsView from './views/RestorePointsView'
import Inventory from './views/Inventory'
import Categories from './views/Categories'
import Help from './views/Help'
import Suppliers from './views/Suppliers'
import BankAccounts from './views/BankAccounts'
import Employees from './views/Employees'
import SetupWizard from './views/SetupWizard'
import Sidebar from './components/layout/Sidebar'
import GlobalSearch from './components/business/GlobalSearch'
import Calculator from './components/business/Calculator'
import PrintPreviewDialog from './components/print/PrintPreviewDialog'

type View = 'pos' | 'dashboard' | 'admin' | 'settings' | 'customers' | 'expenses' | 'sales' | 'addproduct' | 'accounting' | 'inventory' | 'suppliers' | 'help' | 'categories' | 'reports' | 'crossSell' | 'installments' | 'proformas' | 'service' | 'credit' | 'calculator' | 'auditLog' | 'restorePoints' | 'bankAccounts' | 'employees'

const NAV_MAP: Record<string, View> = {
  'nav-pos': 'pos', 'nav-inventory': 'inventory', 'nav-dashboard': 'dashboard',
  'nav-customers': 'customers', 'nav-categories': 'categories', 'nav-accounting': 'accounting',
  'nav-sales': 'sales', 'nav-addproduct': 'addproduct', 'nav-admin': 'admin', 'nav-help': 'help',
}

const VIEW_MAP: Record<string, View> = {
  pos: 'pos', inventory: 'inventory', dashboard: 'dashboard', admin: 'admin',
  sales: 'sales', addproduct: 'addproduct', categories: 'categories',
  customers: 'customers', accounting: 'accounting', help: 'help', suppliers: 'suppliers',
  settings: 'settings',
}

export default function App() {
  const user = useAuthStore((s) => s.user)
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [showCalc, setShowCalc] = useState(false)
  const [navParams, setNavParams] = useState<{ tab?: string; highlightId?: string } | null>(null)
  const { init: initSettings, language, theme, setTheme } = useSettingsStore()
  const { shortcuts, loadFromStorage } = useShortcutsStore()

  useEffect(() => {
    initSettings().then(() => {
      window.api.printSettings.getAll().then((r) => {
        if (r.success && r.data) setPrintCustomization(r.data)
      })
      window.api.settings.getAll().then((r) => {
        if (r.success && r.data?.storeName) setShopName(r.data.storeName, r.data.storePhone || '')
        if (r.success && r.data?.taxRate) setTaxRate(parseFloat(r.data.taxRate) || 0)
      })
    })
    loadFromStorage()
    window.api.system.isFirstRun().then((r) => {
      if (r.success && r.data) setIsFirstRun(r.data.isFirstRun)
    })
  }, [])

  useEffect(() => { setLanguage(language) }, [language])

  useEffect(() => {
    const cleanup = window.api.onNavigate((page) => {
      if (VIEW_MAP[page]) setCurrentView(VIEW_MAP[page])
    })
    return cleanup
  }, [])

  const navigateTo = useCallback((view: View) => setCurrentView(view), [])

  useEffect(() => {
    if (!user) return

    const handler = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      let combo = ''
      if (e.ctrlKey || e.metaKey) combo += 'Ctrl+'
      if (e.shiftKey) combo += 'Shift+'
      if (e.altKey) combo += 'Alt+'
      if (e.key.startsWith('F') && e.key.length <= 3) combo += e.key
      else if (e.key.length === 1) combo += e.key.toUpperCase()
      else combo += e.key

      const match = shortcuts.find(s => {
        if (s.key !== combo) return false
        if (s.view !== 'all' && s.view !== currentView) return false
        if (isInput && !s.key.startsWith('F') && !s.key.startsWith('Ctrl')) return false
        return true
      })

      if (match) {
        e.preventDefault()
        e.stopPropagation()

        if (NAV_MAP[match.id]) {
          navigateTo(NAV_MAP[match.id])
        } else if (match.id === 'global-theme') {
          setTheme(theme === 'dark' ? 'light' : 'dark')
        } else if (match.id === 'global-search') {
          const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="جستجو"]') ||
                              document.querySelector<HTMLInputElement>('.input-field')
          searchInput?.focus()
        }
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [user, shortcuts, currentView, navigateTo, theme, setTheme])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setShowGlobalSearch(true)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault()
        e.stopPropagation()
        setShowCalc(prev => !prev)
        return
      }
      if (e.key === 'Shift') {
        const now = Date.now()
        const last = (window as any).__lastShiftTime || 0
        if (now - last < 500) {
          setShowGlobalSearch(true)
          ;(window as any).__lastShiftTime = 0
        } else {
          ;(window as any).__lastShiftTime = now
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleNavigate = useCallback((view: string, tab?: string, highlightId?: string) => {
    setCurrentView(view as View)
    const effectiveHighlight = highlightId || (tab ? `tab-${tab}` : undefined)
    if (tab || effectiveHighlight) setNavParams({ tab, highlightId: effectiveHighlight })
    else setNavParams(null)
  }, [])

  const clearNavParams = useCallback(() => setNavParams(null), [])

  if (isFirstRun === null) return <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Loading...</div>
  if (isFirstRun) return <SetupWizard onComplete={() => {
    setIsFirstRun(false)
    // Auto-load demo data after first-time setup so the app is ready to
    // explore. Remove this block for production if you don't want demo data
    // seeded for every new installation.
    window.api.system.seedDemo().then(r => { if (r.success && r.data?.seeded) window.location.reload() })
  }} />
  if (!user) return <LockScreen />

  return (
    <div className="h-screen flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Sidebar currentView={currentView} onNavigate={(v) => setCurrentView(v as View)} />
      <div className="flex-1 overflow-hidden">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'pos' && <SalesTerminal />}
        {currentView === 'sales' && <SalesHistory />}
        {currentView === 'addproduct' && <AddProduct />}
        {currentView === 'categories' && <Categories />}
        {currentView === 'inventory' && <Inventory initialTab={navParams?.tab} highlightId={navParams?.highlightId} onHighlightDone={clearNavParams} />}
        {currentView === 'accounting' && <Accounting initialTab={navParams?.tab} highlightId={navParams?.highlightId} onHighlightDone={clearNavParams} />}
        {currentView === 'reports' && <Reports />}
        {currentView === 'crossSell' && <CrossSellRulesView />}
        {currentView === 'installments' && <InstallmentsView />}
        {currentView === 'proformas' && <ProformasView />}
        {currentView === 'service' && <ServiceTicketsView />}
        {currentView === 'credit' && <CustomerCreditView />}
        {currentView === 'calculator' && <div className="h-full p-5 overflow-auto" style={{ background: 'var(--bg-primary, #0f172a)' }}><Calculator docked /></div>}
        {currentView === 'bankAccounts' && <BankAccounts />}
        {currentView === 'employees' && <Employees />}
        {currentView === 'auditLog' && <div className="h-full p-5 overflow-auto" style={{ background: 'var(--bg-primary, #0f172a)' }}><AuditLogView /></div>}
        {currentView === 'restorePoints' && <div className="h-full p-5 overflow-auto" style={{ background: 'var(--bg-primary, #0f172a)' }}><RestorePointsView /></div>}
        {currentView === 'customers' && <CustomerManagement highlightId={navParams?.highlightId} onHighlightDone={clearNavParams} />}
        {currentView === 'suppliers' && <Suppliers />}
        {currentView === 'settings' && <AdminPanel view="settings" initialTab="settings" highlightId={navParams?.highlightId} onHighlightDone={clearNavParams} />}
        {currentView === 'admin' && user.role === 'admin' && <AdminPanel view="admin" initialTab={navParams?.tab || 'users'} highlightId={navParams?.highlightId} onHighlightDone={clearNavParams} />}
        {currentView === 'help' && <Help />}
      </div>
      <GlobalSearch open={showGlobalSearch} onClose={() => setShowGlobalSearch(false)} onNavigate={(view, tab, highlightId) => { handleNavigate(view, tab, highlightId); setShowGlobalSearch(false) }} />
      {showCalc && <Calculator onClose={() => setShowCalc(false)} />}
      <PrintPreviewDialog />
    </div>
  )
}
