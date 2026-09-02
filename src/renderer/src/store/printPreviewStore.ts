import { create } from 'zustand'

interface PendingPrint {
  html: string
  title: string
  isInvoice: boolean
  qrData?: string
  customerName?: string
  customerType?: 'real' | 'legal'
  onClose?: () => void
}

interface PrintPreviewState {
  pending: PendingPrint | null
  show: (html: string, title: string, isInvoice?: boolean, qrData?: string, customerInfo?: { name?: string; type?: 'real' | 'legal' }, onClose?: () => void) => void
  clear: () => void
}

export const usePrintPreviewStore = create<PrintPreviewState>((set) => ({
  pending: null,
  show: (html, title, isInvoice = false, qrData, customerInfo, onClose) => set({ pending: { html, title, isInvoice, qrData, customerName: customerInfo?.name, customerType: customerInfo?.type, onClose } }),
  clear: () => set({ pending: null }),
}))
