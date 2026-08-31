import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import { useSuspendStore } from '../store/suspendStore'
import { useSettingsStore } from '../store/settingsStore'
import { t, fa } from '../i18n'
import type { User } from '../../../types'

const colors = {
  primary: '#006194',
  primaryContainer: '#007bb9',
  onPrimary: '#ffffff',
  inversePrimary: '#93ccff',
  secondary: '#006a61',
  secondaryFixed: '#89f5e7',
  outline: '#707881',
  outlineVariant: '#bfc7d2',
  onSurface: '#0d1c2e',
  onSurfaceVariant: '#3f4850',
  surface: '#f8f9ff',
  inverseSurface: '#233144',
  inverseOnSurface: '#eaf1ff',
  surfaceContainerLow: '#eff4ff',
}

function LogoIcon({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <rect width="96" height="96" rx="24" fill={colors.primary} />
      <path d="M28 36l20-16 20 16v28a3 3 0 01-3 3H31a3 3 0 01-3-3V36z" stroke="white" strokeWidth="2.5" fill="none" />
      <path d="M40 67V51h16v16" stroke="white" strokeWidth="2.5" fill="none" />
    </svg>
  )
}

function SmallLogoIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill={colors.primary} />
      <path d="M14 18l10-8 10 8v14a2 2 0 01-2 2H16a2 2 0 01-2-2V18z" stroke="white" strokeWidth="2" fill="none" />
      <path d="M20 34V26h8v8" stroke="white" strokeWidth="2" fill="none" />
    </svg>
  )
}

function AdminIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15v3m-3-6h6m-3-3V6" />
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="12" cy="11" r="2" />
      <path d="M8 21v-1a4 4 0 018 0v1" />
    </svg>
  )
}

function EyeIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function ArrowIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function PersonIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function AccountList({
  users,
  selectedUserId,
  onSelect,
  isDark,
}: {
  users: User[]
  selectedUserId: number | null
  onSelect: (u: User) => void
  isDark: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      {users.map((u) => {
        const isActive = u.id === selectedUserId
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => onSelect(u)}
            className="w-full text-right p-3 rounded-xl transition-all cursor-pointer flex items-center gap-3"
            style={isDark ? {
              background: isActive ? 'rgba(0, 97, 148, 0.2)' : 'rgba(35, 49, 68, 0.6)',
              border: isActive ? '2px solid #93ccff' : '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(12px)',
            } : {
              background: isActive ? colors.surfaceContainerLow : undefined,
              border: isActive ? `2px solid ${colors.primary}` : `1px solid ${colors.outlineVariant}`,
            }}
          >
            <div className="flex-shrink-0">
              {u.role === 'admin' ? (
                <AdminIcon className="w-6 h-6" color={isDark ? (isActive ? colors.inversePrimary : colors.outline) : colors.primary} />
              ) : (
                <PersonIcon className="w-6 h-6" color={isDark ? (isActive ? colors.inversePrimary : colors.outline) : colors.secondary} />
              )}
            </div>
            <div className="flex-1">
              <span
                className="text-[14px] leading-[20px] font-medium block"
                style={{
                  color: isDark ? '#fdfcff' : colors.onSurface,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}
              >
                {u.name}
              </span>
              <span className="text-[12px]" style={{ color: isDark ? '#d5e3fc' : colors.onSurfaceVariant }}>
                {u.role === 'admin' ? fa.admin.admin : fa.admin.cashier}
              </span>
            </div>
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                background: isDark
                  ? (isActive ? colors.secondaryFixed : colors.outline)
                  : (isActive ? colors.primary : colors.outlineVariant),
                opacity: isDark ? (isActive ? 1 : 0.3) : 1,
                boxShadow: isDark && isActive ? '0 0 8px #89f5e7' : 'none',
              }}
            />
          </button>
        )
      })}
    </div>
  )
}

interface LayoutProps {
  users: User[]
  selectedUser: User | null
  error: string
  loading: boolean
  pin: string
  password: string
  showPin: boolean
  loginMethod: 'pin' | 'password' | 'none'
  onSelectUser: (u: User) => void
  onSubmit: (e: React.FormEvent) => void
  setPin: (v: string) => void
  setPassword: (v: string) => void
  setShowPin: (v: boolean) => void
  pinRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  isDark: boolean
}

