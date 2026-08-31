import type { Sale } from '../../../../types'
import { fa } from '../../i18n'
import { formatJalaliDateTime } from '../../utils/jalali'
import { generateReceiptHTML, printContent } from '../../utils/receipt'
import { useTheme } from '../../hooks/useTheme'

interface Props {
  sale: Sale
  storeName: string
  storeAddress: string
  storePhone: string
  receiptFooter: string
  onClose: () => void
}

export default function ReceiptPrinter({ sale, storeName, storeAddress, storePhone, receiptFooter, onClose }: Props) {
  const { isDark } = useTheme()
  const methodLabel = sale.paymentMethod === 'cash' ? fa.payment.cash : sale.paymentMethod === 'card' ? fa.payment.card : fa.payment.ledger

  const handlePrint = () => {
    const html = generateReceiptHTML({
      title: fa.receipt.invoice,
      invoiceNumber: sale.invoiceNumber,
      date: formatJalaliDateTime(sale.createdAt),
      cashier: sale.userName,
      customer: sale.customerName,
      method: methodLabel,
      items: (sale.items || []).map((item: any) => ({
        name: item.productTitle,
        qty: item.quantity,
        price: item.unitPrice,
        total: item.subtotal,
      })),
      subtotal: sale.subtotal,
      total: sale.total_amount,
      shipping: sale.shippingCost,
      customerPaid: sale.paymentMethod === 'cash' ? sale.customerPaid : undefined,
      change: sale.paymentMethod === 'cash' ? sale.changeAmount : undefined,
      footer: receiptFooter || fa.receipt.thankYou,
      storeName,
      storeAddress,
      storePhone,
    })
    printContent(html)
  }

  const previewHTML = generateReceiptHTML({
    title: fa.receipt.invoice,
    invoiceNumber: sale.invoiceNumber,
    date: formatJalaliDateTime(sale.createdAt),
    cashier: sale.userName,
    method: methodLabel,
    items: (sale.items || []).map((item: any) => ({
      name: item.productTitle,
      qty: item.quantity,
      price: item.unitPrice,
      total: item.subtotal,
    })),
    subtotal: sale.subtotal,
    total: sale.total_amount,
    shipping: sale.shippingCost,
    customerPaid: sale.paymentMethod === 'cash' ? sale.customerPaid : undefined,
    change: sale.paymentMethod === 'cash' ? sale.changeAmount : undefined,
    footer: receiptFooter || fa.receipt.thankYou,
    storeName, storeAddress, storePhone,
  })

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center no-print">
      <div className="rounded-2xl p-6 max-w-sm w-full mx-4 border-2" style={{
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div className="text-center mb-4">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="text-lg font-bold" style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>{fa.receipt.invoice}</h2>
          <p className="text-sm mt-1" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>{sale.invoiceNumber}</p>
        </div>

        <div className="rounded-xl overflow-hidden mb-4 border" style={{ borderColor: isDark ? '#334155' : '#e2e8f0', maxHeight: '300px', overflowY: 'auto' }}>
          <iframe
            srcDoc={previewHTML}
            className="w-full border-0"
            style={{ height: '300px', background: '#fff' }}
            title="Receipt Preview"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={handlePrint} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            {fa.receipt.thermalPrint}
          </button>
          <button onClick={onClose} className="btn-success flex-1 py-3">{fa.common.close}</button>
        </div>
      </div>
    </div>
  )
}
