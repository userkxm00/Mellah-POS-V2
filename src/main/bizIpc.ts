import { ipcMain } from 'electron'
import crypto from 'node:crypto'
import { whenDatabaseReady, withTransaction } from './database'
import { requireAuth, requireRole, validateBranchAccess } from './session'
import { processReturnItemValidation, type SaleItemRecord } from './returnValidation'
import type { PaymentMethod } from '../renderer/src/types/database'

export const CUSTOM_GENERIC_PRODUCT_ID = 'p-custom-generic-0000'
export const CUSTOM_GENERIC_VARIANT_ID = 'v-custom-generic-0000'

function generateUUID(): string {
  return crypto.randomUUID()
}

export function registerBizIpcHandlers(): void {
  // ── POS & Catalog Data ──
  ipcMain.handle('biz:pos:loadData', async (_event, targetBranchId?: string) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session, targetBranchId)
    const db = await whenDatabaseReady()

    const categories = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM categories WHERE (branch_id = ? OR branch_id IS NULL) AND deleted_at IS NULL ORDER BY name',
      [branchId]
    )

    const customers = await db.query<{ id: string; full_name: string; phone: string | null; loyalty_points: number; store_credit_balance: number; barcode: string | null }>(
      'SELECT id, full_name, phone, loyalty_points, COALESCE(store_credit_balance, 0) as store_credit_balance, barcode FROM customers WHERE branch_id = ? AND deleted_at IS NULL ORDER BY full_name',
      [branchId]
    )

    const variants = await db.query<Record<string, unknown>>(
      `SELECT 
         v.id, v.product_id, v.branch_id, v.size, v.color, v.barcode, v.sku, v.price_dzd, COALESCE(v.min_stock_level, 5) as min_stock_level, v.created_at, v.updated_at, v.deleted_at,
         p.name as product_name, p.category_id, p.price_dzd as default_price, p.cost_dzd, p.image_url,
         c.name as category_name,
         COALESCE(SUM(sm.quantity_change), 0) as current_stock
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN stock_movements sm ON sm.variant_id = v.id AND sm.branch_id = ?
       WHERE v.branch_id = ? AND v.deleted_at IS NULL AND p.deleted_at IS NULL
       GROUP BY v.id
       ORDER BY p.name, v.size, v.color`,
      [branchId, branchId]
    )

    return { categories, customers, variants }
  })

  ipcMain.handle('biz:pos:quickAddCustomer', async (_event, name: string, phone: string, targetBranchId?: string) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session, targetBranchId)
    const db = await whenDatabaseReady()

    const id = generateUUID()
    const barcode = `CUST-${Date.now().toString().slice(-8)}`
    const now = new Date().toISOString()

    await db.execute(
      `INSERT INTO customers (id, branch_id, full_name, phone, loyalty_points, store_credit_balance, barcode, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      [id, branchId, name.trim(), phone.trim() || null, barcode, now, now]
    )

    return { id, barcode }
  })

  // ── Sales Processing ──
  ipcMain.handle(
    'biz:sales:process',
    async (
      _event,
      payload: {
        items: Array<{ variant_id: string; quantity: number; unit_price_dzd: number; product_name: string }>
        paymentMethod: PaymentMethod
        shiftId: string
        customerId?: string | null
        mixedCashDzd?: number | null
        mixedCardDzd?: number | null
        discountDzd?: number
        creditDepositDzd?: number | null
        redeemedPointsDzd?: number
        storeCreditUsedDzd?: number | null
        targetBranchId?: string
      }
    ) => {
      const session = requireAuth()
      const branchId = validateBranchAccess(session, payload.targetBranchId)
      const cashierId = session.userId
      const db = await whenDatabaseReady()

      if (!payload.items || payload.items.length === 0) {
        throw new Error('السلة فارغة')
      }

      if (!payload.shiftId) {
        throw new Error('يجب تحديد وردية العمل')
      }

      // Verify Shift Existence, Assignment & Open Status
      const shiftRows = await db.query<{ id: string; cashier_id: string; branch_id: string; status: string }>(
        'SELECT id, cashier_id, branch_id, status FROM shifts WHERE id = ?',
        [payload.shiftId]
      )
      if (shiftRows.length === 0) {
        throw new Error('الوردية المحددة غير موجودة')
      }
      const targetShift = shiftRows[0]
      if (targetShift.branch_id !== branchId || targetShift.cashier_id !== cashierId) {
        throw new Error('الوردية المحددة لا تنتمي للمستخدم أو الفرع الحالي')
      }
      if (targetShift.status !== 'open') {
        throw new Error('الوردية مغلقة ولا يمكن إجراء مبيعات عليها')
      }

      // Validate Items & Quantities
      for (const item of payload.items) {
        if (!item.quantity || !Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new Error(`كمية المنتج "${item.product_name || item.variant_id}" غير صالحة`)
        }
        if (typeof item.unit_price_dzd !== 'number' || Number.isNaN(item.unit_price_dzd) || item.unit_price_dzd < 0) {
          throw new Error(`سعر المنتج "${item.product_name || item.variant_id}" غير صالح`)
        }
      }

      // Deterministic error handling: ensure generic product & variant exist without silent .catch swallowing
      const hasCustomItems = payload.items.some((i) => i.variant_id.startsWith('v-custom-'))
      if (hasCustomItems) {
        const existingVariant = await db.query<{ id: string }>(
          'SELECT id FROM product_variants WHERE id = ?',
          [CUSTOM_GENERIC_VARIANT_ID]
        )
        if (existingVariant.length === 0) {
          const nowSeed = new Date().toISOString()
          const prodRows = await db.query<{ id: string }>('SELECT id FROM products WHERE id = ?', [CUSTOM_GENERIC_PRODUCT_ID])
          if (prodRows.length === 0) {
            await db.execute(
              `INSERT INTO products (id, category_id, name, price_dzd, created_at, updated_at) VALUES (?, NULL, 'سلعة غير مسجلة', 0, ?, ?)`,
              [CUSTOM_GENERIC_PRODUCT_ID, nowSeed, nowSeed]
            )
          }
          await db.execute(
            `INSERT INTO product_variants (id, product_id, branch_id, price_dzd, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
            [CUSTOM_GENERIC_VARIANT_ID, CUSTOM_GENERIC_PRODUCT_ID, branchId, nowSeed, nowSeed]
          )
        }
      }

      // Stock Check for non-custom items
      for (const item of payload.items) {
        if (item.variant_id.startsWith('v-custom-')) continue

        const varRows = await db.query<{ id: string; branch_id: string; product_deleted: string | null; variant_deleted: string | null }>(
          `SELECT v.id, v.branch_id, p.deleted_at as product_deleted, v.deleted_at as variant_deleted
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           WHERE v.id = ?`,
          [item.variant_id]
        )
        if (varRows.length === 0 || varRows[0].variant_deleted || varRows[0].product_deleted) {
          throw new Error(`المنتج "${item.product_name}" محذوف أو غير موجود في القاعدة`)
        }
        if (varRows[0].branch_id !== branchId) {
          throw new Error(`المنتج "${item.product_name}" لا ينتمي لفرع المستخدم الحالي`)
        }

        const stockRows = await db.query<{ current_stock: number }>(
          `SELECT COALESCE(SUM(quantity_change), 0) as current_stock FROM stock_movements WHERE variant_id = ? AND branch_id = ?`,
          [item.variant_id, branchId]
        )
        const actualStock = stockRows[0]?.current_stock ?? 0
        if (actualStock < item.quantity) {
          throw new Error(`عفواً! المنتج "${item.product_name}" نفد من المخزون (المتوفر الحقيقي: ${actualStock}، المطلوب: ${item.quantity})`)
        }
      }

      const saleId = generateUUID()
      const now = new Date().toISOString()
      const subtotalDzd = payload.items.reduce((sum, i) => sum + i.unit_price_dzd * i.quantity, 0)
      const discountVal = Math.min(subtotalDzd, Math.max(0, payload.discountDzd ?? 0))
      const totalDzd = subtotalDzd - discountVal

      let cashPaid = 0
      let cardPaid = 0
      let paidAmountDzd = totalDzd
      let remainingDebtDzd = 0

      if (payload.paymentMethod === 'cash') {
        cashPaid = totalDzd
        cardPaid = 0
      } else if (payload.paymentMethod === 'card') {
        cashPaid = 0
        cardPaid = totalDzd
      } else if (payload.paymentMethod === 'mixed') {
        const mixedCash = payload.mixedCashDzd ?? 0
        const mixedCard = payload.mixedCardDzd ?? 0
        if (mixedCash <= 0 || mixedCard <= 0 || Math.abs(mixedCash + mixedCard - totalDzd) > 0.01) {
          throw new Error('في حالة الدفع المختلط، يجب أن تكون مبالغ النقدي والبطاقة أكبر من الصفر ومجموعهما يساوي إجمالي الفاتورة بالضبط')
        }
        cashPaid = mixedCash
        cardPaid = mixedCard
      } else if (payload.paymentMethod === 'credit') {
        if (!payload.customerId) {
          throw new Error('يجب تحديد الزبون عند البيع بالتقسيط / الكريدي')
        }
        paidAmountDzd = Math.min(totalDzd, Math.max(0, payload.creditDepositDzd ?? 0))
        remainingDebtDzd = totalDzd - paidAmountDzd
        cashPaid = paidAmountDzd
        cardPaid = 0
      }

      const operations: Array<{ sql: string; params: unknown[] }> = []

      operations.push({
        sql: `INSERT INTO sales (id, branch_id, shift_id, cashier_id, customer_id, subtotal_dzd, discount_dzd, total_dzd, cash_amount_dzd, card_amount_dzd, paid_amount_dzd, remaining_debt_dzd, payment_method, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
        params: [saleId, branchId, payload.shiftId, cashierId, payload.customerId || null, subtotalDzd, discountVal, totalDzd, cashPaid, cardPaid, paidAmountDzd, remainingDebtDzd, payload.paymentMethod, now, now],
      })

      for (const item of payload.items) {
        const saleItemId = generateUUID()
        const movementId = generateUUID()
        const targetVariantId = item.variant_id.startsWith('v-custom-') ? CUSTOM_GENERIC_VARIANT_ID : item.variant_id

        operations.push({
          sql: `INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          params: [saleItemId, saleId, targetVariantId, item.quantity, item.unit_price_dzd, now],
        })

        if (!item.variant_id.startsWith('v-custom-')) {
          operations.push({
            sql: `INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id, note, created_by, created_at)
                  VALUES (?, ?, ?, 'sale', ?, ?, 'عملية بيع كاشير', ?, ?)`,
            params: [movementId, branchId, item.variant_id, -item.quantity, saleId, cashierId, now],
          })
        }
      }

      // Customer Loyalty & Store Credit Updates in Transaction
      if (payload.customerId) {
        const settingsRows = await db.query<{ loyalty_enabled: number; loyalty_spend_per_point_dzd: number }>(
          `SELECT loyalty_enabled, loyalty_spend_per_point_dzd FROM store_settings WHERE branch_id = ? LIMIT 1`,
          [branchId]
        )
        const settings = settingsRows[0] ?? { loyalty_enabled: 0, loyalty_spend_per_point_dzd: 1000 }
        const spendPerPoint = settings.loyalty_spend_per_point_dzd || 1000
        const pointsEarned = settings.loyalty_enabled ? Math.floor(totalDzd / Math.max(1, spendPerPoint)) : 0
        const pointsDeducted = Math.max(0, Math.floor(payload.redeemedPointsDzd ?? 0))

        operations.push({
          sql: `UPDATE customers SET loyalty_points = MAX(0, loyalty_points + ? - ?), updated_at = ? WHERE id = ?`,
          params: [pointsEarned, pointsDeducted, now, payload.customerId],
        })
      }

      if (payload.customerId && payload.storeCreditUsedDzd && payload.storeCreditUsedDzd > 0) {
        const usedCredit = Math.min(payload.storeCreditUsedDzd, discountVal)
        if (usedCredit > 0) {
          operations.push({
            sql: `UPDATE customers SET store_credit_balance = MAX(0, COALESCE(store_credit_balance, 0) - ?), updated_at = ? WHERE id = ?`,
            params: [usedCredit, now, payload.customerId],
          })
        }
      }

      // System Audit Log inside transaction
      operations.push({
        sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'sale_completed', 'sales', ?, ?, ?)`,
        params: [generateUUID(), cashierId, saleId, `إتمام عملية بيع بمبلغ ${totalDzd} دج (${payload.paymentMethod})`, now],
      })

      // Sync Queue Enqueue inside transaction (includes split cash_amount_dzd and card_amount_dzd)
      operations.push({
        sql: `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, 'sales', 'insert', ?, ?, 0)`,
        params: [
          generateUUID(),
          JSON.stringify({
            id: saleId,
            branch_id: branchId,
            shift_id: payload.shiftId,
            cashier_id: cashierId,
            total_dzd: totalDzd,
            subtotal_dzd: subtotalDzd,
            discount_dzd: discountVal,
            cash_amount_dzd: cashPaid,
            card_amount_dzd: cardPaid,
            payment_method: payload.paymentMethod,
            status: 'completed',
            created_at: now,
          }),
          now,
        ],
      })

      await withTransaction(async (tDb) => {
        for (const op of operations) {
          await tDb.execute(op.sql, op.params)
        }
      })

      return { saleId, totalDzd, itemCount: payload.items.length }
    }
  )


  // ── Void Sale (Derives branch_id from Original Sale) ──
  ipcMain.handle('biz:sales:void', async (_event, saleId: string, reason: string, items: Array<{ variant_id: string; quantity: number }>) => {
    const session = requireAuth()
    requireRole(session, ['admin', 'manager'])
    const db = await whenDatabaseReady()

    if (!reason.trim()) throw new Error('يرجى كتابة سبب الإلغاء')

    // Fetch original sale to derive branch_id
    const sales = await db.query<{ id: string; branch_id: string }>(
      'SELECT id, branch_id FROM sales WHERE id = ?',
      [saleId]
    )
    if (sales.length === 0) throw new Error('الفاتورة غير موجودة')
    const origSale = sales[0]

    // Verify authorized branch access for original sale branch
    validateBranchAccess(session, origSale.branch_id)

    const now = new Date().toISOString()
    const operations: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `UPDATE sales SET status = 'voided', voided_at = ?, void_reason = ?, updated_at = ? WHERE id = ?`,
        params: [now, reason.trim(), now, saleId],
      },
    ]

    for (const item of items) {
      operations.push({
        sql: `INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id, note, created_by, created_at)
              VALUES (?, ?, ?, 'adjustment', ?, ?, ?, ?, ?)`,
        params: [generateUUID(), origSale.branch_id, item.variant_id, item.quantity, saleId, `إلغاء فاتورة (#${saleId.slice(0, 8)}): ${reason.trim()}`, session.userId, now],
      })
    }

    operations.push({
      sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'sale_voided', 'sales', ?, ?, ?)`,
      params: [generateUUID(), session.userId, saleId, `إلغاء الفاتورة #${saleId.slice(0, 8)} — السبب: ${reason.trim()}`, now],
    })

    await withTransaction(async (tDb) => {
      for (const op of operations) {
        await tDb.execute(op.sql, op.params)
      }
    })

    return { success: true }
  })

  // ── Atomic Multi-Item Returns (Unique Row IDs, Authoritative DB Prices, Sale Status Update) ──
  ipcMain.handle('biz:returns:process', async (
    _event,
    payload: {
      originalSaleId: string
      items: Array<{ variantId: string; quantity: number; saleItemId?: string }>
      refundMethod: 'cash' | 'card' | 'store_credit'
      reason?: string
    }
  ) => {
    const session = requireAuth()
    const db = await whenDatabaseReady()

    if (!payload.items || payload.items.length === 0) {
      throw new Error('لم يتم تحديد أي عنصر للإرجاع')
    }

    // 1. Fetch original sale to derive branch_id, shift_id and customer_id
    const sales = await db.query<{ id: string; branch_id: string; shift_id: string | null; customer_id: string | null }>(
      'SELECT id, branch_id, shift_id, customer_id FROM sales WHERE id = ?',
      [payload.originalSaleId]
    )
    if (sales.length === 0) throw new Error('الفاتورة الأصلية غير موجودة')
    const origSale = sales[0]

    // Verify authorized branch access for original sale branch
    validateBranchAccess(session, origSale.branch_id)

    // 2. Fetch authoritative sale_items from DB (NEVER trust renderer unit prices!)
    const origSaleItems = await db.query<SaleItemRecord>(
      'SELECT id, variant_id, quantity, unit_price_dzd FROM sale_items WHERE sale_id = ?',
      [payload.originalSaleId]
    )
    if (origSaleItems.length === 0) throw new Error('لا توجد عناصر في الفاتورة الأصلية')

    // Active shift for current cashier/branch at return processing time
    const activeShiftRows = await db.query<{ id: string }>(
      `SELECT id FROM shifts WHERE branch_id = ? AND cashier_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
      [origSale.branch_id, session.userId]
    )
    const currentShiftId = activeShiftRows[0]?.id ?? null

    if (payload.refundMethod === 'cash' && !currentShiftId) {
      throw new Error('لا توجد وردية مفتوحة للكاشير لتسجيل استرجاع نقدي')
    }

    // Fetch existing returns for this sale to compute remaining returnable quantities per sale_item_id & variant_id
    const origReturns = await db.query<{ sale_item_id: string | null; variant_id: string; total_returned: number }>(
      'SELECT sale_item_id, variant_id, COALESCE(SUM(quantity), 0) as total_returned FROM returns WHERE original_sale_id = ? GROUP BY sale_item_id, variant_id',
      [payload.originalSaleId]
    )

    const explicitReturnedByLine = new Map<string, number>()
    const totalReturnedByVariant = new Map<string, number>()

    for (const r of origReturns) {
      if (r.sale_item_id) {
        explicitReturnedByLine.set(r.sale_item_id, (explicitReturnedByLine.get(r.sale_item_id) ?? 0) + r.total_returned)
      }
      totalReturnedByVariant.set(r.variant_id, (totalReturnedByVariant.get(r.variant_id) ?? 0) + r.total_returned)
    }

    const totalPurchasedByVariant = new Map<string, number>()
    let totalPurchasedQtyAcrossSale = 0
    for (const si of origSaleItems) {
      totalPurchasedQtyAcrossSale += si.quantity
      totalPurchasedByVariant.set(si.variant_id, (totalPurchasedByVariant.get(si.variant_id) ?? 0) + si.quantity)
    }

    // 3. Validate items & compute authoritative refund total
    let totalRefundDzd = 0
    const now = new Date().toISOString()
    const operations: Array<{ sql: string; params: unknown[] }> = []
    const generatedReturnRowIds: string[] = []

    for (const item of payload.items) {
      const dbItem = processReturnItemValidation(item, origSaleItems, explicitReturnedByLine, totalReturnedByVariant, totalPurchasedByVariant)
      const explicitReturnedForLine = explicitReturnedByLine.get(dbItem.id) ?? 0
      const totalReturnedVariant = totalReturnedByVariant.get(dbItem.variant_id) ?? 0

      // Authoritative DB unit price
      const authoritativeUnitPrice = dbItem.unit_price_dzd
      totalRefundDzd += authoritativeUnitPrice * item.quantity

      // Distinct primary key returnRowId per returned item row
      const returnRowId = generateUUID()
      const movementId = generateUUID()
      generatedReturnRowIds.push(returnRowId)

      operations.push(
        {
          sql: `INSERT INTO returns (id, branch_id, shift_id, original_sale_id, sale_item_id, variant_id, quantity, unit_price_dzd, refund_method, reason, processed_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [returnRowId, origSale.branch_id, currentShiftId, payload.originalSaleId, dbItem.id, item.variantId, item.quantity, authoritativeUnitPrice, payload.refundMethod, payload.reason ?? null, session.userId, now],
        },
        {
          sql: `INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id, note, created_by, created_at)
                VALUES (?, ?, ?, 'return', ?, ?, ?, ?, ?)`,
          params: [movementId, origSale.branch_id, item.variantId, item.quantity, returnRowId, `استرجاع (فاتورة #${payload.originalSaleId.slice(0, 8)})`, session.userId, now],
        }
      )

      // Update maps for overall sale status calculation & batch items tracking
      explicitReturnedByLine.set(dbItem.id, explicitReturnedForLine + item.quantity)
      totalReturnedByVariant.set(dbItem.variant_id, totalReturnedVariant + item.quantity)
    }

    // 4. Calculate total returns across whole sale and update sale status (full vs partial refund)
    let totalReturnedAcrossSale = 0
    for (const qty of totalReturnedByVariant.values()) {
      totalReturnedAcrossSale += qty
    }

    const newSaleStatus = totalReturnedAcrossSale >= totalPurchasedQtyAcrossSale ? 'refunded' : 'partial_refund'
    operations.push({
      sql: `UPDATE sales SET status = ?, updated_at = ? WHERE id = ?`,
      params: [newSaleStatus, now, payload.originalSaleId],
    })

    // 5. Store Credit Refund: update customer store_credit_balance in the SAME transaction
    if (payload.refundMethod === 'store_credit' && origSale.customer_id) {
      operations.push({
        sql: `UPDATE customers SET store_credit_balance = COALESCE(store_credit_balance, 0) + ?, updated_at = ? WHERE id = ?`,
        params: [totalRefundDzd, now, origSale.customer_id],
      })
    }

    const batchLogId = generatedReturnRowIds[0] ?? generateUUID()
    operations.push({
      sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'return_processed', 'returns', ?, ?, ?)`,
      params: [generateUUID(), session.userId, batchLogId, `إرجاع ${payload.items.length} منتجات بمبلغ ${totalRefundDzd} دج (${payload.refundMethod})`, now],
    })

    // Execute entire return atomically in ONE database transaction
    await withTransaction(async (tDb) => {
      for (const op of operations) {
        await tDb.execute(op.sql, op.params)
      }
    })

    return { returnId: batchLogId, returnRowIds: generatedReturnRowIds, totalRefundDzd, saleStatus: newSaleStatus }
  })

  // ── Shift Close Authorization & Management ──
  ipcMain.handle('biz:shifts:active', async (_event, targetBranchId?: string) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session, targetBranchId)
    const db = await whenDatabaseReady()

    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM shifts WHERE branch_id = ? AND cashier_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
      [branchId, session.userId]
    )

    return rows[0] ?? null
  })

  ipcMain.handle('biz:shifts:open', async (_event, openingCashDzd: number, targetBranchId?: string) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session, targetBranchId)
    const db = await whenDatabaseReady()

    const existingOpen = await db.query<{ id: string }>(
      `SELECT id FROM shifts WHERE branch_id = ? AND cashier_id = ? AND status = 'open'`,
      [branchId, session.userId]
    )
    if (existingOpen.length > 0) {
      throw new Error('يوجد وردية مفتوحة بالفعل لهذا الكاشير في هذا الفرع')
    }

    const shiftId = generateUUID()
    const now = new Date().toISOString()

    await db.execute(
      `INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at) VALUES (?, ?, ?, ?, 'open', ?)`,
      [shiftId, branchId, session.userId, openingCashDzd, now]
    )

    return { id: shiftId, branch_id: branchId, cashier_id: session.userId, opening_cash_dzd: openingCashDzd, status: 'open', opened_at: now }
  })

  ipcMain.handle('biz:shifts:summary', async (_event, shiftId: string) => {
    const session = requireAuth()
    const db = await whenDatabaseReady()

    const shifts = await db.query<{ id: string; cashier_id: string; branch_id: string; opening_cash_dzd: number }>(
      `SELECT id, cashier_id, branch_id, opening_cash_dzd FROM shifts WHERE id = ? AND status = 'open'`,
      [shiftId]
    )
    if (shifts.length === 0) throw new Error('الوردية غير موجودة أو مغلقة بالفعل')

    const targetShift = shifts[0]

    if (session.role === 'cashier' && targetShift.cashier_id !== session.userId) {
      throw new Error('Forbidden: Cashiers can only view summary for their own shift')
    }

    validateBranchAccess(session, targetShift.branch_id)

    const openingCash = targetShift.opening_cash_dzd || 0

    const salesRows = await db.query<{ cash_total: number | null; card_total: number | null }>(
      `SELECT
         COALESCE(SUM(cash_amount_dzd), 0) as cash_total,
         COALESCE(SUM(card_amount_dzd), 0) as card_total
       FROM sales
       WHERE shift_id = ? AND status != 'voided'`,
      [shiftId]
    )
    const cashSales = salesRows[0]?.cash_total ?? 0
    const cardSales = salesRows[0]?.card_total ?? 0

    const repaymentRows = await db.query<{ repayments_total: number | null }>(
      `SELECT COALESCE(SUM(amount_dzd), 0) as repayments_total
       FROM customer_payments
       WHERE shift_id = ? AND payment_method = 'cash'`,
      [shiftId]
    )
    const cashRepayments = repaymentRows[0]?.repayments_total ?? 0

    const returnRows = await db.query<{ refunds_total: number | null }>(
      `SELECT COALESCE(SUM(quantity * unit_price_dzd), 0) as refunds_total
       FROM returns
       WHERE shift_id = ? AND refund_method = 'cash'`,
      [shiftId]
    )
    const cashRefunds = returnRows[0]?.refunds_total ?? 0

    const expectedCash = openingCash + cashSales + cashRepayments - cashRefunds

    return {
      openingCash,
      cashSales,
      cardSales,
      cashRepayments,
      cashRefunds,
      expectedCash,
    }
  })

  ipcMain.handle('biz:shifts:close', async (_event, shiftId: string, closingCashDzd: number) => {
    const session = requireAuth()
    const db = await whenDatabaseReady()

    const shifts = await db.query<{ id: string; cashier_id: string; branch_id: string; opening_cash_dzd: number }>(
      `SELECT id, cashier_id, branch_id, opening_cash_dzd FROM shifts WHERE id = ? AND status = 'open'`,
      [shiftId]
    )
    if (shifts.length === 0) throw new Error('الوردية غير موجودة أو مغلقة بالفعل')

    const targetShift = shifts[0]

    // Cashier can close ONLY their own shift
    if (session.role === 'cashier' && targetShift.cashier_id !== session.userId) {
      throw new Error('Forbidden: Cashiers can only close their own shift')
    }

    // Manager/Admin can close another cashier's shift ONLY if authorized for the shift's branch
    validateBranchAccess(session, targetShift.branch_id)

    const openingCash = targetShift.opening_cash_dzd
    const salesRows = await db.query<{ total_cash_sales: number | null }>(
      `SELECT SUM(cash_amount_dzd) as total_cash_sales FROM sales WHERE shift_id = ? AND status != 'voided'`,
      [shiftId]
    )
    const totalCashSales = salesRows[0]?.total_cash_sales ?? 0

    const repaymentRows = await db.query<{ total_repayments: number | null }>(
      `SELECT SUM(amount_dzd) as total_repayments FROM customer_payments WHERE shift_id = ? AND payment_method = 'cash'`,
      [shiftId]
    )
    const totalRepayments = repaymentRows[0]?.total_repayments ?? 0

    const returnRows = await db.query<{ total_cash_refunds: number | null }>(
      `SELECT SUM(quantity * unit_price_dzd) as total_cash_refunds
       FROM returns
       WHERE shift_id = ? AND refund_method = 'cash'`,
      [shiftId]
    )
    const totalCashRefunds = returnRows[0]?.total_cash_refunds ?? 0

    const expectedCash = openingCash + totalCashSales + totalRepayments - totalCashRefunds
    const difference = closingCashDzd - expectedCash
    const now = new Date().toISOString()

    await db.execute(
      `UPDATE shifts SET expected_cash_dzd = ?, closing_cash_dzd = ?, difference_dzd = ?, status = 'closed', closed_at = ? WHERE id = ?`,
      [expectedCash, closingCashDzd, difference, now, shiftId]
    )

    return { expectedCash, difference }
  })


  // ── Users & Branches (Admin Only) ──
  ipcMain.handle('biz:users:list', async () => {
    const session = requireAuth()
    requireRole(session, ['admin'])
    const db = await whenDatabaseReady()

    return db.query(
      `SELECT u.id, u.branch_id, u.full_name, u.role, u.created_at, u.updated_at, u.deleted_at, b.name as branch_name
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.deleted_at IS NULL ORDER BY u.created_at ASC`
    )
  })

  ipcMain.handle('biz:branches:list', async () => {
    requireAuth()
    const db = await whenDatabaseReady()
    return db.query(`SELECT * FROM branches WHERE deleted_at IS NULL ORDER BY created_at ASC`)
  })

  // ── Customer Debt Repayment ──
  ipcMain.handle('biz:customers:recordPayment', async (_event, payload: { customerId: string; amountDzd: number; paymentMethod: 'cash' | 'card'; notes?: string; shiftId?: string }) => {
    const session = requireAuth()
    const branchId = session.branchId
    const db = await whenDatabaseReady()

    const paymentId = generateUUID()
    const now = new Date().toISOString()

    await db.execute(
      `INSERT INTO customer_payments (id, branch_id, shift_id, customer_id, sale_id, amount_dzd, payment_method, notes, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      [paymentId, branchId, payload.shiftId ?? null, payload.customerId, payload.amountDzd, payload.paymentMethod, payload.notes ?? null, now]
    )

    return { paymentId }
  })

  // ── Settings (Admin Only) ──
  ipcMain.handle('biz:settings:load', async () => {
    const session = requireAuth()
    const db = await whenDatabaseReady()

    const rows = await db.query(
      `SELECT * FROM store_settings WHERE branch_id = ? LIMIT 1`,
      [session.branchId]
    )
    return rows[0] ?? null
  })

  ipcMain.handle('biz:settings:save', async (_event, settings: Record<string, unknown>) => {
    const session = requireAuth()
    requireRole(session, ['admin'])
    const db = await whenDatabaseReady()
    const branchId = session.branchId
    const now = new Date().toISOString()

    const fields = Object.keys(settings).filter((k) => k !== 'branch_id' && k !== 'updated_at')
    const setClause = fields.map((f) => `${f} = ?`).join(', ')
    const values = fields.map((f) => settings[f])

    await db.execute(
      `UPDATE store_settings SET ${setClause}, updated_at = ? WHERE branch_id = ?`,
      [...values, now, branchId]
    )

    return { success: true }
  })

  // ── Catalog & Inventory Management (Phase 2C-2) ──

  // 1. Create product with variant matrix & initial stock
  ipcMain.handle('biz:products:create', async (_event, input: {
    name: string
    category_id: string | null
    description: string | null
    price_dzd: number
    cost_dzd: number | null
    image_url?: string | null
    variants: Array<{
      size: string | null
      color: string | null
      barcode: string
      sku: string | null
      price_dzd: number | null
      initial_stock: number
    }>
  }) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session)
    requireRole(session, ['admin', 'manager'])

    if (!input.name || !input.name.trim()) {
      throw new Error('يرجى إدخال اسم المنتج')
    }
    if (!input.variants || input.variants.length === 0) {
      throw new Error('يرجى إضافة خيار (Variant) واحد على الأقل للمنتج')
    }
    const barcodes = input.variants.map((v) => v.barcode.trim())
    if (barcodes.length !== new Set(barcodes).size) {
      throw new Error('يوجد مكرر في الباركود المدخل ضمن الخيارات')
    }
    for (const v of input.variants) {
      const cleanBarcode = v.barcode.trim()
      if (!cleanBarcode) {
        throw new Error('يرجى إدخال رمز الباركود لكل خيار')
      }
      if (cleanBarcode.length > 256) {
        throw new Error('رمز الباركود طويل جداً (الحد الأقصى 256 حرف)')
      }
    }

    const productId = generateUUID()
    const now = new Date().toISOString()
    const variantIds: string[] = []
    const operations: Array<{ sql: string; params: unknown[] }> = []

    operations.push({
      sql: `INSERT INTO products
            (id, branch_id, category_id, name, description, image_url, price_dzd, cost_dzd, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        productId,
        branchId,
        input.category_id,
        input.name.trim(),
        input.description ? input.description.trim() : null,
        input.image_url || null,
        input.price_dzd,
        input.cost_dzd,
        now,
        now,
      ],
    })

    for (const v of input.variants) {
      const variantId = generateUUID()
      variantIds.push(variantId)
      const movementId = generateUUID()

      operations.push({
        sql: `INSERT INTO product_variants
              (id, product_id, branch_id, size, color, barcode, sku, price_dzd, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          variantId,
          productId,
          branchId,
          v.size ? v.size.trim() : null,
          v.color ? v.color.trim() : null,
          v.barcode.trim(),
          v.sku ? v.sku.trim() : null,
          v.price_dzd,
          now,
          now,
        ],
      })

      if (v.initial_stock > 0) {
        operations.push({
          sql: `INSERT INTO stock_movements
                (id, branch_id, variant_id, type, quantity_change, note, created_by, created_at)
                VALUES (?, ?, ?, 'restock', ?, 'مخزون أولي عند إضافة المنتج', ?, ?)`,
          params: [
            movementId,
            branchId,
            variantId,
            v.initial_stock,
            session.userId,
            now,
          ],
        })
      }
    }

    operations.push({
      sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'product_created', 'products', ?, ?, ?)`,
      params: [generateUUID(), session.userId, productId, `إضافة المنتج: ${input.name.trim()}`, now],
    })

    operations.push({
      sql: `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, 'products', 'insert', ?, ?, 0)`,
      params: [generateUUID(), JSON.stringify({ id: productId, name: input.name.trim(), branch_id: branchId }), now],
    })

    await withTransaction(async (db) => {
      for (const op of operations) {
        await db.execute(op.sql, op.params)
      }
    })

    return { productId, variantIds }
  })

  // 2. Update product header
  ipcMain.handle('biz:products:update', async (_event, input: {
    id: string
    name: string
    description?: string | null
    price_dzd: number
    cost_dzd?: number | null
    image_url?: string | null
    category_id?: string | null
  }) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session)
    requireRole(session, ['admin', 'manager'])

    if (!input.id || !input.name.trim()) {
      throw new Error('يرجى تحديد المنتج وإدخال الاسم')
    }

    const now = new Date().toISOString()
    const operations: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `UPDATE products SET name = ?, description = ?, price_dzd = ?, cost_dzd = ?, image_url = ?, category_id = ?, updated_at = ? WHERE id = ? AND branch_id = ?`,
        params: [
          input.name.trim(),
          input.description ? input.description.trim() : null,
          input.price_dzd,
          input.cost_dzd ?? null,
          input.image_url ?? null,
          input.category_id ?? null,
          now,
          input.id,
          branchId,
        ],
      },
      {
        sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'product_updated', 'products', ?, ?, ?)`,
        params: [generateUUID(), session.userId, input.id, `تعديل المنتج: ${input.name.trim()}`, now],
      },
      {
        sql: `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, 'products', 'update', ?, ?, 0)`,
        params: [generateUUID(), JSON.stringify({ id: input.id, name: input.name.trim(), branch_id: branchId }), now],
      },
    ]

    await withTransaction(async (db) => {
      for (const op of operations) {
        await db.execute(op.sql, op.params)
      }
    })

    return { success: true }
  })

  // 3. Delete product (soft delete product & variants)
  ipcMain.handle('biz:products:delete', async (_event, productId: string) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session)
    requireRole(session, ['admin', 'manager'])

    if (!productId) throw new Error('يرجى تحديد المنتج للحذف')

    const now = new Date().toISOString()
    const operations: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `UPDATE products SET deleted_at = ?, updated_at = ? WHERE id = ? AND branch_id = ?`,
        params: [now, now, productId, branchId],
      },
      {
        sql: `UPDATE product_variants SET deleted_at = ? WHERE product_id = ? AND branch_id = ?`,
        params: [now, productId, branchId],
      },
      {
        sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'product_deleted', 'products', ?, ?, ?)`,
        params: [generateUUID(), session.userId, productId, `حذف المنتج: ${productId}`, now],
      },
      {
        sql: `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, 'products', 'delete', ?, ?, 0)`,
        params: [generateUUID(), JSON.stringify({ id: productId, deleted_at: now, branch_id: branchId }), now],
      },
    ]

    await withTransaction(async (db) => {
      for (const op of operations) {
        await db.execute(op.sql, op.params)
      }
    })

    return { success: true }
  })

  // 4. Add single variant
  ipcMain.handle('biz:products:addVariant', async (_event, input: {
    productId: string
    size: string | null
    color: string | null
    barcode: string | null
    priceDzd: number | null
  }) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session)
    requireRole(session, ['admin', 'manager'])

    if (!input.productId) throw new Error('يرجى تحديد المنتج')

    const variantId = generateUUID()
    const now = new Date().toISOString()

    const operations: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `INSERT INTO product_variants (id, product_id, branch_id, size, color, barcode, price_dzd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          variantId,
          input.productId,
          branchId,
          input.size ? input.size.trim() : null,
          input.color ? input.color.trim() : null,
          input.barcode ? input.barcode.trim() : null,
          input.priceDzd ?? null,
          now,
          now,
        ],
      },
      {
        sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'variant_added', 'product_variants', ?, ?, ?)`,
        params: [generateUUID(), session.userId, variantId, `إضافة خيار جديد للمنتج: ${input.productId}`, now],
      },
      {
        sql: `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, 'product_variants', 'insert', ?, ?, 0)`,
        params: [generateUUID(), JSON.stringify({ id: variantId, product_id: input.productId, branch_id: branchId }), now],
      },
    ]

    await withTransaction(async (db) => {
      for (const op of operations) {
        await db.execute(op.sql, op.params)
      }
    })

    return { variantId }
  })

  // 5. Bulk price adjustment
  ipcMain.handle('biz:products:bulkUpdatePrice', async (_event, input: {
    bulkCatId?: string
    bulkAdjustmentType: 'percent' | 'fixed'
    bulkAdjustmentVal: number
  }) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session)
    requireRole(session, ['admin', 'manager'])

    if (input.bulkAdjustmentVal === 0) {
      throw new Error('يرجى إدخال قيمة التعديل')
    }

    const now = new Date().toISOString()
    let updateSql = ''
    const params: unknown[] = []

    if (input.bulkCatId) {
      if (input.bulkAdjustmentType === 'percent') {
        const factor = 1 + input.bulkAdjustmentVal / 100.0
        updateSql = `UPDATE products SET price_dzd = ROUND(price_dzd * ?, 2), updated_at = ? WHERE deleted_at IS NULL AND category_id = ? AND branch_id = ?`
        params.push(factor, now, input.bulkCatId, branchId)
      } else {
        updateSql = `UPDATE products SET price_dzd = MAX(0, price_dzd + ?), updated_at = ? WHERE deleted_at IS NULL AND category_id = ? AND branch_id = ?`
        params.push(input.bulkAdjustmentVal, now, input.bulkCatId, branchId)
      }
    } else {
      if (input.bulkAdjustmentType === 'percent') {
        const factor = 1 + input.bulkAdjustmentVal / 100.0
        updateSql = `UPDATE products SET price_dzd = ROUND(price_dzd * ?, 2), updated_at = ? WHERE deleted_at IS NULL AND branch_id = ?`
        params.push(factor, now, branchId)
      } else {
        updateSql = `UPDATE products SET price_dzd = MAX(0, price_dzd + ?), updated_at = ? WHERE deleted_at IS NULL AND branch_id = ?`
        params.push(input.bulkAdjustmentVal, now, branchId)
      }
    }

    const operations: Array<{ sql: string; params: unknown[] }> = [
      { sql: updateSql, params },
      {
        sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'bulk_price_updated', 'products', ?, ?, ?)`,
        params: [generateUUID(), session.userId, branchId, `تعديل جماعي للأسعار (${input.bulkAdjustmentType}: ${input.bulkAdjustmentVal})`, now],
      },
      {
        sql: `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, 'products', 'bulk_update', ?, ?, 0)`,
        params: [generateUUID(), JSON.stringify({ branch_id: branchId, type: input.bulkAdjustmentType, val: input.bulkAdjustmentVal }), now],
      },
    ]

    await withTransaction(async (db) => {
      for (const op of operations) {
        await db.execute(op.sql, op.params)
      }
    })

    return { success: true }
  })

  // 6. CSV Bulk Product Import
  ipcMain.handle('biz:products:importCsv', async (_event, csvContent: string) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session)
    requireRole(session, ['admin', 'manager'])

    if (!csvContent || !csvContent.trim()) {
      throw new Error('ملف CSV فارغ أو لا يحتوي على بيانات')
    }

    const lines = csvContent.split('\n').filter((l) => l.trim())
    if (lines.length <= 1) {
      throw new Error('ملف CSV فارغ أو لا يحتوي على بيانات')
    }

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
    const nameIdx = header.findIndex((h) => h.includes('name') || h.includes('اسم') || h.includes('منتج'))
    const priceIdx = header.findIndex((h) => h.includes('price') || h.includes('سعر'))
    if (nameIdx === -1 || priceIdx === -1) {
      throw new Error('يجب أن يحتوي ملف CSV على عمود اسم المنتج (Name) وسعر البيع (Price)')
    }
    const costIdx = header.findIndex((h) => h.includes('cost') || h.includes('تكلفة'))
    const categoryIdx = header.findIndex((h) => h.includes('category') || h.includes('فئة'))
    const sizeIdx = header.findIndex((h) => h.includes('size') || h.includes('مقاس'))
    const colorIdx = header.findIndex((h) => h.includes('color') || h.includes('لون'))
    const barcodeIdx = header.findIndex((h) => h.includes('barcode') || h.includes('باركود'))
    const stockIdx = header.findIndex((h) => h.includes('stock') || h.includes('مخزون') || h.includes('كمية'))

    const db = await whenDatabaseReady()
    const catRows = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM categories WHERE (branch_id = ? OR branch_id IS NULL) AND deleted_at IS NULL',
      [branchId]
    )
    const categoryMap = new Map<string, string>()
    for (const c of catRows) {
      categoryMap.set(c.name.toLowerCase(), c.id)
    }

    const prodRows = await db.query<{ id: string; name: string; category_id: string | null }>(
      'SELECT id, name, category_id FROM products WHERE branch_id = ? AND deleted_at IS NULL',
      [branchId]
    )
    const productMap = new Map<string, string>()
    for (const p of prodRows) {
      productMap.set(`${p.name.toLowerCase()}_${p.category_id ?? ''}`, p.id)
    }

    const now = new Date().toISOString()
    const operations: Array<{ sql: string; params: unknown[] }> = []
    let importedCount = 0

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      const productName = cols[nameIdx]?.trim()
      const priceDzd = Number.parseFloat(cols[priceIdx]) || 0
      if (!productName || priceDzd <= 0) continue

      const categoryName = categoryIdx !== -1 ? cols[categoryIdx]?.trim() : undefined
      const costDzd = costIdx !== -1 ? Number.parseFloat(cols[costIdx]) || 0 : 0
      const size = sizeIdx !== -1 ? cols[sizeIdx]?.trim() || null : null
      const color = colorIdx !== -1 ? cols[colorIdx]?.trim() || null : null
      const barcode = barcodeIdx !== -1 ? cols[barcodeIdx]?.trim() || null : null
      const stock = stockIdx !== -1 ? Number.parseInt(cols[stockIdx], 10) || 0 : 0

      let categoryId: string | null = null
      if (categoryName) {
        const catLower = categoryName.toLowerCase()
        if (categoryMap.has(catLower)) {
          categoryId = categoryMap.get(catLower)!
        } else {
          categoryId = generateUUID()
          operations.push({
            sql: `INSERT INTO categories (id, branch_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
            params: [categoryId, branchId, categoryName, now, now],
          })
          categoryMap.set(catLower, categoryId)
        }
      }

      const prodKey = `${productName.toLowerCase()}_${categoryId ?? ''}`
      let productId: string
      if (productMap.has(prodKey)) {
        productId = productMap.get(prodKey)!
      } else {
        productId = generateUUID()
        productMap.set(prodKey, productId)
        operations.push({
          sql: `INSERT INTO products (id, branch_id, category_id, name, price_dzd, cost_dzd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [productId, branchId, categoryId, productName, priceDzd, costDzd, now, now],
        })
      }

      const variantId = generateUUID()
      operations.push({
        sql: `INSERT INTO product_variants (id, product_id, branch_id, size, color, barcode, price_dzd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [variantId, productId, branchId, size, color, barcode, priceDzd, now, now],
      })

      if (stock > 0) {
        operations.push({
          sql: `INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note, created_at) VALUES (?, ?, ?, 'restock', ?, 'استيراد أولي من ملف CSV', ?)`,
          params: [generateUUID(), branchId, variantId, stock, now],
        })
      }

      importedCount++
    }

    if (operations.length > 0) {
      operations.push({
        sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'csv_imported', 'products', ?, ?, ?)`,
        params: [generateUUID(), session.userId, branchId, `استيراد ${importedCount} منتجات من ملف CSV`, now],
      })

      operations.push({
        sql: `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, 'products', 'csv_import', ?, ?, 0)`,
        params: [generateUUID(), JSON.stringify({ branch_id: branchId, count: importedCount }), now],
      })

      await withTransaction(async (db) => {
        for (const op of operations) {
          await db.execute(op.sql, op.params)
        }
      })
    }

    return { importedCount }
  })

  // 7. Stock Adjustment / Movement Recording
  ipcMain.handle('biz:inventory:adjustStock', async (_event, input: {
    variantId: string
    type: 'restock' | 'adjustment'
    quantityChange: number
    note: string
  }) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session)
    requireRole(session, ['admin', 'manager'])

    if (!input.variantId) throw new Error('يرجى تحديد الخيار')
    if (!input.quantityChange || input.quantityChange === 0) {
      throw new Error('يرجى تحديد كمية التعديل')
    }

    const movementId = generateUUID()
    const now = new Date().toISOString()
    const operations: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `INSERT INTO stock_movements
              (id, branch_id, variant_id, type, quantity_change, note, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          movementId,
          branchId,
          input.variantId,
          input.type,
          input.quantityChange,
          input.note.trim() || 'تعديل مخزون يدوياً',
          session.userId,
          now,
        ],
      },
      {
        sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'stock_adjusted', 'stock_movements', ?, ?, ?)`,
        params: [generateUUID(), session.userId, movementId, `تعديل المخزون (${input.type}: ${input.quantityChange})`, now],
      },
      {
        sql: `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, 'stock_movements', 'insert', ?, ?, 0)`,
        params: [generateUUID(), JSON.stringify({ id: movementId, variant_id: input.variantId, quantity_change: input.quantityChange }), now],
      },
    ]

    await withTransaction(async (db) => {
      for (const op of operations) {
        await db.execute(op.sql, op.params)
      }
    })

    return { success: true }
  })

  // 8. Categories CRUD Management
  ipcMain.handle('biz:categories:manage', async (_event, input: {
    action: 'create' | 'update' | 'delete'
    id?: string
    name?: string
  }) => {
    const session = requireAuth()
    const branchId = validateBranchAccess(session)
    requireRole(session, ['admin', 'manager'])

    const now = new Date().toISOString()
    const operations: Array<{ sql: string; params: unknown[] }> = []
    let categoryId = input.id

    if (input.action === 'create') {
      if (!input.name || !input.name.trim()) throw new Error('يرجى إدخال اسم الفئة')
      categoryId = generateUUID()
      operations.push({
        sql: `INSERT INTO categories (id, branch_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        params: [categoryId, branchId, input.name.trim(), now, now],
      })
      operations.push({
        sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'category_created', 'categories', ?, ?, ?)`,
        params: [generateUUID(), session.userId, categoryId, `إضافة الفئة: ${input.name.trim()}`, now],
      })
    } else if (input.action === 'update') {
      if (!input.id || !input.name || !input.name.trim()) throw new Error('يرجى تحديد الفئة وإدخال الاسم الجديد')
      operations.push({
        sql: `UPDATE categories SET name = ?, updated_at = ? WHERE id = ? AND (branch_id = ? OR branch_id IS NULL)`,
        params: [input.name.trim(), now, input.id, branchId],
      })
      operations.push({
        sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'category_updated', 'categories', ?, ?, ?)`,
        params: [generateUUID(), session.userId, input.id, `تعديل الفئة: ${input.name.trim()}`, now],
      })
    } else if (input.action === 'delete') {
      if (!input.id) throw new Error('يرجى تحديد الفئة للحذف')
      operations.push({
        sql: `UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ? AND (branch_id = ? OR branch_id IS NULL)`,
        params: [now, now, input.id, branchId],
      })
      operations.push({
        sql: `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details, created_at) VALUES (?, ?, 'category_deleted', 'categories', ?, ?, ?)`,
        params: [generateUUID(), session.userId, input.id, `حذف الفئة: ${input.id}`, now],
      })
    }

    operations.push({
      sql: `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, attempts) VALUES (?, 'categories', ?, ?, ?, 0)`,
      params: [generateUUID(), input.action, JSON.stringify({ id: categoryId, name: input.name, branch_id: branchId }), now],
    })

    await withTransaction(async (db) => {
      for (const op of operations) {
        await db.execute(op.sql, op.params)
      }
    })

    return { categoryId, success: true }
  })
}
