/**
 * BackupSection — simplified backup/restore UI.
 *
 * Three main actions:
 *   1. Backup → save DB to user-chosen location via system save dialog
 *   2. Restore → pick a backup file and restore it
 *   3. Open backup folder → opens the backups/ directory in file explorer
 *
 * Plus: auto-backup toggle, DB reset with confirmation.
 */

import { useState, useEffect } from 'react'
import { useTheme } from '../../hooks/useTheme'
import Dialog, { DialogButton } from '../../components/ui/Dialog'

export default function BackupSection() {
  const { isDark, colors } = useTheme()
  const [loading, setLoading] = useState(false)
  const [autoBackup, setAutoBackup] = useState('true')
  const [backupInterval, setBackupInterval] = useState('daily')

  // DB reset
  const [showResetStep1, setShowResetStep1] = useState(false)
  const [showResetStep2, setShowResetStep2] = useState(false)
  const [backupSaved, setBackupSaved] = useState(false)

  // Restore
  const [showRestore, setShowRestore] = useState(false)
  const [restorePreview, setRestorePreview] = useState<any>(null)
  const [restoreFile, setRestoreFile] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  const cBorder = colors.border.default
  const tPri = colors.text.primary
  const tSec = colors.text.secondary
  const cardBg = colors.bg.primary

  useEffect(() => {
    window.api.settings.get('autoBackupEnabled').then(r => { if (r.success && r.data) setAutoBackup(r.data) })
    window.api.settings.get('autoBackupInterval').then(r => { if (r.success && r.data) setBackupInterval(r.data) })
  }, [])

  // ─── Backup ──────────────────────────────────────
  const handleBackup = async () => {
    setLoading(true)
    const r = await window.api.backup.saveAs()
    setLoading(false)
    if (r.success) alert(`پشتیبان ذخیره شد:\n${r.data}`)
  }

  // ─── Restore ─────────────────────────────────────
  const handleOpenRestore = async () => {
    const r = await window.api.dialog.openBackup()
    if (r.success && r.data) {
      const preview = await window.api.backup.getDetails(r.data)
      setRestoreFile(r.data)
      setRestorePreview(preview.success ? preview.data : null)
      setShowRestore(true)
    }
  }

  const handleRestore = async () => {
    if (!restoreFile) return
    setRestoring(true)
    try {
      const r = await window.api.backup.restore(restoreFile)
      setRestorePreview(null)
      setRestoreFile(null)
      setShowRestore(false)
      if (r.success) { alert('بازیابی موفق — برنامه مجدداً بارگذاری می‌شود'); window.location.reload() }
      else alert(`خطا: ${r.error}`)
    } finally { setRestoring(false) }
  }

  // ─── Open backup folder ──────────────────────────
  const handleOpenFolder = () => { window.api.backup.openFolder() }

  return (
    <div className="space-y-3">
      {/* ─── Main buttons ──────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={handleBackup} disabled={loading}
          className="px-3 py-3 rounded-xl text-xs font-bold text-white flex flex-col items-center gap-1.5"
          style={{ background: 'linear-gradient(135deg, #006194, #007bb9)' }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
          <span>پشتیبان‌گیری</span>
        </button>
        <button onClick={handleOpenRestore}
          className="px-3 py-3 rounded-xl text-xs font-bold text-white flex flex-col items-center gap-1.5"
          style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          <span>بازیابی</span>
        </button>
        <button onClick={handleOpenFolder}
          className="px-3 py-3 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5"
          style={{ backgroundColor: cardBg, border: `1px solid ${cBorder}`, color: tPri }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          <span>پوشه پشتیبان‌ها</span>
        </button>
      </div>

      {/* ─── Auto-backup toggle ──────────────────── */}
      <div className="flex flex-col gap-2 p-3 rounded-xl" style={{ backgroundColor: cardBg, border: `1px solid ${cBorder}` }}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-bold" style={{ color: tPri }}>پشتیبان‌گیری خودکار</span>
            <p className="text-[10px] mt-0.5" style={{ color: tSec }}>در شروع برنامه</p>
          </div>
          <button onClick={async () => { const v = autoBackup === 'true' ? 'false' : 'true'; setAutoBackup(v); await window.api.settings.set('autoBackupEnabled', v) }}
            className="relative w-11 h-6 rounded-full transition-all"
            style={{ backgroundColor: autoBackup === 'true' ? '#22c55e' : colors.toggle.track }}>
            <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: autoBackup === 'true' ? '22px' : '2px' }} />
          </button>
        </div>
        {autoBackup === 'true' && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: tSec }}>فاصله</span>
            <select value={backupInterval} onChange={async (e) => { setBackupInterval(e.target.value); await window.api.settings.set('autoBackupInterval', e.target.value) }}
              className="px-2 py-1 rounded-lg text-xs font-bold outline-none" style={{ backgroundColor: isDark ? '#1e293b' : '#fff', border: `1px solid ${cBorder}`, color: tPri }}>
              <option value="daily">هر روز</option>
              <option value="weekly">هر هفته</option>
              <option value="monthly">هر ماه</option>
            </select>
          </div>
        )}
      </div>

      {/* ─── Demo data ───────────────────────── */}
      <div className="pt-3" style={{ borderTop: `1px solid ${cBorder}` }}>
        <button onClick={async () => {
          setLoading(true)
          const r = await window.api.system.seedDemo()
          setLoading(false)
          if (r.success && r.data?.seeded) { alert('داده‌های آزمایشی بارگذاری شد. برنامه مجدداً بارگذاری می‌شود.'); window.location.reload() }
          else alert(r.data?.message || r.error || 'خطا در بارگذاری داده‌های آزمایشی')
        }} disabled={loading}
          className="w-full px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
          style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg>
          {loading ? 'در حال بارگذاری...' : 'بارگذاری داده‌های آزمایشی'}
        </button>
      </div>

      {/* ─── Delete Database ───────────────────── */}
      <div className="pt-3" style={{ borderTop: `1px solid ${cBorder}` }}>
        <button onClick={() => setShowResetStep1(true)}
          className="w-full px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          حذف کامل دیتابیس و شروع از صفر
        </button>
      </div>

      {/* ─── RESTORE DIALOG ─────────────────────── */}
      {showRestore && (
        <Dialog open={true} onClose={() => { setShowRestore(false); setRestorePreview(null); setRestoreFile(null) }}
          title="بازیابی پشتیبان"
          maxWidth="max-w-sm"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>}
          footer={<>
            <DialogButton variant="ghost" onClick={() => { setShowRestore(false); setRestorePreview(null); setRestoreFile(null) }}>لغو</DialogButton>
            <DialogButton variant="primary" onClick={handleRestore} disabled={restoring}>
              {restoring ? 'در حال بازیابی...' : 'بازیابی'}
            </DialogButton>
          </>}>
          <div className="space-y-3">
            {restorePreview?.version && (
              <div className="rounded-xl p-3" style={{ backgroundColor: cardBg, border: `1px solid ${cBorder}` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold" style={{ color: tSec }}>نسخه پشتیبان</span>
                  <span className="text-xs font-bold" style={{ color: tPri }}>{restorePreview.version}</span>
                </div>
                {restorePreview.timestamp && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold" style={{ color: tSec }}>تاریخ ایجاد</span>
                    <span className="text-xs" style={{ color: tPri }}>{restorePreview.timestamp}</span>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}>
              <p className="text-[10px] font-bold" style={{ color: '#3b82f6' }}>یک نسخه پشتیبان قبل از بازیابی ایجاد خواهد شد</p>
            </div>
          </div>
        </Dialog>
      )}

      {/* ─── DB RESET: Step 1 ────────────────────── */}
      {showResetStep1 && (
        <Dialog open={true} onClose={() => { setShowResetStep1(false); setBackupSaved(false) }}
          title="پشتیبان‌گیری قبل از حذف" maxWidth="max-w-sm"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>}
          footer={<>
            <DialogButton variant="ghost" onClick={() => { setShowResetStep1(false); setBackupSaved(false) }}>لغو</DialogButton>
            {backupSaved ? (
              <DialogButton variant="danger" onClick={() => { setShowResetStep1(false); setBackupSaved(false); setShowResetStep2(true) }}>ادامه حذف</DialogButton>
            ) : (
              <DialogButton variant="primary" onClick={async () => { const r = await window.api.backup.saveAs(); if (r.success) setBackupSaved(true) }}>ذخیره پشتیبان</DialogButton>
            )}
          </>}>
          {!backupSaved ? (
            <div className="text-center">
              <p className="text-sm mb-2" style={{ color: tPri }}>قبل از حذف دیتابیس، یک نسخه پشتیبان ذخیره کنید.</p>
              <p className="text-xs" style={{ color: tSec }}>فایل پشتیبان در مکان دلخواه شما ذخیره خواهد شد.</p>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-2xl mb-2">✓</div>
              <p className="text-sm font-bold" style={{ color: '#22c55e' }}>پشتیبان با موفقیت ذخیره شد</p>
              <p className="text-xs mt-1" style={{ color: tSec }}>اکنون می‌توانید حذف دیتابیس را ادامه دهید.</p>
            </div>
          )}
        </Dialog>
      )}

      {/* ─── DB RESET: Step 2 ────────────────────── */}
      {showResetStep2 && (
        <Dialog open={true} onClose={() => setShowResetStep2(false)}
          title="⚠ حذف کامل دیتابیس" maxWidth="max-w-sm"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
          footer={<>
            <DialogButton variant="ghost" onClick={() => setShowResetStep2(false)}>لغو</DialogButton>
            <DialogButton variant="danger" onClick={async () => {
              const r = await window.api.database.reset()
              if (r.success) window.location.reload()
              else { alert(`خطا: ${r.error}`); setShowResetStep2(false) }
            }}>بله، حذف شود</DialogButton>
          </>}>
          <div className="text-center">
            <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <p className="text-xs font-bold" style={{ color: '#ef4444' }}>تمام اطلاعات حذف خواهد شد:</p>
              <ul className="text-xs mt-1 space-y-0.5" style={{ color: tSec }}>
                <li>• تمام فاکتورها و فروش‌ها</li>
                <li>• تمام کالاها و موجودی</li>
                <li>• تمام مشتریان و تأمین‌کنندگان</li>
                <li>• تمام اسناد حسابداری</li>
                <li>• تمام تنظیمات</li>
              </ul>
            </div>
            <p className="text-xs" style={{ color: tSec }}>برنامه پس از حذف مجدداً راه‌اندازی می‌شود.</p>
          </div>
        </Dialog>
      )}
    </div>
  )
}
