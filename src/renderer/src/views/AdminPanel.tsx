import { useState, useEffect, useCallback } from 'react'
import type { User } from '../../../types'
import { fa } from '../i18n'
import UISettings from './settings/UISettings'
import ShortcutsSettings from './settings/ShortcutsSettings'
import CustomizationSettings from './settings/CustomizationSettings'
import { useHighlight } from '../hooks/useHighlight'
import SmartExportDialog from '../components/print/SmartExportDialog'
import SettingsTab from './settings/SettingsTab'
import RestorePointsView from './RestorePointsView'
import Dialog from '../components/ui/Dialog'
import { useTheme } from '../hooks/useTheme'

const primary = '#006194'

interface Props {
  view?: 'settings' | 'admin'
  initialTab?: string
  highlightId?: string
  onHighlightDone?: () => void
}

export default function AdminPanel({ view = 'admin', initialTab, highlightId, onHighlightDone }: Props) {
  const allTabs: { key: 'users' | 'settings' | 'ui' | 'shortcuts' | 'customization' | 'login' | 'restorePoints'; label: string; icon: string }[] = [
    { key: 'users', label: fa.admin.users, icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
    { key: 'login', label: 'تنظیمات ورود', icon: 'M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3' },
    { key: 'settings', label: fa.admin.settings, icon: 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z' },
    { key: 'ui', label: 'ظاهر برنامه', icon: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 100-6 3 3 0 000 6z' },
    { key: 'shortcuts', label: 'میانبرها', icon: 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3' },
    { key: 'customization', label: 'شخصی\u200cسازی', icon: 'M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z' },
    { key: 'restorePoints', label: 'نقاط بازیابی', icon: 'M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8M3 3v5h5' },
  ]

  const tabs = view === 'settings'
    ? allTabs.filter(t => ['settings', 'ui', 'shortcuts', 'customization', 'restorePoints'].includes(t.key))
    : allTabs.filter(t => ['users', 'login'].includes(t.key))

  const defaultTab = view === 'settings' ? 'settings' : 'users'
  const [tab, setTab] = useState<typeof allTabs[0]['key']>((initialTab as any) || defaultTab)
  const { isDark } = useTheme()
  const [smartExportMode, setSmartExportMode] = useState<'export' | 'import' | null>(null)

  useEffect(() => {
    if (initialTab && allTabs.some(t => t.key === initialTab) && tabs.some(t => t.key === initialTab)) {
      setTab(initialTab as any)
    }
  }, [])

  useHighlight(highlightId, onHighlightDone)

  const handleExport = useCallback(() => setSmartExportMode('export'), [])
  const handleImport = useCallback(() => setSmartExportMode('import'), [])

  const bgColor = isDark ? '#0f172a' : '#f8fafc'
  const textPrimary = isDark ? '#f1f5f9' : '#0f172a'
  const textSecondary = isDark ? '#94a3b8' : '#64748b'
  const btnBg = isDark ? '#334155' : '#f1f5f9'

  return (
    <div className="h-full p-5 overflow-auto w-full" style={{ backgroundColor: bgColor }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${primary}, #007bb9)`, boxShadow: '0 2px 8px rgba(0,97,148,0.25)' }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight" style={{ color: textPrimary }}>{tab === 'users' ? 'مدیریت کاربران' : tab === 'login' ? 'تنظیمات ورود' : tab === 'settings' ? 'تنظیمات فروشگاه' : tab === 'ui' ? 'ظاهر برنامه' : tab === 'shortcuts' ? 'میانبرها' : 'شخصی‌سازی چاپ'}</h2>
          <p className="text-xs font-medium" style={{ color: textSecondary }}>{fa.admin.settings}</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-highlight-id={`tab-${t.key}`}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 flex items-center gap-2 ${highlightId === `tab-${t.key}` ? 'highlight-tab' : ''}`}
            style={{
              background: tab === t.key
                ? `linear-gradient(135deg, ${primary}, #007bb9)`
                : btnBg,
              color: tab === t.key ? '#ffffff' : textSecondary,
              boxShadow: tab === t.key ? '0 4px 12px rgba(0,97,148,0.3)' : 'none',
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      <div className="w-full">
        {tab === 'users' && <UsersTab />}
        {tab === 'login' && <LoginSettingsTab />}
        {tab === 'settings' && <SettingsTab onExport={handleExport} onImport={handleImport} />}
        {tab === 'ui' && <UISettings />}
        {tab === 'shortcuts' && <ShortcutsSettings />}
        {tab === 'customization' && <CustomizationSettings />}
        {tab === 'restorePoints' && <RestorePointsView />}
      </div>

      <SmartExportDialog open={smartExportMode !== null} mode={smartExportMode || 'export'} onClose={() => setSmartExportMode(null)} />
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', pinCode: '', role: 'cashier' })
  const [dialog, setDialog] = useState<string | null>(null)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ name: '', pinCode: '', role: 'cashier' })
  const [newPin, setNewPin] = useState('')
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null)
  const { isDark } = useTheme()

  const load = async () => { const r = await window.api.auth.listUsers(); if (r.success && r.data) setUsers(r.data) }
  useEffect(() => { load() }, [])

  const primary = '#006194'
  const cBg = isDark ? '#1e293b' : '#ffffff'
  const cBorder = isDark ? '#334155' : '#e2e8f0'
  const tPri = isDark ? '#f1f5f9' : '#0f172a'
  const tSec = isDark ? '#94a3b8' : '#64748b'
  const inBg = isDark ? '#0f172a' : '#f8fafc'
  const inStyle = { background: inBg, border: `1px solid ${cBorder}`, color: tPri }
  const ERR = '#ef4444'

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-xs font-bold block mb-1.5" style={{ color: tSec }}>{children}</label>
  )

  const UserCard = ({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
    <div className={`rounded-xl p-4 border ${className}`} style={{ backgroundColor: cBg, borderColor: cBorder, ...style }}>{children}</div>
  )

  const handleSubmit = async () => {
    if (!form.name || form.pinCode.length < 4) return
    await window.api.auth.createUser(form)
    setShowForm(false); setForm({ name: '', pinCode: '', role: 'cashier' }); load()
  }

  const handleEditUser = async () => {
    if (!editUser || !editForm.name.trim()) return
    await window.api.auth.updateUser(editUser.id, editForm)
    setDialog(null); setEditUser(null); load()
  }

  const handleChangePin = async () => {
    if (!editUser || newPin.length < 4) return
    await window.api.auth.updateUser(editUser.id, { pinCode: newPin })
    setDialog(null); setEditUser(null); setNewPin(''); load()
  }

  const handleDeleteUser = async () => {
    if (!confirmDeleteUser) return
    await window.api.auth.deleteUser(confirmDeleteUser.id)
    setConfirmDeleteUser(null); load()
  }

  return (
    <div className="w-full space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <UserCard>
          <div className="text-[10px] font-bold" style={{ color: tSec }}>کل کاربران</div>
          <div className="text-lg font-extrabold mt-1" style={{ color: primary }}>{users.length}</div>
        </UserCard>
        <UserCard>
          <div className="text-[10px] font-bold" style={{ color: tSec }}>مدیران</div>
          <div className="text-lg font-extrabold mt-1" style={{ color: '#f59e0b' }}>{users.filter(u => u.role === 'admin').length}</div>
        </UserCard>
        <UserCard>
          <div className="text-[10px] font-bold" style={{ color: tSec }}>صندوق‌دارها</div>
          <div className="text-lg font-extrabold mt-1" style={{ color: '#22c55e' }}>{users.filter(u => u.role === 'cashier').length}</div>
        </UserCard>
      </div>

      {/* Add User Form */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-extrabold" style={{ color: tPri }}>لیست کاربران</h3>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${primary}, #007bb9)` }}>+ کاربر جدید</button>
      </div>

      {showForm && (
        <UserCard className="border-l-4" style={{ borderLeftColor: primary }}>
          <div className="grid grid-cols-4 gap-3">
            <div><Label>نام</Label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm font-bold outline-none" style={inStyle} autoFocus /></div>
            <div><Label>رمز (حداقل ۴ رقم)</Label><input type="number" value={form.pinCode} onChange={e => setForm(f => ({ ...f, pinCode: e.target.value.replace(/\D/g, '').slice(0, 6) }))} className="w-full px-3 py-2 rounded-lg text-sm font-bold font-mono tracking-widest outline-none" style={inStyle} maxLength={6} inputMode="numeric" /></div>
            <div><Label>نقش</Label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))} className="w-full px-3 py-2 rounded-lg text-sm font-bold outline-none" style={inStyle}>
                <option value="cashier">صندوق‌دار</option>
                <option value="admin">مدیر</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handleSubmit} disabled={!form.name || form.pinCode.length < 4} className="flex-1 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', opacity: (!form.name || form.pinCode.length < 4) ? 0.5 : 1 }}>ایجاد</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: inBg, color: tSec }}>لغو</button>
            </div>
          </div>
        </UserCard>
      )}

      {/* Users Table */}
      <UserCard className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
            <th className="text-right px-4 py-2.5 text-xs font-bold" style={{ color: tSec }}>ID</th>
            <th className="text-right px-4 py-2.5 text-xs font-bold" style={{ color: tSec }}>نام</th>
            <th className="text-right px-4 py-2.5 text-xs font-bold" style={{ color: tSec }}>نقش</th>
            <th className="text-right px-4 py-2.5 text-xs font-bold" style={{ color: tSec }}>تاریخ ایجاد</th>
            <th className="px-4 py-2.5 text-xs font-bold" style={{ color: tSec }}>عملیات</th>
          </tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderTop: `1px solid ${cBorder}` }}>
                <td className="px-4 py-2.5 text-xs font-mono" style={{ color: tSec }}>{u.id}</td>
                <td className="px-4 py-2.5 font-bold" style={{ color: tPri }}>{u.name}</td>
                <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: u.role === 'admin' ? '#f59e0b15' : '#22c55e15', color: u.role === 'admin' ? '#f59e0b' : '#22c55e' }}>{u.role === 'admin' ? 'مدیر' : 'صندوق‌دار'}</span></td>
                <td className="px-4 py-2.5 text-xs" style={{ color: tSec }}>{u.createdAt?.slice(0, 10)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEditUser(u); setEditForm({ name: u.name, pinCode: '', role: u.role }); setDialog('edit') }}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg" style={{ color: primary, backgroundColor: `${primary}15` }}>ویرایش</button>
                    <button onClick={() => { setEditUser(u); setNewPin(''); setDialog('pin') }}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg" style={{ color: '#f59e0b', backgroundColor: '#f59e0b15' }}>تغییر رمز</button>
                    {u.role !== 'admin' && (
                      <button onClick={() => setConfirmDeleteUser(u)}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg" style={{ color: ERR, backgroundColor: `${ERR}15` }}>حذف</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: tSec }}>کاربری یافت نشد</td></tr>}
          </tbody>
        </table>
      </UserCard>

      {/* Edit User Dialog */}
      <Dialog open={dialog === 'edit'} onClose={() => setDialog(null)} title="ویرایش کاربر" maxWidth="max-w-sm"
        icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
        footer={<>
          <button onClick={() => setDialog(null)} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: inBg, color: tSec }}>لغو</button>
          <button onClick={handleEditUser} className="px-5 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>ذخیره</button>
        </>}>
        <div className="mb-3"><Label>نام</Label><input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm font-bold outline-none" style={inStyle} autoFocus /></div>
        <div><Label>نقش {editUser?.role === 'admin' && <span style={{ color: '#f59e0b', fontSize: '10px' }}>(غیرقابل تغییر)</span>}</Label>
          <select value={editForm.role} onChange={e => { if (editUser?.role !== 'admin') setEditForm(f => ({ ...f, role: e.target.value as any })) }} className="w-full px-3 py-2 rounded-lg text-sm font-bold outline-none" disabled={editUser?.role === 'admin'} style={{ ...inStyle, opacity: editUser?.role === 'admin' ? 0.5 : 1 }}>
            <option value="admin">مدیر سیستم</option>
            <option value="manager">مدیر</option>
            <option value="accountant">حسابدار</option>
            <option value="salesperson">فروشنده</option>
            <option value="warehouse">انباردار</option>
            <option value="cashier">صندوق‌دار</option>
            <option value="viewer">مشاهده‌گر</option>
          </select>
        </div>
      </Dialog>

      {/* Change PIN Dialog */}
      <Dialog open={dialog === 'pin'} onClose={() => setDialog(null)} title="تغییر رمز عبور" maxWidth="max-w-xs"
        subtitle={editUser?.name}
        icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>}
        footer={<>
          <button onClick={() => setDialog(null)} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: inBg, color: tSec }}>لغو</button>
          <button onClick={handleChangePin} disabled={newPin.length < 4} className="px-5 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', opacity: newPin.length < 4 ? 0.5 : 1 }}>ذخیره رمز جدید</button>
        </>}>
        <div className="text-center">
          <input type="number" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-40 text-center text-2xl font-bold font-mono tracking-widest px-4 py-3 rounded-xl outline-none"
            style={inStyle} maxLength={6} inputMode="numeric" autoFocus placeholder="----" />
          <p className="text-xs mt-2" style={{ color: tSec }}>حداقل ۴ رقم</p>
        </div>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDeleteUser} onClose={() => setConfirmDeleteUser(null)} title="تأیید حذف کاربر" maxWidth="max-w-xs"
        subtitle={confirmDeleteUser?.name}
        icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
        footer={<>
          <button onClick={() => setConfirmDeleteUser(null)} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: inBg, color: tSec }}>لغو</button>
          <button onClick={handleDeleteUser} className="px-5 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>حذف</button>
        </>}>
        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: tPri }}>آیا از حذف این کاربر اطمینان دارید؟</p>
          <p className="text-xs" style={{ color: tSec }}>این عمل قابل بازگشت نیست</p>
        </div>
      </Dialog>
    </div>
  )
}

