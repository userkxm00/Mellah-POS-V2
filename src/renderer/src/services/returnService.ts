import { generateUUID } from '@/lib/uuid'
import { logger } from '@/lib/logger'
import { DEFAULT_BRANCH_ID, DEFAULT_CASHIER_ID } from '@/stores/shiftStore'
import { enqueueSyncOperation } from './syncEngine'
import type { PaymentMethod } from '@/types/database'

export interface SaleReturnLookupItem {
  variant_id: string
  product_name: string
  size: string | null
  color: string | null
  barcode: string | null
  unit_price_dzd: number
  quantity_purchased: number
  quantity_returned_so_far: number
  max_returnable: number
}

export interface SaleReturnLookupResult {
  sale_id: string
  created_at: string
  cashier_name: string
  total_dzd: number
  payment_method: PaymentMethod
  items: SaleReturnLookupItem[]
}

export interface ReturnItemInput {
  variant_id: string
  quantity: number
  unit_price_dzd: number
}

export async function lookupSaleForReturn(saleId: string): Promise<SaleReturnLookupResult> {
  const cleanId = saleId.trim()
  if (!cleanId) {
    throw new Error('يرجى إدخال رقم الوصل')
  }

  // 1. Fetch Sale
  const sales = await window.electron.db.query<{
    id: string
    created_at: string
    cashier_name: string
    total_dzd: number
    payment_method: PaymentMethod
  }>(
    `SELECT s.id, s.created_at, s.total_dzd, s.payment_method, u.full_name as cashier_name
     FROM sales s
     LEFT JOIN users u ON u.id = s.cashier_id
     WHERE s.id = ? AND s.status = 'completed'`,
    [cleanId]
  )

  if (sales.length === 0) {
    throw new Error('لم يتم العثور على وصل بيع بهاد الرقم')
  }

  const sale = sales[0]

  // 2. Fetch Sale Items & Previously Returned Quantities
  const items = await window.electron.db.query<{
    variant_id: string
    product_name: string
    size: string | null
    color: string | null
    barcode: string | null
    unit_price_dzd: number
    quantity_purchased: number
    quantity_returned_so_far: number
  }>(
    `SELECT 
       si.variant_id, p.name as product_name, v.size, v.color, v.barcode,
       si.unit_price_dzd, si.quantity as quantity_purchased,
       COALESCE(SUM(r.quantity), 0) as quantity_returned_so_far
     FROM sale_items si
     JOIN product_variants v ON v.id = si.variant_id
     JOIN products p ON p.id = v.product_id
     LEFT JOIN returns r ON r.original_sale_id = si.sale_id AND r.variant_id = si.variant_id
     WHERE si.sale_id = ?
     GROUP BY si.variant_id`,
    [cleanId]
  )

  const mappedItems: SaleReturnLookupItem[] = items.map((i) => ({
    ...i,
    max_returnable: Math.max(0, i.quantity_purchased - i.quantity_returned_so_far),
  }))

  return {
    sale_id: sale.id,
    created_at: sale.created_at,
    cashier_name: sale.cashier_name,
    total_dzd: sale.total_dzd,
    payment_method: sale.payment_method,
    items: mappedItems,
  }
}

export async function processReturn(
  saleId: string,
  returnItems: ReturnItemInput[],
  refundMethod: 'cash' | 'store_credit',
  reason: string
): Promise<string> {
  const activeItems = returnItems.filter((i) => i.quantity > 0)
  if (activeItems.length === 0) {
    throw new Error('اختر منتجاً واحداً على الأقل لإرجاعه')
  }

  const now = new Date().toISOString()
  const operations: Array<{ sql: string; params: unknown[] }> = []

  let firstReturnId = ''

  for (const item of activeItems) {
    const returnId = generateUUID()
    const movementId = generateUUID()

    if (!firstReturnId) firstReturnId = returnId

    // 1. Insert Return record
    operations.push({
      sql: `INSERT INTO returns 
            (id, branch_id, original_sale_id, variant_id, quantity, refund_method, reason, processed_by, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        returnId,
        DEFAULT_BRANCH_ID,
        saleId,
        item.variant_id,
        item.quantity,
        refundMethod,
        reason.trim() || 'إرجاع بضاعة كاشير',
        DEFAULT_CASHIER_ID,
        now,
      ],
    })

    // 2. Insert Stock Movement Ledger Entry (+quantity restock)
    operations.push({
      sql: `INSERT INTO stock_movements 
            (id, branch_id, variant_id, type, quantity_change, reference_id, note, created_by, created_at) 
            VALUES (?, ?, ?, 'return', ?, ?, ?, ?, ?)`,
      params: [
        movementId,
        DEFAULT_BRANCH_ID,
        item.variant_id,
        item.quantity,
        saleId,
        `إرجاع بضاعة: ${reason.trim() || 'مرتجع'}`,
        DEFAULT_CASHIER_ID,
        now,
      ],
    })
  }

  try {
    await window.electron.db.transaction(operations)
    logger.info('Return processed atomically', { saleId, returnCount: activeItems.length })

    enqueueSyncOperation('returns', 'insert', {
      original_sale_id: saleId,
      refund_method: refundMethod,
      created_at: now,
    }).catch((err) => logger.error('Failed sync enqueue return', err))

    return firstReturnId
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'فشل تسجيل المرتجع'
    logger.error('Return processing failed', err)
    throw new Error(msg)
  }
}
