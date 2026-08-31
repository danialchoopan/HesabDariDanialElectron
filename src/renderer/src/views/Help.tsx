/**
 * Help — help screen with feature guide, keyboard shortcuts, version info, and update checker.
 */
import { useState, useEffect } from 'react'
import { useTheme } from '../hooks/useTheme'
import { useShortcutsStore, SHORTCUT_CATEGORIES } from '../store/shortcutsStore'

export default function Help() {
  const { isDark, colors, primary } = useTheme()
  const { shortcuts } = useShortcutsStore()
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState('')

  const tPri = colors.text.primary
  const tSec = colors.text.secondary
  const cardBg = colors.bg.card
  const cardBorder = colors.border.default

  useEffect(() => {
    window.api.system.getVersion().then((r) => {
      if (r.success && r.data) setAppVersion(r.data)
    })
  }, [])

  const checkForUpdate = async () => {
    setCheckingUpdate(true)
    setCheckError(null)
    try {
      const r = await window.api.system.checkUpdate()
      if (r.success && r.data) {
        setUpdateInfo(r.data)
      } else {
        setUpdateInfo(null)
        setCheckError(r.error || 'خطا در بررسی نسخه')
      }
    } catch {
      setUpdateInfo(null)
      setCheckError('خطا در بررسی نسخه')
    }
    setCheckingUpdate(false)
  }

  // Auto-check on mount
  useEffect(() => {
    const autoCheck = async () => {
      try {
        const setting = await window.api.settings.get('checkUpdatesOnStart')
        if (setting.success && setting.data !== 'false') {
          checkForUpdate()
        }
      } catch {}
    }
    autoCheck()
  }, [])

  const sections = [
    {
      title: 'فروش',
      color: '#3b82f6',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></svg>,
      items: [
        'اسکن بارکد با اسکنر USB یا دوربین (Ctrl+B)',
        'جستجوی نامی با تایپ حداقل ۲ حرف',
        'افزودن کالاهای فله‌ای از دکمه‌های سریع',
        'پرداخت نقدی با محاسبه پول خرد',
        'پرداخت کارتی با ورود دستی مبلغ',
        'پرداخت بدهی با انتخاب مشتری',
        'نگه‌داشتن فاکتور حداکثر ۳ فاکتور',
        'بازیابی فاکتور با کلیدهای F5/F6/F7',
        'مرجوعی کالا با تفکیک ضرر و بازگشت',
      ],
    },
    {
      title: 'حسابداری',
      color: '#22c55e',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>,
      items: [
        'دفتر حساب‌ها با ساختار سلسله‌مراتبی',
        'سند حسابداری دوطرفه خودکار',
        'تراز آزمایشی و صورت سود و زیان',
        'ترازنامه و گزارش جریان نقدی',
        'گزارش سنی مطالبات مشتریان',
        'ثبت هزینه‌ها با تصویر رسید',
        'تحلیل و نمودار با تنظیم اندازه متن و رنگ',
      ],
    },
    {
      title: 'انبارداری',
      color: '#f59e0b',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg>,
      items: [
        'مشاهده موجودی با نمودار دسته‌بندی',
        'هشدار کم‌موجودی و تمام‌شده',
        'تامین مجدد کالاها و اصلاح موجودی',
        'گزارش ارزش‌گذاری و کالاهای کندفروش',
        'ورود گروهی با فایل اکسل (.xlsx)',
        'تاریخچه تغییرات با جزئیات فارسی',
      ],
    },
    {
      title: 'مشتریان',
      color: '#a855f7',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
      items: [
        'ایجاد و مدیریت پروفایل مشتریان',
        'شارژ حساب و پرداخت بدهی',
        'مشاهده تاریخچه کامل حساب',
        'گزارش مشتریان برتر و الگوی خرید',
        'مدیریت اعتبار و مسدودی مشتری',
      ],
    },
    {
      title: 'گزارش‌ها',
      color: '#ef4444',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>,
      items: [
        '۶ گزارش پیشرفته فروش',
        'پرفروش‌ها و فروش ساعتی',
        'مقایسه دوره‌ها با تقویم شمسی',
        'مشتریان برتر و سود دسته‌ها',
        'تحلیل الگوی خرید مشتریان',
        'خروجی اکسل از تمام گزارش‌ها',
      ],
    },
    {
      title: 'تأمین‌کنندگان و خرید',
      color: '#14b8a6',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2"><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>,
      items: [
        'ثبت خرید از تأمین‌کنندگان',
        'مدیریت بدهی و پرداخت تأمین‌کننده',
        'برگشت خرید و اصلاح موجودی',
        'دفتر معاملات تأمین‌کنندگان',
      ],
    },
    {
      title: 'خدمات و تعمیرات',
      color: '#f97316',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>,
      items: [
        'ثبت تیکت خدمات و گارانتی',
        'پیگیری وضعیت تعمیر',
        'محاسبه هزینه قطعات و دستمزد',
        'بازگشت به مشتری پس از تکمیل',
      ],
    },
    {
      title: 'حساب‌های بانکی و کارمندان',
      color: '#0ea5e9',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" /></svg>,
      items: [
        'مدیریت حساب‌های بانکی و تراکنش‌ها',
        'پرونده کارمندان و اطلاعات شغلی',
        'پرداخت حقوق با کسر مالیات و بیمه',
        'تاریخچه پرداخت حقوق',
      ],
    },
  ]

  return (
    <div className="h-full p-5 overflow-auto max-w-5xl mx-auto">
      {/* Header + Version */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <svg className="w-7 h-7 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <h2 className="text-xl font-bold" style={{ color: tPri }}>راهنمای استفاده</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded-full font-bold" style={{ backgroundColor: `${primary}15`, color: primary }}>v{updateInfo?.currentVersion || appVersion}</span>
          <button onClick={checkForUpdate} disabled={checkingUpdate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: tSec }}>
            {checkingUpdate ? (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 7l5 5 5-5M12 12v9"/></svg>
            )}
            {checkingUpdate ? 'بررسی...' : 'بروزرسانی'}
          </button>
        </div>
      </div>

      {/* Update Notification */}
      {updateInfo?.hasUpdate && (
        <div className="mb-4 p-4 rounded-xl flex items-center gap-3" style={{ backgroundColor: isDark ? '#1a2e1a' : '#dcfce7', border: `1px solid ${isDark ? '#166534' : '#bbf7d0'}` }}>
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#22c55e' }}>نسخه جدید {updateInfo.latestVersion} موجود است</p>
            <p className="text-[10px]" style={{ color: tSec }}>نسخه فعلی: {updateInfo.currentVersion}</p>
          </div>
          <a href={updateInfo.downloadUrl} target="_blank" rel="noopener noreferrer"
            className="px-4 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
            دانلود
          </a>
          <button onClick={() => setUpdateInfo({ ...updateInfo, hasUpdate: false })}
            className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ backgroundColor: colors.bg.tertiary, color: tSec }}>
            بعداً
          </button>
        </div>
      )}

      {updateInfo && !updateInfo.hasUpdate && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-2" style={{ backgroundColor: colors.bg.tertiary, border: `1px solid ${cardBorder}` }}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span className="text-xs font-bold" style={{ color: '#22c55e' }}>شما از آخرین نسخه استفاده می‌کنید</span>
        </div>
      )}

      {checkError && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-2" style={{ backgroundColor: isDark ? '#2a1a1a' : '#fee2e2', border: `1px solid ${isDark ? '#7f1d1d' : '#fecaca'}` }}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span className="text-xs font-bold" style={{ color: '#ef4444' }}>{checkError}</span>
          <button onClick={checkForUpdate} className="mr-auto px-3 py-1 rounded-lg text-[10px] font-bold" style={{ backgroundColor: colors.bg.tertiary, color: tSec }}>تلاش مجدد</button>
        </div>
      )}

      {/* Feature Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {sections.map((section) => (
          <div key={section.title} className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
            <h3 className="font-bold mb-3 flex items-center gap-2 text-sm" style={{ color: tPri }}>
              {section.icon}
              {section.title}
            </h3>
            <ul className="space-y-1.5">
              {section.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed" style={{ color: tSec }}>
                  <span className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: section.color }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Keyboard Shortcuts */}
      <div className="rounded-2xl border overflow-hidden mb-4" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
        <div className="px-4 py-3 font-bold flex flex-wrap items-center gap-2" style={{ borderBottom: `1px solid ${cardBorder}`, color: tPri }}>
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" ry="2" /><line x1="6" y1="8" x2="6" y2="8" /><line x1="10" y1="8" x2="10" y2="8" /><line x1="14" y1="8" x2="14" y2="8" /><line x1="18" y1="8" x2="18" y2="8" />
          </svg>
          میانبرهای کلیدی
          <span className="text-[10px] font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bg.tertiary, color: tSec }}>
            قابل سفارشی‌سازی در تنظیمات
          </span>
        </div>

        {SHORTCUT_CATEGORIES.map((cat) => {
          const catShortcuts = shortcuts.filter(s => s.category === cat.key)
          if (catShortcuts.length === 0) return null
          return (
            <div key={cat.key}>
              <div className="px-4 py-2 text-xs font-bold" style={{ color: tSec, backgroundColor: colors.bg.primary }}>
                {cat.label}
              </div>
              <div className="divide-y" style={{ borderColor: cardBorder }}>
                {catShortcuts.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <span className="text-sm" style={{ color: tPri }}>{s.label}</span>
                    <kbd className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex-shrink-0"
                      style={{ backgroundColor: colors.bg.primary, color: tSec, border: `1px solid ${cardBorder}`, minWidth: 60, textAlign: 'center' }}>
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tips */}
      <div className="rounded-2xl p-4 border" style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
        <h3 className="font-bold mb-3 flex items-center gap-2 text-sm" style={{ color: tPri }}>
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          نکات مفید
        </h3>
        <ul className="space-y-1.5 text-[11px]" style={{ color: tSec }}>
          <li className="flex items-start gap-2"><span style={{ color: '#22c55e' }}>•</span> برای بازگشت به صفحه قبل ESC را فشار دهید</li>
          <li className="flex items-start gap-2"><span style={{ color: '#22c55e' }}>•</span> کلید Enter در فرم‌ها عمل ذخیره را انجام می‌دهد</li>
          <li className="flex items-start gap-2"><span style={{ color: '#22c55e' }}>•</span> در صفحه فروش، با تایپ نام کالا جستجو کنید</li>
          <li className="flex items-start gap-2"><span style={{ color: '#22c55e' }}>•</span> Ctrl+M ماشین حساب شناور را باز/بسته می‌کند</li>
          <li className="flex items-start gap-2"><span style={{ color: '#22c55e' }}>•</span> F2 در صفحه فروش، نوار جستجو را فعال می‌کند</li>
          <li className="flex items-start gap-2"><span style={{ color: '#22c55e' }}>•</span> برای چاپ گزارش، دکمه چاپ را کلیک کنید</li>
          <li className="flex items-start gap-2"><span style={{ color: '#22c55e' }}>•</span> میانبرها را می‌توانید در بخش تنظیمات → میانبرها سفارشی کنید</li>
        </ul>
      </div>
    </div>
  )
}