function LoginSettingsTab() {
  const [loginMethod, setLoginMethod] = useState<'pin' | 'password' | 'none'>('pin')
  const [showDisableWarning, setShowDisableWarning] = useState(false)
  const [saved, setSaved] = useState(false)
  const { isDark } = useTheme()
  const cBg = isDark ? '#1e293b' : '#ffffff'
  const cBorder = isDark ? '#334155' : '#e2e8f0'
  const tPri = isDark ? '#f1f5f9' : '#0f172a'
  const tSec = isDark ? '#94a3b8' : '#64748b'
  const inBg = isDark ? '#0f172a' : '#f8fafc'

  const LoginCard = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-xl p-4 border" style={{ backgroundColor: cBg, borderColor: cBorder }}>{children}</div>
  )

  useEffect(() => {
    window.api.settings.getAll().then(r => {
      if (r.success && r.data) {
        setLoginMethod((r.data.loginMethod as 'pin' | 'password' | 'none') || 'pin')
      }
    })
  }, [])

  const handleSave = async () => {
    await window.api.settings.set('loginMethod', loginMethod)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const methods = [
    { key: 'pin' as const, label: 'ورود با رمز', desc: 'کاربران با رمز ۴ رقمی وارد می‌شوند', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    { key: 'password' as const, label: 'ورود با رمز عبور', desc: 'کاربران با رمز عبور (متنی) وارد می‌شوند', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-4.586a1 1 0 01.293-.707l5-5a1 1 0 011.414 0L15 10.586' },
    { key: 'none' as const, label: 'بدون رمز', desc: 'ورود بدون نیاز به رمز (فقط برای تست)', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ]

  return (
    <div className="space-y-4">
      <LoginCard>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#f59e0b15' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <h3 className="text-sm font-extrabold" style={{ color: tPri }}>روش ورود</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: tSec }}>روش ورود کاربران به برنامه را انتخاب کنید</p>
        <div className="space-y-2">
          {methods.map(m => (
            <button key={m.key} onClick={() => {
              if (m.key === 'none') { setShowDisableWarning(true); return }
              setLoginMethod(m.key)
            }}
              className="w-full text-right p-3 rounded-xl flex items-center gap-3 transition-all"
              style={{ backgroundColor: loginMethod === m.key ? '#00619410' : inBg, border: `1px solid ${loginMethod === m.key ? '#006194' : cBorder}` }}>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke={loginMethod === m.key ? '#006194' : tSec} strokeWidth="2"><path d={m.icon}/></svg>
              <div className="flex-1">
                <div className="text-sm font-bold" style={{ color: loginMethod === m.key ? '#006194' : tPri }}>{m.label}</div>
                <div className="text-[10px]" style={{ color: tSec }}>{m.desc}</div>
              </div>
              {loginMethod === m.key && <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#006194' }}><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></div>}
            </button>
          ))}
        </div>
      </LoginCard>

      <button onClick={handleSave} className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all"
        style={{ background: saved ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #006194, #007bb9)' }}>
        {saved ? 'ذخیره شد!' : 'ذخیره تنظیمات'}
      </button>

      {/* Disable warning dialog */}
      <Dialog open={showDisableWarning} onClose={() => setShowDisableWarning(false)} title="هشدار امنیتی" maxWidth="max-w-sm"
        icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
        footer={<>
          <button onClick={() => setShowDisableWarning(false)} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: inBg, color: tSec }}>لغو</button>
          <button onClick={() => { setLoginMethod('none'); setShowDisableWarning(false) }} className="px-5 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>فعال کردن بدون رمز</button>
        </>}>
        <p className="text-sm text-center" style={{ color: tPri }}>آیا مطمئن هستید که می‌خواید ورود بدون رمز را فعال کنید؟</p>
        <p className="text-xs text-center mt-2" style={{ color: tSec }}>این کار امنیت سیستم را کاهش می‌دهد. هر کسی بدون رمز به برنامه دسترسی خواهد داشت.</p>
      </Dialog>
    </div>
  )
}
