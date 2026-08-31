/**
 * RestorePointsView — point-in-time backup management.
 *
 * Features:
 *   - Create restore points with name/description
 *   - View restore point history
 *   - Verify integrity of each point
 *   - Delete old points
 *   - Auto-cleanup setting (keep last N points, toggle on/off)
 *   - Stats: count, total size
 *   - Preview: version, size, timestamp per restore point
 */

import { useState, useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useAuthStore } from '../store/authStore'
import Dialog, { DialogButton } from '../components/ui/Dialog'

export default function RestorePointsView() {
  const theme = useSettingsStore((s: any) => s.theme)
  const isDark = theme === 'dark'
  const user = useAuthStore((s: any) => s.user)
  const [points, setPoints] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [rpName, setRpName] = useState('')
  const [rpDesc, setRpDesc] = useState('')
  const [showDelete, setShowDelete] = useState<any>(null)
  const [showRestore, setShowRestore] = useState<any>(null)
  const [restoring, setRestoring] = useState(false)
  const [autoCleanup, setAutoCleanup] = useState('false')
  const [keepCount, setKeepCount] = useState(10)

  const tPri = isDark ? '#f1f5f9' : '#0f172a'
  const tSec = isDark ? '#94a3b8' : '#64748b'
  const cardBg = isDark ? '#1e293b' : '#ffffff'
  const cardBorder = isDark ? '#334155' : '#e2e8f0'
  const inputBg = isDark ? '#0f172a' : '#f8fafc'
  const inputStyle = { backgroundColor: inputBg, border: `1px solid ${cardBorder}`, color: tPri }

  const load = async () => {
    const [rpRes, stRes] = await Promise.all([window.api.restorePoints.list(), window.api.restorePoints.getStats()])
    if (rpRes.success && rpRes.data) setPoints(rpRes.data)
    if (stRes.success && stRes.data) setStats(stRes.data)
    const acRes = await window.api.settings.get('autoCleanupRestorePoints')
    if (acRes.success && acRes.data) setAutoCleanup(acRes.data)
    const kcRes = await window.api.settings.get('restorePointKeepCount')
    if (kcRes.success && kcRes.data) setKeepCount(Number(kcRes.data))
  }
  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!rpName.trim()) return
    setLoading(true)
    await window.api.restorePoints.create(rpName, rpDesc, user?.name || 'admin')
    setLoading(false)
    setShowCreate(false); setRpName(''); setRpDesc('')
    await load()
  }
  const [loading, setLoading] = useState(false)

  const handleDelete = async (id: number) => {
    await window.api.restorePoints.delete(id)
    setShowDelete(null)
    await load()
  }

  const handleRestore = async (id: number) => {
    setRestoring(true)
    try {
      const r = await window.api.restorePoints.restore(id)
      setShowRestore(null)
      if (r.success) { alert(`بازیابی موفق:\n${r.data?.message || r.data?.error || 'انجام شد'}`); window.location.reload() }
      else alert(`خطا:\n${r.data?.error || r.error || 'نامشخص'}`)
    } finally { setRestoring(false) }
  }

  const handleAutoCleanup = async () => {
    const v = autoCleanup === 'true' ? 'false' : 'true'
    setAutoCleanup(v)
    await window.api.settings.set('autoCleanupRestorePoints', v)
    if (v === 'true') {
      await window.api.restorePoints.cleanup(keepCount)
      await load()
    }
  }

  const handleKeepCountChange = async (val: number) => {
    setKeepCount(val)
    await window.api.settings.set('restorePointKeepCount', String(val))
  }

  const formatSize = (bytes: number) => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${bytes} B`
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="text-[10px] font-bold" style={{ color: tSec }}>تعداد نقاط بازیابی</div>
            <div className="text-lg font-bold mt-1" style={{ color: '#3b82f6' }}>{stats.count}</div>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="text-[10px] font-bold" style={{ color: tSec }}>حجم کل</div>
            <div className="text-lg font-bold mt-1" style={{ color: '#f59e0b' }}>{formatSize(stats.totalSize)}</div>
          </div>
        </div>
      )}

      {/* Auto-cleanup setting */}
      <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
        <div>
          <span className="text-xs font-bold" style={{ color: tPri }}>پاکسازی خودکار</span>
          <p className="text-[10px]" style={{ color: tSec }}>نگهداری آخرین {keepCount} نقطه بازیابی</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={keepCount} onChange={(e) => handleKeepCountChange(Number(e.target.value))} disabled={autoCleanup !== 'true'}
            className="px-2 py-1 rounded-lg text-xs font-bold outline-none" style={{ backgroundColor: inputBg, border: `1px solid ${cardBorder}`, color: tPri, opacity: autoCleanup !== 'true' ? 0.5 : 1 }}>
            <option value={5}>۵</option><option value={10}>۱۰</option><option value={20}>۲۰</option><option value={50}>۵۰</option>
          </select>
          <button onClick={handleAutoCleanup} className="relative w-11 h-6 rounded-full transition-all"
            style={{ backgroundColor: autoCleanup === 'true' ? '#22c55e' : isDark ? '#475569' : '#d1d5db' }}>
            <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: autoCleanup === 'true' ? '22px' : '2px' }} />
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-xl text-xs font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>+ نقطه بازیابی جدید</button>
      </div>

      {/* Points list */}
      <div className="space-y-2">
        {points.map(rp => (
          <div key={rp.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm" style={{ color: tPri }}>{rp.name}</div>
              <div className="text-[10px]" style={{ color: tSec }}>{rp.description || 'بدون توضیح'} | {formatSize(rp.dbSize)} | {rp.createdBy}</div>
            </div>
            <div className="text-[10px] flex-shrink-0 text-center" style={{ color: tSec }}>{rp.createdAt?.slice(0, 16)}</div>
            <div className="flex gap-1">
              <button onClick={async () => { const r = await window.api.restorePoints.verify(rp.id); alert(r.success && r.data?.valid ? '✓ سالم' : `✗ ${r.data?.error || r.error || 'خطا'}`) }}
                className="px-2 py-1 rounded text-[10px] font-bold" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>بررسی</button>
              <button onClick={() => setShowRestore(rp)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>بازیابی</button>
              <button onClick={() => setShowDelete(rp)} className="px-2 py-1 rounded text-[10px] font-bold" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>حذف</button>
            </div>
          </div>
        ))}
        {points.length === 0 && <p className="text-sm text-center py-8" style={{ color: tSec }}>نقطه بازیابی‌ای وجود ندارد</p>}
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <Dialog open={true} onClose={() => { setShowCreate(false); setRpName(''); setRpDesc('') }} title="نقطه بازیابی جدید" maxWidth="max-w-sm"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>}
          footer={<>
            <DialogButton variant="ghost" onClick={() => { setShowCreate(false); setRpName(''); setRpDesc('') }}>لغو</DialogButton>
            <DialogButton variant="primary" onClick={handleCreate} disabled={loading}>{loading ? 'در حال ایجاد...' : 'ایجاد'}</DialogButton>
          </>}>
          <div className="space-y-3">
            <div><label className="text-xs font-bold block mb-1" style={{ color: tSec }}>نام *</label>
              <input value={rpName} onChange={(e) => setRpName(e.target.value)} className="input-field text-sm w-full" style={inputStyle} placeholder="مثال: قبل از به‌روزرسانی" /></div>
            <div><label className="text-xs font-bold block mb-1" style={{ color: tSec }}>توضیحات</label>
              <textarea value={rpDesc} onChange={(e) => setRpDesc(e.target.value)} className="input-field text-sm w-full" rows={2} style={inputStyle} /></div>
          </div>
        </Dialog>
      )}

      {/* Restore Dialog */}
      {showRestore && (
        <Dialog open={true} onClose={() => setShowRestore(null)} title="بازیابی از نقطه بازیابی" maxWidth="max-w-xs"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>}
          footer={<>
            <DialogButton variant="ghost" onClick={() => setShowRestore(null)}>لغو</DialogButton>
            <DialogButton variant="primary" onClick={() => handleRestore(showRestore.id)} disabled={restoring}>
              {restoring ? 'در حال بازیابی...' : 'بازیابی'}
            </DialogButton>
          </>}>
          <p className="text-sm text-center" style={{ color: tPri }}>بازیابی از "{showRestore.name}"؟</p>
          <p className="text-xs text-center mt-1" style={{ color: tSec }}>دیتابیس فعلی ابتدا به‌صورت خودکار پشتیبان‌گیری می‌شود</p>
        </Dialog>
      )}

      {/* Delete Dialog */}
      {showDelete && (
        <Dialog open={true} onClose={() => setShowDelete(null)} title="حذف نقطه بازیابی" maxWidth="max-w-xs"
          icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>}
          footer={<>
            <DialogButton variant="ghost" onClick={() => setShowDelete(null)}>لغو</DialogButton>
            <DialogButton variant="danger" onClick={() => handleDelete(showDelete.id)}>حذف</DialogButton>
          </>}>
          <p className="text-sm text-center" style={{ color: tPri }}>آیا از حذف "{showDelete.name}" اطمینان دارید؟</p>
          <p className="text-xs text-center mt-1" style={{ color: tSec }}>این عمل قابل بازگشت نیست</p>
        </Dialog>
      )}
    </div>
  )
}
