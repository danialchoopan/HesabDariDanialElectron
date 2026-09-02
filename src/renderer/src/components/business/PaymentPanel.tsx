/**
 * PaymentPanel — payment method selection for the POS.
 *
 * Two modes:
 *   1. SINGLE (default, quick): pick ONE method with a single tap — cash, card
 *      reader, card-to-card, or credit (ledger). Switching methods is one tap,
 *      exactly like the classic POS. Cash shows tendered amount + change.
 *   2. SPLIT (پرداخت ترکیبی): allocate the invoice across several methods
 *      (e.g. part card-to-card + part debt) with a live remaining indicator.
 *
 * When "ledger" is chosen a customer must be selected first.
 */
import { useState, useEffect, useMemo } from 'react'
import { useCartStore } from '../../store/cartStore'
import type { Customer, PaymentMethod, SalePayment } from '../../../../types'
import { fa } from '../../i18n'
import { MoneyIcon, BookIcon, SearchIcon, XIcon } from '../ui/Icons'
import { formatNumberInput, parseFormattedNumber } from '../ui/FormattedPriceInput'
import { paymentMethodLabel, paymentColor, normalizePayments } from '../../utils/payment'

type PayMethod = PaymentMethod

interface Props {
  onPay: (payments: SalePayment[], cashTendered?: number) => void
  selectedCustomer: Customer | null
  onSelectCustomer: (c: Customer | null) => void
  /** Walk-in (manual) buyer name to print on the invoice — editable here. */
  walkInName?: string
  onWalkInNameChange?: (name: string) => void
}

const METHOD_KEYS: PayMethod[] = ['cash', 'card', 'card_to_card', 'ledger']
const icons: Record<PayMethod, JSX.Element> = {
  cash: <MoneyIcon className="w-5 h-5" />,
  card: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
  card_to_card: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10l-3 2 3 2M17 14l3-2-3-2"/><path d="M4 12h8m0 0h8"/></svg>,
  ledger: <BookIcon className="w-5 h-5" />,
}

