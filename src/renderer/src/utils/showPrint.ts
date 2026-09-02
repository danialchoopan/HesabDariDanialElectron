import { usePrintPreviewStore } from '../store/printPreviewStore'

export function showPrint(html: string, title: string, isInvoice: boolean = false, qrData?: string, onClose?: () => void, customerInfo?: { name?: string; type?: 'real' | 'legal' }) {
  usePrintPreviewStore.getState().show(html, title, isInvoice, qrData, customerInfo, onClose)
}
