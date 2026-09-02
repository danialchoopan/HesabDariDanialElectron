/**
 * SalePaymentBadge — compact display of how a sale was paid.
 *
 * Single-method sales render one coloured chip (as before); split/mixed sales
 * render one chip per method so it is obvious the invoice was paid by several
 * means (cash + card + card-to-card + debt).
 */
import type { Sale } from '../../../../types'
import { paymentMethodLabel, paymentColor } from '../../utils/payment'

interface Props {
  sale: Sale
  size?: 'sm' | 'xs'
}

export default function SalePaymentBadge({ sale, size = 'xs' }: Props) {
  const payments = sale.payments && sale.payments.length > 0 ? sale.payments : []
  const methods = payments.length > 0
    ? payments.map(p => p.method)
    : [sale.paymentMethod]

  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]'

  return (
    <span className="inline-flex flex-wrap gap-1">
      {methods.map((m, i) => {
        const color = paymentColor(m)
        return (
          <span key={i} className={`rounded-full font-bold inline-block ${pad}`} style={{ backgroundColor: color + '1f', color }}>
            {paymentMethodLabel(m)}
          </span>
        )
      })}
    </span>
  )
}
