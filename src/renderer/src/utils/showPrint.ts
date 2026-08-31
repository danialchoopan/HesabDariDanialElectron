import { usePrintPreviewStore } from '../store/printPreviewStore'

export function showPrint(html: string, title: string, isInvoice: boolean = false, qrData?: string, onClose?: () => void) {
  usePrintPreviewStore.getState().show(html, title, isInvoice, qrData, onClose)
}
