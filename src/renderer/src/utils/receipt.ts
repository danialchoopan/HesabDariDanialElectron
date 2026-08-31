export interface ReceiptData {
  title: string
  invoiceNumber?: string
  date: string
  cashier?: string
  customer?: string
  method?: string
  items: { name: string; qty: number; price: number; total: number }[]
  subtotal: number
  total: number
  shipping?: number
  customerPaid?: number
  change?: number
  footer?: string
  storeName: string
  storeAddress?: string
  storePhone?: string
  extra?: { label: string; value: string; color?: string }[]
}

export function generateReceiptHTML(data: ReceiptData): string {
  const items = data.items.map(item => `
    <tr>
      <td style="text-align:right;padding:3px 0;border-bottom:1px dashed #eee">${item.name}</td>
      <td style="text-align:center;padding:3px 0;border-bottom:1px dashed #eee">${item.qty}</td>
      <td style="text-align:left;padding:3px 0;border-bottom:1px dashed #eee">${item.price.toLocaleString('fa-IR')}</td>
      <td style="text-align:left;padding:3px 0;border-bottom:1px dashed #eee;font-weight:bold">${item.total.toLocaleString('fa-IR')}</td>
    </tr>`).join('')

  const extraRows = (data.extra || []).map(e => `
    <div style="display:flex;justify-content:space-between;padding:2px 0">
      <span>${e.label}</span>
      <span style="${e.color ? `color:${e.color};font-weight:bold` : ''}">${e.value}</span>
    </div>`).join('')

  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
<title>${data.title} ${data.invoiceNumber || ''}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:11px;direction:rtl;padding:5mm;width:80mm;color:#000;background:#fff}
.receipt{padding:3mm}
.header{text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:6px}
.store-name{font-size:16px;font-weight:bold;letter-spacing:1px}
.store-info{font-size:9px;color:#666;margin-top:2px}
.title{text-align:center;font-weight:bold;font-size:12px;margin:6px 0}
.info{font-size:10px;margin-bottom:4px}
.info span{display:inline-block;margin-left:8px}
table{width:100%;border-collapse:collapse;margin:6px 0}
th{border-bottom:2px solid #000;padding:3px 0;font-size:10px;text-align:right}
td{font-size:10px}
.divider{border-top:2px dashed #000;margin:6px 0}
.divider-thin{border-top:1px dashed #ccc;margin:4px 0}
.total-section{margin-top:4px}
.total-row{display:flex;justify-content:space-between;padding:2px 0;font-size:10px}
.total-row.grand{font-size:13px;font-weight:bold;border-top:2px solid #000;padding-top:4px;margin-top:4px}
.footer{text-align:center;border-top:2px dashed #000;padding-top:6px;margin-top:8px;font-size:9px;color:#666}
.barcode{text-align:center;margin:6px 0;font-family:monospace;font-size:14px;letter-spacing:2px}
</style></head><body>
<div class="receipt">
  <div class="header">
    <div class="store-name">${data.storeName}</div>
    ${data.storeAddress ? `<div class="store-info">${data.storeAddress}</div>` : ''}
    ${data.storePhone ? `<div class="store-info">${data.storePhone}</div>` : ''}
  </div>

  <div class="title">${data.title}</div>
  ${data.invoiceNumber ? `<div class="info"><span>شماره: ${data.invoiceNumber}</span></div>` : ''}
  <div class="info"><span>تاریخ: ${data.date}</span></div>
  ${data.cashier ? `<div class="info"><span>صندوق‌دار: ${data.cashier}</span></div>` : ''}
  ${data.customer ? `<div class="info"><span>مشتری: ${data.customer}</span></div>` : ''}
  ${data.method ? `<div class="info"><span>نحوه پرداخت: ${data.method}</span></div>` : ''}

  <table>
    <thead><tr>
      <th style="text-align:right">کالا</th>
      <th style="text-align:center">تعداد</th>
      <th style="text-align:left">قیمت</th>
      <th style="text-align:left">جمع</th>
    </tr></thead>
    <tbody>${items}</tbody>
  </table>

  <div class="divider"></div>

  <div class="total-section">
    <div class="total-row"><span>جمع کل</span><span>${data.subtotal.toLocaleString('fa-IR')} تومان</span></div>
    ${data.shipping ? `<div class="total-row"><span>هزینه ارسال</span><span>${data.shipping.toLocaleString('fa-IR')} تومان</span></div>` : ''}
    ${extraRows}
    ${data.customerPaid ? `<div class="total-row"><span>پرداختی مشتری</span><span>${data.customerPaid.toLocaleString('fa-IR')} تومان</span></div>` : ''}
    ${data.change !== undefined ? `<div class="total-row"><span>پول خرد</span><span>${data.change.toLocaleString('fa-IR')} تومان</span></div>` : ''}
    <div class="total-row grand"><span>مبلغ قابل پرداخت</span><span>${data.total.toLocaleString('fa-IR')} تومان</span></div>
  </div>

  <div class="footer">
    ${data.footer || 'با تشکر از خرید شما'}
  </div>
</div>
</body></html>`
}

export function printContent(html: string) {
  const win = window.open('', '_blank', 'width=350,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => { win.print() }, 300)
}
