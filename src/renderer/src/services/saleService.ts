import type { CartItem } from '@/stores/cartStore'
import type { PaymentMethod } from '@/types/database'
import { generateUUID } from '@/lib/uuid'
import { logger } from '@/lib/logger'
import { DEFAULT_BRANCH_ID, DEFAULT_CASHIER_ID } from '@/stores/shiftStore'
import { useAuthStore } from '@/stores/authStore'
import { enqueueSyncOperation } from './syncEngine'
import { recordAuditLog } from './auditLogService'

export interface CreateSaleResult {
  saleId: string
  totalDzd: number
  itemCount: number
}

export async function processSale(
  items: CartItem[],
  paymentMethod: PaymentMethod,
  shiftId: string,
  customerId?: string | null,
  mixedCashDzd?: number | null,
  mixedCardDzd?: number | null,
  discountDzd?: number,
  creditDepositDzd?: number | null
): Promise<CreateSaleResult> {
  if (items.length === 0) {
    throw new Error('السلة فارغة')
  }

  if (paymentMethod === 'credit' && !customerId) {
    throw new Error('يجب تحديد الزبون عند البيع بالتقسيط / الكريدي')
  }

  // Resolve dynamic cashier and branch IDs
  const activeUser = useAuthStore.getState().currentUser
  const activeBranch = useAuthStore.getState().currentBranch
  const cashierId = activeUser?.id ?? DEFAULT_CASHIER_ID
  const branchId = activeBranch?.id ?? DEFAULT_BRANCH_ID

  // DB-Level Stock Verification (prevent negative overselling in DB)
  for (const item of items) {
    const stockRows = await window.electron.db.query<{ current_stock: number }>(
      `SELECT COALESCE(SUM(quantity_change), 0) as current_stock 
       FROM stock_movements 
       WHERE variant_id = ? AND branch_id = ?`,
      [item.variant_id, branchId]
    )
    const actualStock = stockRows[0]?.current_stock ?? 0
    if (actualStock < item.quantity) {
      throw new Error(
        `عفواً! المنتج "${item.product_name}" نفد من المخزون (المتوفر الحقيقي في القاعدة: ${actualStock}، المطلوب: ${item.quantity})`
      )
    }
  }

  const saleId = generateUUID()
  const now = new Date().toISOString()
  const subtotalDzd = items.reduce(
    (acc, item) => acc + item.unit_price_dzd * item.quantity,
    0
  )
  const discountVal = Math.min(subtotalDzd, Math.max(0, discountDzd ?? 0))
  const totalDzd = subtotalDzd - discountVal

  // Calculate payment split amounts & debt
  let cashPaid = 0
  let cardPaid = 0
  let paidAmountDzd = totalDzd
  let remainingDebtDzd = 0

  if (paymentMethod === 'cash') {
    cashPaid = totalDzd
  } else if (paymentMethod === 'card') {
    cardPaid = totalDzd
  } else if (paymentMethod === 'mixed') {
    cashPaid = mixedCashDzd ?? totalDzd / 2
    cardPaid = mixedCardDzd ?? totalDzd / 2
  } else if (paymentMethod === 'credit') {
    paidAmountDzd = Math.min(totalDzd, Math.max(0, creditDepositDzd ?? 0))
    remainingDebtDzd = totalDzd - paidAmountDzd
    cashPaid = paidAmountDzd
  }

  const operations: Array<{ sql: string; params: unknown[] }> = []

  // 1. Insert Sales Record (includes debt tracking fields)
  operations.push({
    sql: `INSERT INTO sales 
          (id, branch_id, shift_id, cashier_id, customer_id, subtotal_dzd, discount_dzd, total_dzd, cash_amount_dzd, card_amount_dzd, paid_amount_dzd, remaining_debt_dzd, payment_method, status, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
    params: [
      saleId,
      branchId,
      shiftId,
      cashierId,
      customerId || null,
      subtotalDzd,
      discountVal,
      totalDzd,
      cashPaid,
      cardPaid,
      paidAmountDzd,
      remainingDebtDzd,
      paymentMethod,
      now,
      now,
    ],
  })

  // 1b. Update Customer Loyalty Points
  if (customerId) {
    const pointsEarned = Math.floor(totalDzd / 100)
    operations.push({
      sql: `UPDATE customers 
            SET loyalty_points = loyalty_points + ?, 
                updated_at = ? 
            WHERE id = ?`,
      params: [pointsEarned, now, customerId],
    })
  }

  // 2. Insert Sale Items & Stock Movements (Ledger entries)
  for (const item of items) {
    const saleItemId = generateUUID()
    const movementId = generateUUID()

    // Sale item & Stock movement (negative change for sales)
    operations.push(
      {
        sql: `INSERT INTO sale_items 
              (id, branch_id, sale_id, variant_id, quantity, unit_price_dzd, created_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [
          saleItemId,
          branchId,
          saleId,
          item.variant_id,
          item.quantity,
          item.unit_price_dzd,
          now,
        ],
      },
      {
        sql: `INSERT INTO stock_movements 
              (id, branch_id, variant_id, type, quantity_change, reference_id, note, created_by, created_at) 
              VALUES (?, ?, ?, 'sale', ?, ?, 'عملية بيع كاشير', ?, ?)`,
        params: [
          movementId,
          branchId,
          item.variant_id,
          -item.quantity, // Negative deduction
          saleId,
          cashierId,
          now,
        ],
      }
    )
  }

  try {
    // Execute all operations atomically in one single DB transaction
    await window.electron.db.transaction(operations)

    // Record system Audit Log
    recordAuditLog(
      'sale_completed',
      'sales',
      `إتمام عملية بيع بمبلغ ${totalDzd} دج (${paymentMethod}) — ${items.length} منتجات`,
      saleId
    ).catch(() => {})
    logger.info('Sale completed atomically', { saleId, totalDzd, itemCount: items.length })

    // Enqueue to sync_queue for background sync
    enqueueSyncOperation('sales', 'insert', {
      id: saleId,
      branch_id: branchId,
      shift_id: shiftId,
      cashier_id: cashierId,
      total_dzd: totalDzd,
      subtotal_dzd: subtotalDzd,
      discount_dzd: discountVal,
      cash_amount_dzd: cashPaid,
      card_amount_dzd: cardPaid,
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
