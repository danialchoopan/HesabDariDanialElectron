/**
 * SalesTerminal (POS) — the main point-of-sale screen.
 *
 * This view handles the complete sales workflow:
 *   1. Product scanning (barcode + webcam)
 *   2. Cart management (add/remove/edit quantities)
 *   3. Payment processing (cash, card, ledger/credit)
 *   4. Sale confirmation with customer info, sale type, date, inventory toggle
 *   5. Receipt printing (thermal + A4)
 *
 * Key features:
 *   - Pre-flight stock check before finalizing sale
 *   - Suspended invoices (3 slots for holding/restoring)
 *   - Sale types: in-person (حضوری) and online (آنلاین)
 *   - Backdated invoices with optional no-inventory-impact mode
 *   - Customer search and selection
 *   - Keyboard shortcuts for fast POS operation
 *
 * The cart state is managed by cartStore (Zustand).
 * Sale data flows through the IPC layer to sales.createSale().
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'
import { useSuspendStore } from '../store/suspendStore'
import { useSettingsStore } from '../store/settingsStore'
import BarcodeInput from '../components/business/BarcodeInput'
import CartTable from '../components/business/CartTable'
import PaymentPanel from '../components/business/PaymentPanel'
import LooseItemsGrid from '../components/business/LooseItemsGrid'
import SuspendedSlots from '../components/business/SuspendedSlots'
import { fa } from '../i18n'
import { showPrint } from '../utils/showPrint'
import WebcamScanner from '../components/business/WebcamScanner'
import ReceiptPrinter from '../components/print/ReceiptPrinter'
import Notification from '../components/layout/Notification'
import { CameraIcon } from '../components/ui/Icons'
import PopularItems from '../components/business/PopularItems'
import { formatJalaliDateTime, getTodayGregorian } from '../utils/jalali'
import ShamsiDateInput from '../components/business/ShamsiDateInput'
import type { Sale, Customer, Product, SalePayment } from "../../../types"
import { formatSalePayments, formatPaymentList, normalizePayments } from '../utils/payment'
import Dialog, { DialogField, DialogInput, DialogTextarea, DialogButton } from '../components/ui/Dialog'
import FormattedPriceInput from '../components/ui/FormattedPriceInput'

const primary = '#006194'
const success = '#22c55e'
const warning = '#f59e0b'

export default function SalesTerminal() {
  const user = useAuthStore((s) => s.user)
  const { items, addItem, clearCart, getSubtotal, lastError, clearError } = useCartStore()
  const slots = useSuspendStore((s) => s.slots)
  const setSlot = useSuspendStore((s) => s.setSlot)
  const clearSlot = useSuspendStore((s) => s.clearSlot)
  const { showCameraScanner } = useSettingsStore()
  const [notification, setNotification] = useState('')
  const [showWebcam, setShowWebcam] = useState(false)
  const [showSuspended, setShowSuspended] = useState(false)
  const [showReceipt, setShowReceipt] = useState<Sale | null>(null)
  const [saleComplete, setSaleComplete] = useState<Sale | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [lastCustomer, setLastCustomer] = useState<Customer | null>(null)
  const [storeSettings, setStoreSettings] = useState({ storeName: '', storeAddress: '', storePhone: '', receiptFooter: '' })
  const [productRefreshKey, setProductRefreshKey] = useState(0)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const [invoiceDesc, setInvoiceDesc] = useState('')
  const [invoiceCustomerName, setInvoiceCustomerName] = useState('')
  const [invoiceNote, setInvoiceNote] = useState('')

  useEffect(() => {
    window.api.settings.getAll().then((r) => {
      if (r.success && r.data) setStoreSettings({ storeName: r.data.storeName ?? '', storeAddress: r.data.storeAddress ?? '', storePhone: r.data.storePhone ?? '', receiptFooter: r.data.receiptFooter ?? '' })
    })
  }, [])

  const showNotif = useCallback((msg: string) => { setNotification(msg); setTimeout(() => setNotification(''), 3000) }, [])

  useEffect(() => {
    const handler = () => setProductRefreshKey((k) => k + 1)
    window.addEventListener('products:refresh', handler)
    return () => window.removeEventListener('products:refresh', handler)
  }, [])

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const result = await window.api.products.getByBarcode(barcode)
    if (result.success && result.data) {
      const product = result.data
      if (product.stock <= 0) { showNotif(`${fa.admin.outOfStock}: ${product.title}`); return }
      const ok = addItem({ productId: product.id, title: product.title, unitPrice: product.sale_price, purchasePrice: product.purchase_price, maxStock: product.stock, imageBase64: product.imageBase64 || "" })
      if (!ok) { showNotif(lastError); clearError(); return }
      showNotif(`${product.title} — ${product.sale_price.toLocaleString('fa-IR')} ${fa.common.toman}`)
    } else { showNotif(`${barcode} — ${fa.common.noData}`) }
    setShowWebcam(false)
  }, [addItem, showNotif, lastError, clearError])

  const handleProductSelect = useCallback((product: Product) => {
    if (product.stock <= 0) { showNotif(`${fa.admin.outOfStock}: ${product.title}`); return }
    const ok = addItem({ productId: product.id, title: product.title, unitPrice: product.sale_price, purchasePrice: product.purchase_price, maxStock: product.stock, imageBase64: product.imageBase64 || "" })
    if (!ok) { showNotif(lastError); clearError(); return }
    showNotif(`${product.title} — ${product.sale_price.toLocaleString('fa-IR')} ${fa.common.toman}`)
  }, [addItem, showNotif, lastError, clearError])

  const [pendingPayment, setPendingPayment] = useState<{ payments: SalePayment[]; saleType: 'in-person' | 'online' } | null>(null)
  const [saleType, setSaleType] = useState<'in-person' | 'online'>('in-person')
  const [saleDate, setSaleDate] = useState('')
  const [affectsInventory, setAffectsInventory] = useState(true)
  // Shipping cost for online orders
  const [shippingCost, setShippingCost] = useState(0)

  // Called by the split PaymentPanel with the full payment allocation.
  const handlePay = useCallback(async (payments: SalePayment[]) => {
    if (items.length === 0) { showNotif(fa.pos.noItems); return }
    const total = getSubtotal()
    const final = normalizePayments(payments, total)
    if (final.length === 0) { showNotif(fa.pos.noItems); return }
    setPendingPayment({ payments: final, saleType })
    setInvoiceDesc('')
    setInvoiceNote('')
  }, [items, getSubtotal, showNotif, saleType])

  // Quick full-payment via keyboard shortcuts (single method).
  const quickPay = useCallback((method: 'cash' | 'card' | 'ledger') => {
    if (items.length === 0) { showNotif(fa.pos.noItems); return }
    if (method === 'ledger' && !selectedCustomer) { showNotif(fa.payment.selectCustomer); return }
    const total = getSubtotal()
    const single: SalePayment = { method: method === 'ledger' ? 'ledger' : method === 'card' ? 'card' : 'cash', amount: total }
    handlePay([single])
  }, [items, getSubtotal, showNotif, selectedCustomer, handlePay])

  const confirmSale = useCallback(async () => {
    if (!pendingPayment || items.length === 0) return
    const { payments } = pendingPayment
    const total = getSubtotal()

    for (const item of items) {
      const currentProduct = await window.api.products.getById(item.productId)
      if (currentProduct.success && currentProduct.data) {
        const currentStock = currentProduct.data.stock
        if (currentStock < item.quantity) {
          showNotif(`${item.title}: موجودی فعلی ${currentStock} است. نمی‌توان ${item.quantity} عدد فروخت.`)
          setPendingPayment(null)
          return
        }
      }
    }

    // Primary channel for sales.paymentMethod (backwards compatible summary).
    const cashBank = payments.filter(p => p.method !== 'ledger').reduce((s, p) => s + p.amount, 0)
    const hasLedger = payments.some(p => p.method === 'ledger')
    const cashOnly = payments.every(p => p.method === 'cash')
    const bankOnly = payments.every(p => p.method === 'card' || p.method === 'card_to_card')
    const primary: 'cash' | 'card' | 'ledger' = hasLedger && cashBank === 0 ? 'ledger' : bankOnly ? 'card' : cashOnly ? 'cash' : cashBank >= (total - cashBank) ? 'cash' : 'card'

    const customerName = invoiceCustomerName.trim() || selectedCustomer?.name || ''
    const result = await window.api.sales.create({
      userId: user!.id,
      items: items.map((i) => ({ productId: i.productId, productTitle: i.title, quantity: i.quantity, unitPrice: i.unitPrice, purchasePrice: i.purchasePrice })),
      paymentMethod: primary,
      payments,
      customerId: selectedCustomer?.id,
      customerPaid: cashBank,
      description: invoiceDesc,
      invoiceDescription: invoiceNote,
      manualCustomerName: customerName,
      saleType: pendingPayment.saleType,
      saleDate: saleDate || undefined,
      affectsInventory,
      shippingCost,
    })
    if (result.success && result.data) {
      const saleData = { ...result.data, customerName }
      setLastCustomer(selectedCustomer)
      setSaleComplete(saleData)
      clearCart()
      setSelectedCustomer(null)
      setInvoiceCustomerName('')
      setPendingPayment(null)
      setSaleDate('')
      setShippingCost(0) // reset after sale
      setAffectsInventory(true)
      barcodeRef.current?.focus()
    } else { showNotif(`${result.error}`) }
    setPendingPayment(null)
  }, [pendingPayment, items, user, selectedCustomer, lastCustomer, clearCart, showNotif, invoiceCustomerName, invoiceDesc, invoiceNote, getSubtotal])

  const handleSuspend = useCallback(async (slotIndex?: number) => {
    if (items.length === 0) { showNotif(fa.pos.nothingToHold); return }
    const targetSlot = slotIndex ?? slots.findIndex((s) => s.items.length === 0)
    if (targetSlot === -1 || targetSlot >= 3) { showNotif(fa.pos.allSlotsFull); return }
    const result = await window.api.suspend.save(user!.id, targetSlot, items)
    if (result.success && result.data) { setSlot(targetSlot, result.data.id, items); clearCart(); showNotif(`${fa.pos.holdInvoice} ${fa.pos.slot} ${targetSlot + 1}`); barcodeRef.current?.focus() }
  }, [items, user, slots, setSlot, clearCart, showNotif])

  const handleResume = useCallback(async (slotIndex: number) => {
    const slot = slots[slotIndex]
    if (!slot || !slot.id || slot.items.length === 0) { showNotif(fa.pos.emptySlot); return }
    const result = await window.api.suspend.load(slot.id)
    if (result.success && result.data) { clearCart(); for (const item of result.data.items) addItem(item); clearSlot(slotIndex); showNotif(`${fa.pos.resumeFrom} ${fa.pos.slot} ${slotIndex + 1}`); barcodeRef.current?.focus() }
  }, [slots, clearCart, addItem, clearSlot, showNotif])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowSuspended(false); setShowWebcam(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent).detail
      if (action === 'pos:hold') handleSuspend()
      if (action === 'pos:resume1') handleResume(0)
      if (action === 'pos:resume2') handleResume(1)
      if (action === 'pos:resume3') handleResume(2)
      if (action === 'pos:payCash') quickPay('cash')
      if (action === 'pos:payCard') quickPay('card')
      if (action === 'pos:payLedger') quickPay('ledger')
    }
    window.addEventListener('pos-shortcut', handler)
    return () => window.removeEventListener('pos-shortcut', handler)
  }, [handleSuspend, handleResume, quickPay])

  const activeCount = slots.filter((s) => s.items.length > 0).length

  return (
    <div className="h-full flex gap-3 p-3">
      <Notification message={notification} />

      {showWebcam && <WebcamScanner onScan={handleBarcodeScan} onClose={() => setShowWebcam(false)} />}

      {/* Payment Confirmation Dialog */}
      <Dialog open={!!pendingPayment} onClose={() => setPendingPayment(null)}
        title="تکمیل فاکتور"
        subtitle={pendingPayment ? `${formatPaymentList(pendingPayment.payments)} — ${getSubtotal().toLocaleString('fa-IR')} ${fa.common.toman}` : ''}
        icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
        footer={<>
          <DialogButton variant="ghost" onClick={() => setPendingPayment(null)}>{fa.common.cancel}</DialogButton>
          <DialogButton variant="success" onClick={confirmSale}>{fa.common.confirm}</DialogButton>
        </>}>
        <DialogField label="نام مشتری">
          <DialogInput value={invoiceCustomerName} onChange={setInvoiceCustomerName} placeholder={selectedCustomer?.name || 'اختیاری'} autoFocus />
        </DialogField>
        <DialogField label="نوع فروش">
          <div className="flex gap-2">
            <button onClick={() => { setSaleType('in-person'); setPendingPayment(prev => prev ? { ...prev, saleType: 'in-person' } : null) }} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: saleType === 'in-person' ? 'linear-gradient(135deg, #006194, #007bb9)' : 'var(--bg-tertiary)', color: saleType === 'in-person' ? '#fff' : 'var(--text-secondary)', border: `1px solid ${saleType === 'in-person' ? '#006194' : 'var(--border-color)'}` }}>حضوری</button>
            <button onClick={() => { setSaleType('online'); setPendingPayment(prev => prev ? { ...prev, saleType: 'online' } : null) }} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: saleType === 'online' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'var(--bg-tertiary)', color: saleType === 'online' ? '#fff' : 'var(--text-secondary)', border: `1px solid ${saleType === 'online' ? '#22c55e' : 'var(--border-color)'}` }}>آنلاین</button>
          </div>
        </DialogField>
        <DialogField label="تاریخ فاکتور">
          <ShamsiDateInput value={saleDate || getTodayGregorian()} onChange={(v) => setSaleDate(v)} label="" />
        </DialogField>
        <DialogField label="تأثیر بر موجودی">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={affectsInventory} onChange={(e) => setAffectsInventory(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: '#22c55e' }} />
            <label className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>کاهش موجودی انبار</label>
          </div>
          {!affectsInventory && <p className="text-[10px] mt-1" style={{ color: '#f59e0b' }}>فقط برای مستندسازی ثبت می‌شود — موجودی تغییر نمی‌کند</p>}
        </DialogField>
        {/* Shipping cost input — added for online orders */}
        <DialogField label="هزینه ارسال (تومان)">
          <FormattedPriceInput value={shippingCost} onChange={(v) => setShippingCost(v)} className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
        </DialogField>
        <DialogField label="توضیحات فاکتور">
          <DialogInput value={invoiceDesc} onChange={setInvoiceDesc} placeholder="مثلاً: شماره سفارش، نام پروژه..." />
        </DialogField>
        <DialogField label="یادداشت">
          <DialogTextarea value={invoiceNote} onChange={setInvoiceNote} placeholder="متن دلخواه برای چاپ روی فاکتور..." rows={2} />
        </DialogField>
        <div className="rounded-xl p-3 mt-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <div className="text-[10px] font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>پیش‌نمایش فاکتور</div>
          <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: '#fff', color: '#1a1a1a', direction: 'rtl' }}>
            {invoiceCustomerName && <div className="mb-1 font-bold">مشتری: {invoiceCustomerName}</div>}
            {invoiceDesc && <div className="mb-1" style={{ color: '#666' }}>{invoiceDesc}</div>}
            <table className="w-full text-[10px] mb-2" style={{ borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid #ddd' }}><th className="text-right py-0.5">کالا</th><th className="text-center">تعداد</th><th className="text-right">قیمت</th></tr></thead>
              <tbody>
                {items.slice(0, 3).map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}><td className="py-0.5">{item.title}</td><td className="text-center">{item.quantity}</td><td className="text-right">{item.unitPrice.toLocaleString('fa-IR')}</td></tr>
                ))}
                {items.length > 3 && <tr><td colSpan={3} className="text-center py-0.5" style={{ color: '#999' }}>+{items.length - 3} کالای دیگر</td></tr>}
              </tbody>
            </table>
            <div className="font-bold text-right" style={{ color: '#006194' }}>جمع: {getSubtotal().toLocaleString('fa-IR')} تومان</div>
            {invoiceNote && <div className="mt-2 pt-1 text-[10px]" style={{ color: '#999', borderTop: '1px dashed #ddd' }}>{invoiceNote}</div>}
          </div>
        </div>
      </Dialog>

      {/* Sale Complete Modal */}
      <Dialog open={!!saleComplete} onClose={() => setSaleComplete(null)}
        title="فروش با موفقیت ثبت شد"
        subtitle={`${saleComplete?.total_amount.toLocaleString('fa-IR')} ${fa.common.toman}`}
        icon={<svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
        footer={<>
          <DialogButton variant="ghost" onClick={() => setSaleComplete(null)}>{fa.common.close}</DialogButton>
          <DialogButton variant="success" onClick={() => { if (saleComplete) { setShowReceipt(saleComplete); setSaleComplete(null) } }}>{fa.receipt.thermalPrint}</DialogButton>
          <DialogButton variant="primary" onClick={async () => {
            if (!saleComplete) return
            const customerName = saleComplete.customerName || lastCustomer?.name || ''
            const saleDesc = saleComplete.description || ''
            const saleNote = saleComplete.invoiceDescription || ''
            let html = ''
            if (customerName) html += `<div style="font-size:11pt;margin-bottom:4px"><strong>مشتری:</strong> ${customerName}</div>`
            html += `<div class="header-info"><span>شماره فاکتور: ${saleComplete.invoiceNumber}</span><span>تاریخ: ${formatJalaliDateTime(saleComplete.createdAt || '')}</span></div>`
            html += `<div class="header-info"><span>صندوق دار: ${user?.name || ''}</span><span>نوع پرداخت: ${formatSalePayments(saleComplete)}</span></div>`
            if (saleDesc) html += `<div style="padding:6px 8px;margin:4px 0;font-size:9pt;background:#f0f4f8;border-radius:4px;color:#333">${saleDesc}</div>`
            html += '<table><thead><tr><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>'
            saleComplete.items?.forEach((item: any) => { html += `<tr><td>${item.productTitle}</td><td>${item.quantity}</td><td>${item.unitPrice.toLocaleString('fa-IR')}</td><td>${item.subtotal.toLocaleString('fa-IR')}</td></tr>` })
            html += '</tbody></table>'
            html += `<p><strong>جمع کل: ${saleComplete.total_amount.toLocaleString('fa-IR')} تومان</strong></p>`
            if (saleNote) html += `<div style="margin-top:8px;padding:6px 8px;font-size:9pt;color:#666;border-top:1px dashed #ccc">${saleNote}</div>`
            showPrint(html, 'فاکتور فروش', true, saleComplete.invoiceNumber, undefined, { name: saleComplete.customerName || customerName || undefined, type: saleComplete.customerType })
            setSaleComplete(null)
          }}>چاپ A4</DialogButton>
        </>}>
        {saleComplete && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>{fa.receipt.invoice}</div>
                <div className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{saleComplete.invoiceNumber}</div>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>{fa.receipt.method}</div>
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatSalePayments(saleComplete)}</div>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>{fa.receipt.date}</div>
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatJalaliDateTime(saleComplete.createdAt || '')}</div>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>مشتری</div>
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{saleComplete.customerName || 'ناشناس'}</div>
              </div>
            </div>
            {saleComplete.items && saleComplete.items.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                <table className="w-full text-xs">
                  <thead><tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <th className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>کالا</th>
                    <th className="px-3 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>تعداد</th>
                    <th className="px-3 py-2 text-left" style={{ color: 'var(--text-secondary)' }}>جمع</th>
                  </tr></thead>
                  <tbody>
                    {saleComplete.items.map((item: any, idx: number) => (
                      <tr key={idx} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>{item.productTitle}</td>
                        <td className="px-3 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>{item.quantity}</td>
                        <td className="px-3 py-2 text-left font-bold" style={{ color: 'var(--text-primary)' }}>{item.subtotal.toLocaleString('fa-IR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Dialog>

      {showReceipt && (
        <ReceiptPrinter sale={showReceipt} storeName={storeSettings.storeName} storeAddress={storeSettings.storeAddress} storePhone={storeSettings.storePhone} receiptFooter={storeSettings.receiptFooter} onClose={() => setShowReceipt(null)} />
      )}

      {/* Suspended Invoices Modal */}
      {showSuspended && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="card p-6 max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{fa.pos.suspendedInvoices} ({activeCount}/3)</h2>
              <button onClick={() => setShowSuspended(false)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all" style={{ color: 'var(--text-muted)' }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <SuspendedSlots onSelect={handleResume} />
          </div>
        </div>
      )}

      {/* Main Content - Left Panel */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Barcode Scanner Row */}
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <BarcodeInput ref={barcodeRef} onBarcodeScanned={handleBarcodeScan} onProductSelected={handleProductSelect} />
          </div>
          {showCameraScanner && (
            <button onClick={() => setShowWebcam(true)} className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all" style={{ background: `linear-gradient(135deg, ${primary}, #007bb9)`, color: '#fff', boxShadow: `0 4px 12px ${primary}40` }} title={fa.common.webcam}>
              <CameraIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Loose Items & Popular Items */}
        <LooseItemsGrid refreshKey={productRefreshKey} />
        <PopularItems onProductAdd={(p) => {
          if (p.stock <= 0) { showNotif(`${fa.admin.outOfStock}: ${p.title}`); return }
          const ok = addItem({ productId: p.id, title: p.title, unitPrice: p.sale_price, purchasePrice: p.purchase_price, maxStock: p.stock, imageBase64: p.imageBase64 || "" })
          if (ok) showNotif(`${p.title} — ${p.sale_price.toLocaleString('fa-IR')} ${fa.common.toman}`)
          else { showNotif(lastError); clearError() }
        }} refreshKey={productRefreshKey} />

        {/* Cart Table */}
        <div className="card flex-1 overflow-hidden flex flex-col" style={{ padding: 0 }}>
          <CartTable items={items} />
        </div>

        {/* Keyboard Shortcuts */}
        <div className="flex gap-4 text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
          <span>F4: {fa.pos.hold}</span>
          <span>F5-F7: {fa.pos.resume}</span>
          <span>Enter: {fa.pos.add}</span>
        </div>
      </div>

      {/* Right Panel - Payment */}
      <div className="w-80 flex flex-col gap-2 shrink-0">
        {/* Subtotal Card */}
        <div className="card">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{fa.pos.subtotal}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${success}20`, color: success }}>{items.length} {fa.pos.items}</span>
          </div>
          <div className="text-3xl font-extrabold mb-3" style={{ color: success }}>{getSubtotal().toLocaleString('fa-IR')} <span className="text-sm font-bold">{fa.common.toman}</span></div>
        </div>

        {/* Payment Panel */}
        <PaymentPanel
          onPay={handlePay}
          selectedCustomer={selectedCustomer}
          onSelectCustomer={(c) => {
            setSelectedCustomer(c)
            // A picked customer's name is used on the invoice automatically
            if (c) setInvoiceCustomerName(c.name)
          }}
          walkInName={invoiceCustomerName}
          onWalkInNameChange={setInvoiceCustomerName}
        />

        {/* Suspended Slots Grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => {
            const hasItems = slots[i].items.length > 0
            return (
              <button key={i} onClick={() => hasItems ? handleResume(i) : handleSuspend(i)}
                className="text-[10px] py-2.5 rounded-xl font-bold transition-all duration-200"
                style={{
                  background: hasItems
                    ? `linear-gradient(135deg, ${warning}, #d97706)`
                    : 'var(--bg-tertiary)',
                  color: hasItems ? '#fff' : 'var(--text-muted)',
                  boxShadow: hasItems ? `0 2px 8px ${warning}30` : 'none',
                }}>
                {hasItems ? `${fa.pos.slot} ${i + 1} (${slots[i].items.length})` : `${fa.pos.slot} ${i + 1}`}
              </button>
            )
          })}
        </div>

        {/* View All Slots */}
        <button onClick={() => setShowSuspended(true)}
          className="w-full py-2.5 rounded-xl text-sm font-bold transition-all duration-200"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
          }}>
          {fa.pos.viewSlots}
        </button>
      </div>
    </div>
  )
}
