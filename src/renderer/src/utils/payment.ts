/**
 * Payment helpers — labels + formatting for payment methods and split payments.
 *
 * A sale can be paid by one method or split across several (cash + card +
 * card-to-card + ledger). `sales.paymentMethod` stores the primary channel,
 * while `sale.payments` carries the exact breakdown. These helpers give the UI
 * a single way to label and render either case.
 */
import { t } from '../i18n'
import type { PaymentMethod, Sale, SalePayment } from '../../../types'

const CHANNELS: PaymentMethod[] = ['cash', 'card', 'card_to_card', 'online', 'ledger']

export function paymentMethodLabel(method: PaymentMethod | string): string {
  const ui = t()
  switch (method) {
    case 'cash': return ui.payment.cash
    case 'card': return ui.payment.card
    case 'card_to_card': return ui.payment.cardToCard
    case 'online': return ui.payment.online
    case 'ledger': return ui.payment.ledger
    default: return String(method)
  }
}

/** Whether a payment method settles through the bank account (card / card-to-card / online). */
export function isBankMethod(method: PaymentMethod | string): boolean {
  return method === 'card' || method === 'card_to_card' || method === 'online'
}

/**
 * Sum a sale's payments by channel. Falls back to sales.paymentMethod for
 * legacy sales that have no split rows.
 */
export function paymentChannels(sale: Sale): { cash: number; bank: number; ledger: number } {
  const result = { cash: 0, bank: 0, ledger: 0 }
  if (sale.payments && sale.payments.length > 0) {
    for (const p of sale.payments) {
      if (p.method === 'cash') result.cash += p.amount
      else if (isBankMethod(p.method)) result.bank += p.amount
      else result.ledger += p.amount
    }
    return result
  }
  if (sale.paymentMethod === 'cash') result.cash = sale.total_amount
  else if (sale.paymentMethod === 'card') result.bank = sale.total_amount
  else result.ledger = sale.total_amount
  return result
}

/** Short display of a payment split list, e.g. "نقدی ۴۰٬۰۰۰ + بدهی ۶۰٬۰۰۰". */
export function formatPaymentList(payments: SalePayment[]): string {
  if (!payments || payments.length === 0) return ''
  return payments.map(p => `${paymentMethodLabel(p.method)} ${p.amount.toLocaleString('fa-IR')}`).join(' + ')
}

/** Short display of how a sale was paid, e.g. "نقدی ۴۰٬۰۰۰ + بدهی ۶۰٬۰۰۰". */
export function formatSalePayments(sale: Sale): string {
  const parts = sale.payments && sale.payments.length > 0 ? sale.payments : []
  if (parts.length === 0) return paymentMethodLabel(sale.paymentMethod)
  return formatPaymentList(parts)
}

/** Colour used for a payment method chip/badge (theme-independent). */
export function paymentColor(method: PaymentMethod | string): string {
  switch (method) {
    case 'cash': return '#22c55e'
    case 'card': return '#3b82f6'
    case 'card_to_card': return '#06b6d4'
    case 'online': return '#8b5cf6'
    case 'ledger': return '#a855f7'
    default: return '#64748b'
  }
}

export const PAYMENT_METHODS: { key: PaymentMethod; label: string; hint: string }[] = CHANNELS.map(m => ({
  key: m,
  label: paymentMethodLabel(m),
  hint: m === 'ledger' ? t().payment.toAccount : t().payment.payNow,
}))

/** Build a payment-split summary that sums exactly to `total` (helper for tests/UI). */
export function normalizePayments(payments: SalePayment[], total: number): SalePayment[] {
  const map = new Map<PaymentMethod, number>()
  for (const p of payments) {
    if (p.amount > 0) map.set(p.method, (map.get(p.method) || 0) + Math.round(p.amount))
  }
  const result = CHANNELS.filter(m => (map.get(m) || 0) > 0).map(m => ({ method: m, amount: map.get(m)! }))
  const sum = result.reduce((s, p) => s + p.amount, 0)
  const diff = Math.round(total) - sum
  if (diff !== 0 && result.length > 0) {
    // Push any leftover onto the largest payment so the split equals the total.
    result.sort((a, b) => b.amount - a.amount)
    result[0].amount += diff
    if (result[0].amount <= 0) result[0].amount = 0
  }
  return result.filter(p => p.amount > 0)
}
