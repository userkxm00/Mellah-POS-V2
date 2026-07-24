import { generateUUID } from '@/lib/uuid'
import { useAuthStore } from '@/stores/authStore'
import { DEFAULT_BRANCH_ID, DEFAULT_CASHIER_ID } from '@/stores/shiftStore'
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

  const activeUser = useAuthStore.getState().currentUser
  const activeBranch = useAuthStore.getState().currentBranch
  const cashierId = activeUser?.id ?? DEFAULT_CASHIER_ID
  const branchId = activeBranch?.id ?? DEFAULT_BRANCH_ID
  const now = new Date().toISOString()

  const operations: Array<{ sql: string; params: unknown[] }> = []

  // 1. Update sale status to voided
  operations.push({
    sql: `UPDATE sales SET status = 'voided', voided_at = ?, void_reason = ?, updated_at = ? WHERE id = ?`,
    params: [now, reason.trim(), now, saleId],
  })

  // 2. Re-stock all items by adding positive stock movements
  for (const item of items) {
    const movementId = generateUUID()
    operations.push({
      sql: `INSERT INTO stock_movements 
            (id, branch_id, variant_id, type, quantity_change, reference_id, note, created_by, created_at) 
            VALUES (?, ?, ?, 'adjustment', ?, ?, ?, ?, ?)`,
      params: [
        movementId,
        branchId,
        item.variant_id,
        item.quantity, // Positive stock return
        saleId,
        `إلغاء فاتورة (#${saleId.slice(0, 8)}): ${reason.trim()}`,
        cashierId,
        now,
      ],
    })
  }

  try {
    await window.electron.db.transaction(operations)
    recordAuditLog(
      'sale_voided',
      'sales',
      `إلغاء الفاتورة #${saleId.slice(0, 8)} — السبب: ${reason.trim()}`,
      saleId
    ).catch(() => {})
    logger.info('Sale voided successfully', { saleId, reason })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'فشل إلغاء الفاتورة'
    logger.error('Failed to void sale', err)
    throw new Error(msg)
  }
}
