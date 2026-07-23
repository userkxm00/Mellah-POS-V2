import type { CartItem } from '@/stores/cartStore'
import type { PaymentMethod } from '@/types/database'
import { generateUUID } from '@/lib/uuid'
import { logger } from '@/lib/logger'
import { DEFAULT_BRANCH_ID, DEFAULT_CASHIER_ID } from '@/stores/shiftStore'
import { enqueueSyncOperation } from './syncEngine'

export interface CreateSaleResult {
  saleId: string
  totalDzd: number
  itemCount: number
}

export async function processSale(
  items: CartItem[],
  paymentMethod: PaymentMethod,
  shiftId: string
): Promise<CreateSaleResult> {
  if (items.length === 0) {
    throw new Error('السلة فارغة')
  }

  const saleId = generateUUID()
  const now = new Date().toISOString()
  const totalDzd = items.reduce(
    (acc, item) => acc + item.unit_price_dzd * item.quantity,
    0
  )

  const operations: Array<{ sql: string; params: unknown[] }> = []

  // 1. Insert Sales Record
  operations.push({
    sql: `INSERT INTO sales 
          (id, branch_id, shift_id, cashier_id, customer_id, total_dzd, payment_method, status, created_at, updated_at) 
          VALUES (?, ?, ?, ?, NULL, ?, ?, 'completed', ?, ?)`,
    params: [
      saleId,
      DEFAULT_BRANCH_ID,
      shiftId,
      DEFAULT_CASHIER_ID,
      totalDzd,
      paymentMethod,
      now,
      now,
    ],
  })

  // 2. Insert Sale Items & Stock Movements (Ledger entries)
  for (const item of items) {
    const saleItemId = generateUUID()
    const movementId = generateUUID()

    // Sale item
    operations.push({
      sql: `INSERT INTO sale_items 
            (id, sale_id, variant_id, quantity, unit_price_dzd, created_at) 
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [
        saleItemId,
        saleId,
        item.variant_id,
        item.quantity,
        item.unit_price_dzd,
        now,
      ],
    })

    // Stock movement (negative change for sales)
    operations.push({
      sql: `INSERT INTO stock_movements 
            (id, branch_id, variant_id, type, quantity_change, reference_id, note, created_by, created_at) 
            VALUES (?, ?, ?, 'sale', ?, ?, 'عملية بيع كاشير', ?, ?)`,
      params: [
        movementId,
        DEFAULT_BRANCH_ID,
        item.variant_id,
        -item.quantity, // Negative deduction
        saleId,
        DEFAULT_CASHIER_ID,
        now,
      ],
    })
  }

  try {
    // Execute all operations atomically in one single DB transaction
    await window.electron.db.transaction(operations)
    logger.info('Sale completed atomically', { saleId, totalDzd, itemCount: items.length })

    // Enqueue to sync_queue for background sync
    enqueueSyncOperation('sales', 'insert', {
      id: saleId,
      branch_id: DEFAULT_BRANCH_ID,
      shift_id: shiftId,
      cashier_id: DEFAULT_CASHIER_ID,
      total_dzd: totalDzd,
      payment_method: paymentMethod,
      status: 'completed',
      created_at: now,
    }).catch((err) => logger.error('Failed sync enqueue sale', err))

    return {
      saleId,
      totalDzd,
      itemCount: items.length,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'فشل في تسجيل عملية البيع'
    logger.error('Sale transaction rolled back', { err, saleId })
    throw new Error(`تعذر إتمام عملية البيع: ${errorMsg}`)
  }
}
