import { recordAuditLog } from './auditLogService'
import { logger } from '@/lib/logger'

export interface VoidSaleItemInput {
  variant_id: string
  quantity: number
  product_name: string
}

export async function voidSale(
  saleId: string,
  reason: string,
  items: VoidSaleItemInput[]
): Promise<void> {
  if (!reason.trim()) {
    throw new Error('يرجى اختيار أو كتابة سبب إلغاء الفاتورة')
  }

  if (window.electron?.biz?.sales?.void) {
    await window.electron.biz.sales.void(saleId, reason.trim(), items)
    recordAuditLog(
      'sale_voided',
      'sales',
      `إلغاء الفاتورة #${saleId.slice(0, 8)} — السبب: ${reason.trim()}`,
      saleId
    ).catch(() => {})
    logger.info('Sale voided successfully via Main process IPC', { saleId, reason })
    return
  }

  throw new Error('قناة الاتصال بالخادم غير متوفرة لإلغاء الفاتورة')
}
