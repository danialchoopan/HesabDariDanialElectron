/**
 * PaymentPanel — payment method selection and split-payment entry for the POS.
 *
 * A customer can settle an invoice with a SINGLE method (cash, card reader,
 * card-to-card, or ledger/debt) or with a COMBINATION — e.g. part card-to-card
 * and part added to the customer's debt. The panel lets you toggle any number
 * of methods, type an amount for each, and shows the remaining amount that must
 * be allocated. The invoice is only ready when the allocated total matches.
 *
 * When "ledger" is toggled, a customer must be chosen first (the remainder is
 * added to their account). Cash amounts may over-tender; the resulting change
 * is shown.
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
  onPay: (payments: SalePayment[]) => void
  selectedCustomer: Customer | null
  onSelectCustomer: (c: Customer | null) => void
}

const METHODS: { key: PayMethod; icon: JSX.Element }[] = [
  { key: 'cash', icon: <MoneyIcon className="w-5 h-5" /> },
  { key: 'card', icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
  { key: 'card_to_card', icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10l-3 2 3 2M17 14l3-2-3-2"/><path d="M4 12h8m0 0h8"/></svg> },
  { key: 'ledger', icon: <BookIcon className="w-5 h-5" /> },
]

export default function PaymentPanel({ onPay, selectedCustomer, onSelectCustomer }: Props) {
  const total = useCartStore((s) => s.getSubtotal())
  const [amounts, setAmounts] = useState<Record<PayMethod, number>>({ cash: 0, card: 0, card_to_card: 0, ledger: 0 })
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])

  useEffect(() => {
    if (showCustomerSearch) {
      window.api.customers.search(customerQuery).then((r) => { if (r.success && r.data) setCustomers(r.data.slice(0, 3)) })
    }
  }, [showCustomerSearch, customerQuery])

  const active = useMemo(() => METHODS.filter(m => (amounts[m.key] || 0) > 0), [amounts])
  const allocated = active.reduce((s, m) => s + (amounts[m.key] || 0), 0)
  const remaining = Math.max(0, total - allocated)
  const ledgerAmount = amounts.ledger || 0

  const setAmount = (m: PayMethod, v: number) => setAmounts(prev => ({ ...prev, [m]: v }))
  const toggleOff = (m: PayMethod) => setAmounts(prev => ({ ...prev, [m]: 0 }))
  const fillRemaining = (m: PayMethod) => {
    if (m === 'ledger' && !selectedCustomer) return
    const otherAllocated = active.filter(a => a.key !== m).reduce((s, x) => s + (amounts[x.key] || 0), 0)
    const rem = Math.max(0, total - otherAllocated)
    setAmounts(prev => ({ ...prev, [m]: rem }))
  }

  const ready = remaining === 0 && allocated > 0 && (ledgerAmount === 0 || !!selectedCustomer)

  const complete = () => {
    if (!ready) return
    const payments = normalizePayments(
      METHODS.map(m => ({ method: m.key, amount: amounts[m.key] || 0 })),
      total,
    )
    if (payments.length === 0) return
    onPay(payments)
  }

  const canUseLedger = !!selectedCustomer

  return (
    <div className="card space-y-2" style={{ overflowY: 'auto', maxHeight: '46vh' }}>
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
        {ledgerAmount > 0 && !selectedCustomer && (
          <p className="text-[10px] mt-1 font-bold" style={{ color: '#f59e0b' }}>برای بخش بدهی باید مشتری انتخاب شود</p>
        )}
      </div>

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

      {/* Method toggles */}
      <div className="grid grid-cols-2 gap-1.5">
        {METHODS.map((m) => {
          const on = (amounts[m.key] || 0) > 0
          const color = paymentColor(m.key)
          const disabled = m.key === 'ledger' && !canUseLedger
          return (
            <button key={m.key} onClick={() => {
              if (on) { toggleOff(m.key); return }
              // First method → pay the full amount (fast single-method flow);
              // adding another method → fill whatever is still remaining.
              if (allocated <= 0) setAmount(m.key, total)
              else if (remaining > 0) setAmount(m.key, remaining)
              else setAmount(m.key, 0)
            }} disabled={disabled}
              className="rounded-xl py-2 flex flex-col items-center gap-0.5 transition-all"
              style={{
                background: on ? color + '22' : 'var(--bg-tertiary)',
                border: `1.5px solid ${on ? color : 'var(--border-color)'}`,
                color: on ? color : 'var(--text-secondary)',
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}>
              {m.icon}
              <span className="text-[9px] font-bold">{paymentMethodLabel(m.key)}</span>
            </button>
          )
        })}
      </div>

      {/* Amounts for active methods */}
      {active.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {active.map((m) => {
            const color = paymentColor(m.key)
            return (
              <div key={m.key} className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold w-16 shrink-0" style={{ color }}>{paymentMethodLabel(m.key)}</span>
                <input type="text" inputMode="numeric" value={amounts[m.key] ? formatNumberInput(String(amounts[m.key])) : ''}
                  onChange={(e) => setAmount(m.key, parseFormattedNumber(e.target.value))}
                  placeholder="0" className="input-field text-xs font-bold text-center flex-1 min-w-0" />
                <button onClick={() => fillRemaining(m.key)} className="px-2 py-1 rounded-lg text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: color + '1a', color }}>{fa.payment.allocate}</button>
                <button onClick={() => toggleOff(m.key)} className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>&times;</button>
              </div>
            )
          })}
          <div className="flex justify-between items-center pt-1" style={{ borderTop: '1px solid var(--border-color)' }}>
            <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>{fa.payment.remaining}</span>
            <span className="text-sm font-bold" style={{ color: remaining > 0 ? '#f59e0b' : 'var(--text-primary)' }}>
              {remaining.toLocaleString('fa-IR')} {fa.common.toman}
            </span>
          </div>
        </div>
      )}

      <button onClick={complete} disabled={!ready}
        className="btn btn-success w-full py-3 text-base disabled:opacity-40">{fa.payment.completeSale}</button>
    </div>
  )
}