export default function PaymentPanel({ onPay, selectedCustomer, onSelectCustomer, walkInName, onWalkInNameChange }: Props) {
  const total = useCartStore((s) => s.getSubtotal())
  const [mode, setMode] = useState<'single' | 'split'>('single')
  const [method, setMethod] = useState<PayMethod>('cash')
  const [cashTendered, setCashTendered] = useState('')
  const [splitAmounts, setSplitAmounts] = useState<Record<PayMethod, number>>({ cash: 0, card: 0, card_to_card: 0, ledger: 0 })
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])

  useEffect(() => {
    if (showCustomerSearch) {
      window.api.customers.search(customerQuery).then((r) => { if (r.success && r.data) setCustomers(r.data.slice(0, 3)) })
    }
  }, [showCustomerSearch, customerQuery])

  // Cash defaults to the FULL amount (assume the customer paid exactly), but
  // the cashier can edit it if they need to enter a different tendered amount
  // (e.g. to show change). Keep whatever the cashier typed once they change it.
  useEffect(() => {
    if (method !== 'cash') { setCashTendered(''); return }
    if (total <= 0) { setCashTendered(''); return }
    setCashTendered(prev => {
      const cur = parseFormattedNumber(prev)
      if (cur <= 0) return formatNumberInput(String(total))
      return prev
    })
  }, [method, total])

  // ── Single mode ─────────────────────────────────────────────
  const tendered = parseFormattedNumber(cashTendered)
  const change = method === 'cash' ? Math.max(0, tendered - total) : 0
  const cashOk = method === 'cash' ? tendered > 0 : true
  const ledgerOk = method === 'ledger' ? !!selectedCustomer : true
  const singleReady = cashOk && ledgerOk

  const paySingle = () => {
    if (!singleReady) return
    if (method === 'cash') {
      onPay([{ method: 'cash', amount: total }], tendered)
    } else {
      onPay([{ method, amount: total }])
    }
  }

  // ── Split mode ──────────────────────────────────────────────
  const splitActive = useMemo(() => METHOD_KEYS.filter(m => (splitAmounts[m] || 0) > 0), [splitAmounts])
  const splitAllocated = splitActive.reduce((s, m) => s + (splitAmounts[m] || 0), 0)
  const splitRemaining = Math.max(0, total - splitAllocated)
  const splitReady = splitRemaining === 0 && splitAllocated > 0 && (splitAmounts.ledger === 0 || !!selectedCustomer)

  const setSplit = (m: PayMethod, v: number) => setSplitAmounts(prev => ({ ...prev, [m]: v }))
  const fillSplit = (m: PayMethod) => {
    if (m === 'ledger' && !selectedCustomer) return
    const others = splitActive.filter(x => x !== m).reduce((s, x) => s + (splitAmounts[x] || 0), 0)
    setSplitAmounts(prev => ({ ...prev, [m]: Math.max(0, total - others) }))
  }

  const paySplit = () => {
    if (!splitReady) return
    const payments = normalizePayments(METHOD_KEYS.map(m => ({ method: m, amount: splitAmounts[m] || 0 })), total)
    if (payments.length === 0) return
    onPay(payments)
  }

  const needsLedgerCustomer = (splitAmounts.ledger || 0) > 0 && !selectedCustomer

  return (
    <div className="card space-y-2" style={{ overflowY: 'auto', maxHeight: '50vh' }}>
      <div className="text-center">
        <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{fa.pos.total}</span>
        <div className="text-2xl font-bold text-green-400">{total.toLocaleString('fa-IR')} {fa.common.toman}</div>
      </div>

      {/* Customer */}
      <div>
        <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--text-secondary)' }}>{fa.payment.customer}</label>
        {selectedCustomer ? (
          <div className="flex justify-between items-center rounded-xl p-2" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{selectedCustomer.name}</span>
            <button onClick={() => onSelectCustomer(null)} className="btn-danger" style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '6px' }}>
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button onClick={() => setShowCustomerSearch(true)} className="w-full text-xs font-medium py-1.5 rounded-xl flex items-center justify-center gap-2" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)' }}>
            <SearchIcon className="w-3.5 h-3.5" />
            {fa.payment.selectCustomer}
          </button>
        )}
      </div>

      {!selectedCustomer && (
        <div>
          <label className="text-[10px] font-bold block mb-1" style={{ color: 'var(--text-secondary)' }}>نام مشتری (مشتری گذری)</label>
          <input value={walkInName || ''} onChange={(e) => onWalkInNameChange?.(e.target.value)}
            placeholder="درج نام روی فاکتور — اختیاری" className="input-field text-xs w-full" maxLength={80} />
        </div>
      )}

      {showCustomerSearch && (
        <div className="rounded-xl p-2" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} className="input-field text-xs w-full" placeholder={fa.customer.search} autoFocus />
          <div className="max-h-28 overflow-auto space-y-1 mt-1">
            {customers.map((c) => (
              <button key={c.id} onClick={() => { onSelectCustomer(c); setShowCustomerSearch(false); setCustomerQuery('') }}
                className="w-full text-right px-2 py-1.5 rounded-lg text-xs btn-primary flex justify-between">
                <span className="truncate">{c.name}</span>
                <span className="opacity-70">{c.balance.toLocaleString('fa-IR')}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setShowCustomerSearch(false)} className="btn-danger mt-1 text-[10px]" style={{ padding: '3px 10px' }}>{fa.admin.cancel}</button>
        </div>
      )}

      {/* Mode toggle: simple vs split */}
      <div className="flex gap-1 rounded-xl p-0.5" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        <button onClick={() => setMode('single')} className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all"
          style={{ background: mode === 'single' ? 'linear-gradient(135deg,#006194,#007bb9)' : 'transparent', color: mode === 'single' ? '#fff' : 'var(--text-secondary)' }}>ساده</button>
        <button onClick={() => setMode('split')} className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all"
          style={{ background: mode === 'split' ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'transparent', color: mode === 'split' ? '#fff' : 'var(--text-secondary)' }}>{fa.payment.splitPayment}</button>
      </div>

      {mode === 'single' ? (
        <>
          {/* Method buttons — one tap to switch (classic behaviour) */}
          <div className="grid grid-cols-2 gap-1.5">
            {METHOD_KEYS.map((m) => {
              const on = method === m
              const color = paymentColor(m)
              const disabled = m === 'ledger' && !selectedCustomer
              return (
                <button key={m} onClick={() => { if (disabled) return; setMethod(m); setCashTendered('') }} disabled={disabled}
                  className="rounded-xl py-2 flex flex-col items-center gap-0.5 transition-all"
                  style={{
                    background: on ? color + '22' : 'var(--bg-tertiary)',
                    border: `1.5px solid ${on ? color : 'var(--border-color)'}`,
                    color: on ? color : 'var(--text-secondary)',
                    opacity: disabled ? 0.4 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}>
                  {icons[m]}
                  <span className="text-[9px] font-bold">{paymentMethodLabel(m)}</span>
                </button>
              )
            })}
          </div>

          {method === 'cash' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold" style={{ color: paymentColor('cash') }}>{fa.payment.customerPays}</span>
                <input type="text" inputMode="numeric" value={cashTendered}
                  onChange={(e) => setCashTendered(formatNumberInput(e.target.value))}
                  placeholder={total.toLocaleString('fa-IR')} className="input-field text-lg font-bold text-center flex-1" />
              </div>
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>{fa.payment.change}</span>
                <span className="text-sm font-bold text-yellow-400">{change.toLocaleString('fa-IR')}</span>
              </div>
            </div>
          )}

          {method !== 'cash' && (
            <div className="rounded-xl p-2 text-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {method === 'ledger' ? fa.payment.addToLedger : `${paymentMethodLabel(method)}`}
              </span>
              <div className="text-lg font-bold text-green-400 mt-0.5">{total.toLocaleString('fa-IR')} {fa.common.toman}</div>
            </div>
          )}

          {method === 'ledger' && !selectedCustomer && (
            <p className="text-[10px] font-bold" style={{ color: '#f59e0b' }}>برای پرداخت بدهی ابتدا مشتری را انتخاب کنید</p>
          )}

          <button onClick={paySingle} disabled={!singleReady}
            className="btn btn-success w-full py-3 text-base disabled:opacity-40">{fa.payment.completeSale}</button>
        </>
      ) : (
        <>
          {METHOD_KEYS.map((m) => {
            const color = paymentColor(m)
            const disabled = m === 'ledger' && !selectedCustomer
            return (
              <div key={m} className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold w-20 shrink-0" style={{ color }}>{paymentMethodLabel(m)}</span>
                <input type="text" inputMode="numeric" value={splitAmounts[m] ? formatNumberInput(String(splitAmounts[m])) : ''}
                  onChange={(e) => setSplit(m, parseFormattedNumber(e.target.value))}
                  placeholder="0" disabled={disabled} className="input-field text-xs font-bold text-center flex-1 min-w-0"
                  style={{ opacity: disabled ? 0.4 : 1 }} />
                <button onClick={() => fillSplit(m)} disabled={disabled} className="px-2 py-1 rounded-lg text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: color + '1a', color, opacity: disabled ? 0.4 : 1 }}>{fa.payment.allocate}</button>
              </div>
            )
          })}
          <div className="flex justify-between items-center pt-1" style={{ borderTop: '1px solid var(--border-color)' }}>
            <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>{fa.payment.remaining}</span>
            <span className="text-sm font-bold" style={{ color: splitRemaining > 0 ? '#f59e0b' : 'var(--text-primary)' }}>
              {splitRemaining.toLocaleString('fa-IR')} {fa.common.toman}
            </span>
          </div>
          {needsLedgerCustomer && (
            <p className="text-[10px] font-bold" style={{ color: '#f59e0b' }}>برای بخش بدهی باید مشتری انتخاب شود</p>
          )}
          <button onClick={paySplit} disabled={!splitReady}
            className="btn btn-success w-full py-3 text-base disabled:opacity-40">{fa.payment.completeSale}</button>
        </>
      )}
    </div>
  )
}