function UnifiedLayout({ users, selectedUser, error, loading, pin, password, showPin, loginMethod, onSelectUser, onSubmit, setPin, setPassword, setShowPin, pinRefs, isDark }: LayoutProps) {
  const ui = t()

  const brandCardBlur = 'blur(12px)'

  const titleColor = isDark ? colors.inversePrimary : colors.primary
  const subtitleColor = isDark ? '#d5e3fc' : colors.onSurfaceVariant

  const featureBg = isDark ? 'rgba(35, 49, 68, 0.6)' : '#ffffff'
  const featureBorder = isDark ? '1px solid rgba(255, 255, 255, 0.1)' : `1px solid ${colors.outlineVariant}`
  const featureTextPrimary = isDark ? '#fdfcff' : colors.onSurface
  const featureTextSecondary = isDark ? '#d5e3fc' : colors.onSurfaceVariant
  const featureShieldBg = isDark ? 'rgba(0, 97, 148, 0.2)' : 'rgba(0, 97, 148, 0.1)'
  const featureChartBg = isDark ? 'rgba(0, 106, 97, 0.2)' : 'rgba(0, 106, 97, 0.1)'

  const loginCardBg = isDark ? 'rgba(35, 49, 68, 0.6)' : 'rgba(255, 255, 255, 0.8)'
  const loginCardBorder = isDark ? '1px solid rgba(255, 255, 255, 0.1)' : `1px solid ${colors.outlineVariant}`

  const inputBg = isDark ? 'rgba(35, 49, 68, 0.5)' : colors.surfaceContainerLow
  const inputBorder = isDark ? '1px solid rgba(112, 120, 129, 0.3)' : `1px solid ${colors.outlineVariant}`
  const inputText = isDark ? '#fdfcff' : colors.onSurface

  const labelColor = isDark ? '#d5e3fc' : colors.onSurfaceVariant

  const footerBg = isDark ? 'rgba(35, 49, 68, 0.6)' : '#ffffff'
  const footerBorder = isDark ? '1px solid rgba(255,255,255,0.05)' : `1px solid ${colors.outlineVariant}`
  const footerText = isDark ? '#d5e3fc' : colors.onSurfaceVariant

  const handlePinInput = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const digit = e.target.value.replace(/\D/g, '')
    if (digit) {
      const arr = pin.split('')
      arr[index] = digit
      const newVal = arr.join('').slice(0, 4)
      setPin(newVal)
      if (index < 3) pinRefs.current[index + 1]?.focus()
    } else if (e.target.value === '') {
      const arr = pin.split('')
      arr[index] = ''
      const newVal = arr.join('')
      setPin(newVal)
      if (index > 0) pinRefs.current[index - 1]?.focus()
    }
  }

  const handlePinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !(e.target as HTMLInputElement).value && index > 0) {
      pinRefs.current[index - 1]?.focus()
    }
  }

  return (
    <>
      <main className="relative z-10 w-full max-w-[1200px] px-8 grid grid-cols-12 gap-6 items-center">
        <section className="hidden lg:flex col-span-5 flex-col items-start text-right pr-12">
          <div className="mb-6">
            <LogoIcon size={96} />
            <h1 className="text-[32px] leading-[48px] font-bold mt-4 mb-1" style={{ color: titleColor, fontFamily: "'Vazirmatn', sans-serif" }}>
              {ui.app.title}
            </h1>
            <p className="text-[18px] leading-[28px]" style={{ color: subtitleColor }}>
              نرم‌افزار جامع مدیریت فروشگاه و حسابداری
            </p>
          </div>
          <div className="flex flex-col gap-4 w-full">
  {/* Advanced Inventory Management */}
  <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: featureBg, backdropFilter: brandCardBlur, border: featureBorder }}>
    <div className="p-2 rounded-lg" style={{ background: featureShieldBg }}>
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke={isDark ? colors.inversePrimary : colors.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
      </svg>
    </div>
    <div>
      <h3 className="text-[14px] leading-[20px] font-medium" style={{ color: featureTextPrimary, fontFamily: "'Vazirmatn', sans-serif" }}>
        انبارداری پیشرفته
      </h3>
      <p className="text-[12px]" style={{ color: featureTextSecondary }}>
        مدیریت هوشمند موجودی کالا، رهگیری ورود و خروج، هشدار موجودی کم و انبار گردانی خودکار.
      </p>
    </div>
  </div>

  {/* Advanced Sales & Accounting */}
  <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: featureBg, backdropFilter: brandCardBlur, border: featureBorder }}>
    <div className="p-2 rounded-lg" style={{ background: featureChartBg }}>
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke={isDark ? colors.secondaryFixed : colors.secondary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    </div>
    <div>
      <h3 className="text-[14px] leading-[20px] font-medium" style={{ color: featureTextPrimary, fontFamily: "'Vazirmatn', sans-serif" }}>
        فروش و حسابداری پیشرفته
      </h3>
      <p className="text-[12px]" style={{ color: featureTextSecondary }}>
        صدور فاکتور، ثبت تراکنش‌های مالی، گزارش سود و زیان، ترازنامه و مدیریت کامل حساب‌ها.
      </p>
    </div>
  </div>

  {/* Customer Debt Management */}
  <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: featureBg, backdropFilter: brandCardBlur, border: featureBorder }}>
    <div className="p-2 rounded-lg" style={{ background: featureShieldBg }}>
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke={isDark ? colors.inversePrimary : colors.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        <circle cx="12" cy="12" r="4" />
        <path d="M8 12h8" />
      </svg>
    </div>
    <div>
      <h3 className="text-[14px] leading-[20px] font-medium" style={{ color: featureTextPrimary, fontFamily: "'Vazirmatn', sans-serif" }}>
        مدیریت بدهی مشتریان
      </h3>
      <p className="text-[12px]" style={{ color: featureTextSecondary }}>
        ثبت و پیگیری مطالبات، سررسید پرداخت‌ها، اعلان بدهی و گزارش‌های جامع از وضعیت مالی مشتریان.
      </p>
    </div>
  </div>
</div>
        </section>

        <section className="col-span-12 lg:col-span-7 flex justify-center">
          <div className="w-full max-w-[520px] rounded-xl p-8 shadow-2xl" style={{ background: loginCardBg, backdropFilter: brandCardBlur, border: loginCardBorder }}>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-[24px] leading-[36px] font-semibold" style={{ color: titleColor, fontFamily: "'Vazirmatn', sans-serif" }}>
                  خوش آمدید
                </h2>
                <p className="text-[16px] leading-[24px]" style={{ color: subtitleColor }}>
                  جهت ورود به سیستم، حساب کاربری خود را انتخاب کنید.
                </p>
              </div>
              <div className="lg:hidden">
                <SmallLogoIcon size={48} />
              </div>
            </div>

            <div className="mb-6">
              <AccountList users={users} selectedUserId={selectedUser?.id ?? null} onSelect={onSelectUser} isDark={isDark} />
            </div>

            {selectedUser && (
              <form onSubmit={onSubmit} className="space-y-5">
                {/* 'none' mode: simple login button, no credential input needed */}
                {loginMethod !== 'none' ? (<>
                <div className="space-y-2">
                  <label className="text-[14px] leading-[20px] font-medium block pr-1" style={{ color: labelColor, fontFamily: "'Vazirmatn', sans-serif" }}>
                    {loginMethod === 'password' ? 'رمز عبور' : 'رمز ۴ رقمی (PIN)'}
                  </label>
                  {/* Password mode: single text input. PIN mode: 4 individual digit boxes below */}
                  {loginMethod === 'password' ? (
                    <input
                      type={showPin ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="رمز عبور خود را وارد کنید"
                      className="w-full px-4 py-3 rounded-xl text-sm font-bold outline-none transition-all"
                      style={{ background: inputBg, border: inputBorder, color: inputText }}
                      autoFocus
                    />
                  ) : (
                    <div className="flex flex-row-reverse gap-3 justify-center">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <input
                          key={`pin-${i}`}
                          ref={(el) => { pinRefs.current[i] = el }}
                          type={showPin ? 'text' : 'password'}
                          inputMode="numeric"
                          maxLength={1}
                          value={pin[i] || ''}
                          onChange={(e) => handlePinInput(e, i)}
                          onKeyDown={(e) => handlePinKeyDown(e, i)}
                          className="w-14 h-16 text-center text-2xl font-bold rounded-xl outline-none transition-all focus:ring-2"
                          style={{
                            background: inputBg,
                            border: pin[i] ? `2px solid ${colors.primary}` : inputBorder,
                            color: inputText,
                          }}
                          onFocus={(e) => { 
                            e.currentTarget.style.borderColor = colors.primary; 
                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,97,148,0.15)' 
                          }}
                          onBlur={(e) => { 
                            e.currentTarget.style.borderColor = pin[i] ? colors.primary : (isDark ? 'rgba(112,120,129,0.3)' : colors.outlineVariant); 
                            e.currentTarget.style.boxShadow = 'none' 
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex justify-center">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs transition-colors"
                      style={{ color: colors.outline }}
                      onClick={() => setShowPin(!showPin)}
                    >
                      {showPin ? <EyeOffIcon className="w-4 h-4" color={colors.outline} /> : <EyeIcon className="w-4 h-4" color={colors.outline} />}
                      <span>{showPin ? 'مخفی کردن' : 'نمایش'}</span>
                    </button>
                  </div>
                  {loginMethod === 'pin' && (
                    <p className="text-xs text-center" style={{ color: subtitleColor, opacity: 0.7 }}>
                      {fa.auth.defaultPin}
                    </p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-center" style={{ color: '#ff6b6b' }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || (loginMethod === 'pin' ? pin.length < 4 : !password)}
                  className="w-full text-[24px] leading-[36px] font-semibold py-3 rounded-xl transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-3"
                  style={{
                    background: loading || (loginMethod === 'pin' ? pin.length < 4 : !password) ? colors.primaryContainer : colors.primary,
                    color: colors.onPrimary,
                    fontFamily: "'Vazirmatn', sans-serif",
                    boxShadow: '0 4px 16px rgba(0, 97, 148, 0.2)',
                    opacity: loading || (loginMethod === 'pin' ? pin.length < 4 : !password) ? 0.7 : 1,
                    cursor: loading || (loginMethod === 'pin' ? pin.length < 4 : !password) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>ورود به سیستم</span>
                      <ArrowIcon className="w-5 h-5 rotate-180" color={colors.onPrimary} />
                    </>
                  )}
                </button>
                </>) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-[24px] leading-[36px] font-semibold py-3 rounded-xl transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-3"
                  style={{ background: loading ? colors.primaryContainer : colors.primary, color: colors.onPrimary }}>
                  {loading ? <span className="text-sm">...</span> : (
                    <><span>ورود بدون رمز</span><ArrowIcon className="w-5 h-5 rotate-180" color={colors.onPrimary} /></>
                  )}
                </button>
                )}
              </form>
            )}

            {!selectedUser && (
              <p className="text-center text-[12px] mt-2" style={{ color: subtitleColor }}>لطفاً یک حساب کاربری انتخاب کنید</p>
            )}
          </div>
        </section>
      </main>

      <footer className="absolute bottom-0 w-full py-3 px-8 flex justify-between items-center" style={{ background: footerBg, backdropFilter: isDark ? 'blur(12px)' : undefined, borderTop: footerBorder }}>
        <p className="text-[14px] leading-[20px] font-medium opacity-60" style={{ color: footerText, fontFamily: "'Vazirmatn', sans-serif" }}>© تمامی حقوق برای {ui.app.title} محفوظ است</p>
        <div className="flex gap-6">
          <a className="text-[14px] leading-[20px] font-medium hover:underline transition-colors" style={{ color: footerText }} href="#" onClick={(e) => e.preventDefault()}>تماس با پشتیبانی</a>
        </div>
      </footer>
    </>
  )
}

export default function LockScreen() {
  const setUser = useAuthStore((s) => s.setUser)
  const clearCart = useCartStore((s) => s.clearCart)
  const loadSuspendSlots = useSuspendStore((s) => s.loadSlots)
  const theme = useSettingsStore((s) => s.theme)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('') // Used only when loginMethod is 'password'
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Three modes: 'pin' = 4-digit PIN input, 'password' = free-text password, 'none' = no auth required
  const [loginMethod, setLoginMethod] = useState<'pin' | 'password' | 'none'>('pin')
  const ui = t()
  const isDark = theme === 'dark'
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])

  const selectedUser = users.find((u) => u.id === selectedUserId) || null

  useEffect(() => {
    // Fetch user list and login method setting
    window.api.auth.listUsers().then((r) => {
      if (r.success && r.data) setUsers(r.data)
    })
    window.api.settings.get('loginMethod').then((r) => {
      if (r.success && r.data) setLoginMethod((r.data as 'pin' | 'password' | 'none') || 'pin')
    })
  }, [])

  useEffect(() => {
    // Auto-login: when PIN reaches 4 digits (pin mode) or when loginMethod is 'none'
    if (loginMethod === 'none' && selectedUser) {
      handleLogin('')
    } else if (pin.length === 4 && selectedUser) {
      handleLogin(pin)
    }
  }, [pin, selectedUser, loginMethod])

  const handleLogin = async (pw: string) => {
    if (!selectedUser) return
    setLoading(true); setError('')

    // When loginMethod is 'none', skip PIN validation entirely
    if (loginMethod === 'none') {
      clearCart()
      setUser(selectedUser as any)
      const suspendsResult = await window.api.suspend.list(selectedUser.id)
      if (suspendsResult.success && suspendsResult.data) loadSuspendSlots(suspendsResult.data)
      setLoading(false)
      return
    }

    // For 'pin' and 'password' modes, validate against stored hash
    const loginPin = loginMethod === 'pin' && pw.length < 4 ? '0000' : pw
    const result = await window.api.auth.login(loginPin)
    if (result.success && result.data) {
      clearCart(); setUser(result.data)
      const suspendsResult = await window.api.suspend.list(result.data.id)
      if (suspendsResult.success && suspendsResult.data) loadSuspendSlots(suspendsResult.data)
    } else {
      setError(result.error || ui.auth.invalidPin)
      setPin('')
      pinRefs.current[0]?.focus()
      setTimeout(() => setError(''), 2000)
    }
    setLoading(false)
  }

  // Routes login to the correct handler based on auth mode:
  // 'password' mode sends the text password, 'pin'/'none' modes send the 4-digit PIN
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return
    if (loginMethod === 'password') {
      if (!password) return
      handleLogin(password)
    } else {
      if (pin.length < 4) return
      handleLogin(pin)
    }
  }

  const handleSelectUser = (u: User) => {
    setSelectedUserId(u.id)
    setPin('')
    setPassword('')
    setError('')
    if (loginMethod === 'pin') setTimeout(() => pinRefs.current[0]?.focus(), 100)
  }

  return (
    <div
      className="h-screen w-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: isDark ? '#0d1c2e' : colors.surface,
        direction: 'rtl',
      }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-1/2 h-full" style={{ opacity: isDark ? 0.2 : 0.1 }}>
          <div className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full" style={{ background: colors.primary, filter: 'blur(120px)' }} />
        </div>
        <div className="absolute inset-0" style={{
          opacity: isDark ? 1 : 0.5,
          background: isDark
            ? 'radial-gradient(circle at 10% 20%, rgba(0, 97, 148, 0.15) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(0, 106, 97, 0.1) 0%, transparent 40%)'
            : 'radial-gradient(circle at 10% 20%, rgba(0, 97, 148, 0.08) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(0, 106, 97, 0.05) 0%, transparent 40%)'
        }} />
      </div>

      <UnifiedLayout
        users={users}
        selectedUser={selectedUser}
        error={error}
        loading={loading}
        pin={pin}
        password={password}
        showPin={showPin}
        loginMethod={loginMethod}
        onSelectUser={handleSelectUser}
        onSubmit={handleSubmit}
        setPin={setPin}
        setPassword={setPassword}
        setShowPin={setShowPin}
        pinRefs={pinRefs}
        isDark={isDark}
      />
    </div>
  )
}