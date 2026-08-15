import { ipcMain } from 'electron'
import { whenDatabaseReady, withTransaction } from './database'
import { requireAuth, requireRole, validateBranchAccess } from './session'
import type { PaymentMethod } from '../renderer/src/types/database'

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
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

      if (payload.paymentMethod === 'credit' && !payload.customerId) {
        throw new Error('يجب تحديد الزبون عند البيع بالتقسيط / الكريدي')
      }

      // 1. DB Stock Check
      for (const item of payload.items) {
        if (item.variant_id.startsWith('v-custom-')) continue
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
      } else if (payload.paymentMethod === 'card') {
        cardPaid = totalDzd
      } else if (payload.paymentMethod === 'mixed') {
        cashPaid = payload.mixedCashDzd ?? totalDzd / 2
        cardPaid = payload.mixedCardDzd ?? totalDzd / 2
      } else if (payload.paymentMethod === 'credit') {
        paidAmountDzd = Math.min(totalDzd, Math.max(0, payload.creditDepositDzd ?? 0))
        remainingDebtDzd = totalDzd - paidAmountDzd
        cashPaid = paidAmountDzd
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

        operations.push({
          sql: `INSERT INTO sale_items (id, sale_id, variant_id, quantity, unit_price_dzd, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          params: [saleItemId, saleId, item.variant_id, item.quantity, item.unit_price_dzd, now],
        })

        if (!item.variant_id.startsWith('v-custom-')) {
          operations.push({
            sql: `INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id, note, created_by, created_at)
                  VALUES (?, ?, ?, 'sale', ?, ?, 'عملية بيع كاشير', ?, ?)`,
            params: [movementId, branchId, item.variant_id, -item.quantity, saleId, cashierId, now],
          })
        }
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

      await withTransaction(async (tDb) => {
        for (const op of operations) {
          await tDb.execute(op.sql, op.params)
        }
      })

      return { saleId, totalDzd, itemCount: payload.items.length }
    }
  )

  // ── Void Sale ──
  ipcMain.handle('biz:sales:void', async (_event, saleId: string, reason: string, items: Array<{ variant_id: string; quantity: number }>) => {
    const session = requireAuth()
    requireRole(session, ['admin', 'manager'])
    const branchId = session.branchId

    if (!reason.trim()) throw new Error('يرجى كتابة سبب الإلغاء')

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
        params: [generateUUID(), branchId, item.variant_id, item.quantity, saleId, `إلغاء فاتورة (#${saleId.slice(0, 8)}): ${reason.trim()}`, session.userId, now],
      })
    }

    await withTransaction(async (tDb) => {
      for (const op of operations) {
        await tDb.execute(op.sql, op.params)
      }
    })

    return { success: true }
  })

  // ── Returns ──
  ipcMain.handle('biz:returns:process', async (_event, payload: { originalSaleId: string; variantId: string; quantity: number; refundMethod: string; reason?: string }) => {
    const session = requireAuth()
    const branchId = session.branchId
    const now = new Date().toISOString()

    const returnId = generateUUID()
    const movementId = generateUUID()

    const operations: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `INSERT INTO returns (id, branch_id, original_sale_id, variant_id, quantity, refund_method, reason, processed_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [returnId, branchId, payload.originalSaleId, payload.variantId, payload.quantity, payload.refundMethod, payload.reason ?? null, session.userId, now],
      },
      {
        sql: `INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, reference_id, note, created_by, created_at)
              VALUES (?, ?, ?, 'return', ?, ?, ?, ?, ?)`,
        params: [movementId, branchId, payload.variantId, payload.quantity, returnId, `استرجاع (فاتورة #${payload.originalSaleId.slice(0, 8)})`, session.userId, now],
      },
    ]

    await withTransaction(async (tDb) => {
      for (const op of operations) {
        await tDb.execute(op.sql, op.params)
      }
    })

    return { returnId }
  })

  // ── Shifts ──
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

    const shiftId = generateUUID()
    const now = new Date().toISOString()

    await db.execute(
      `INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at) VALUES (?, ?, ?, ?, 'open', ?)`,
      [shiftId, branchId, session.userId, openingCashDzd, now]
    )

    return { id: shiftId, branch_id: branchId, cashier_id: session.userId, opening_cash_dzd: openingCashDzd, status: 'open', opened_at: now }
  })

  ipcMain.handle('biz:shifts:close', async (_event, shiftId: string, closingCashDzd: number) => {
    requireAuth()
    const db = await whenDatabaseReady()

    const shifts = await db.query<{ opening_cash_dzd: number; branch_id: string }>(
      `SELECT opening_cash_dzd, branch_id FROM shifts WHERE id = ? AND status = 'open'`,
      [shiftId]
    )
    if (shifts.length === 0) throw new Error('الوردية غير موجودة أو مغلقة بالفعل')

    const openingCash = shifts[0].opening_cash_dzd
    const salesRows = await db.query<{ total_cash_sales: number | null }>(
      `SELECT SUM(cash_amount_dzd) as total_cash_sales FROM sales WHERE shift_id = ? AND status = 'completed'`,
      [shiftId]
    )
    const totalCashSales = salesRows[0]?.total_cash_sales ?? 0

    const repaymentRows = await db.query<{ total_repayments: number | null }>(
      `SELECT SUM(amount_dzd) as total_repayments FROM customer_payments WHERE shift_id = ? AND payment_method = 'cash'`,
      [shiftId]
    )
    const totalRepayments = repaymentRows[0]?.total_repayments ?? 0

    const expectedCash = openingCash + totalCashSales + totalRepayments
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
}
