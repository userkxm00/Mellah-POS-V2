import { create } from 'zustand'
import type { Shift } from '@/types/database'
import { generateUUID } from '@/lib/uuid'
import { logger } from '@/lib/logger'

// Seeded branch and cashier IDs for Phase 2
export const DEFAULT_BRANCH_ID = 'b1111111-1111-4111-8111-111111111111'
export const DEFAULT_CASHIER_ID = 'u2222222-2222-4222-8222-222222222222' // محمد الكاشير

interface ShiftState {
  activeShift: Shift | null
  isLoading: boolean
  error: string | null
  fetchActiveShift: () => Promise<Shift | null>
  openShift: (openingCashDzd: number) => Promise<Shift>
  closeShift: (closingCashDzd: number) => Promise<{
    closedShift: Shift
    expectedCash: number
    difference: number
  }>
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  activeShift: null,
  isLoading: false,
  error: null,

  fetchActiveShift: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await window.electron.db.query<Shift>(
        `SELECT * FROM shifts 
         WHERE branch_id = ? AND cashier_id = ? AND status = 'open' 
         ORDER BY opened_at DESC LIMIT 1`,
        [DEFAULT_BRANCH_ID, DEFAULT_CASHIER_ID]
      )

      const shift = rows.length > 0 ? rows[0] : null
      set({ activeShift: shift, isLoading: false })
      return shift
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل في جلب وردية العمل'
      logger.error('Fetch active shift failed', err)
      set({ error: msg, isLoading: false })
      return null
    }
  },

  openShift: async (openingCashDzd: number) => {
    set({ isLoading: true, error: null })
    try {
      const id = generateUUID()
      const now = new Date().toISOString()

      await window.electron.db.execute(
        `INSERT INTO shifts 
         (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at) 
         VALUES (?, ?, ?, ?, 'open', ?)`,
        [id, DEFAULT_BRANCH_ID, DEFAULT_CASHIER_ID, openingCashDzd, now]
      )

      const newShift: Shift = {
        id,
        branch_id: DEFAULT_BRANCH_ID,
        cashier_id: DEFAULT_CASHIER_ID,
        opening_cash_dzd: openingCashDzd,
        expected_cash_dzd: null,
        closing_cash_dzd: null,
        difference_dzd: null,
        status: 'open',
        opened_at: now,
        closed_at: null,
      }

      set({ activeShift: newShift, isLoading: false })
      logger.info('Shift opened successfully', { id, openingCashDzd })
      return newShift
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل في فتح الوردية'
      logger.error('Open shift failed', err)
      set({ error: msg, isLoading: false })
      throw new Error(msg)
    }
  },

  closeShift: async (closingCashDzd: number) => {
    const currentShift = get().activeShift
    if (!currentShift) {
      throw new Error('لا توجد وردية مفتوحة لإغلاقها')
    }

    set({ isLoading: true, error: null })
    try {
      // 1. Calculate cash sales for this shift
      const salesRows = await window.electron.db.query<{ total_cash_sales: number | null }>(
        `SELECT SUM(total_dzd) as total_cash_sales 
         FROM sales 
         WHERE shift_id = ? AND payment_method IN ('cash', 'mixed') AND status = 'completed'`,
        [currentShift.id]
      )

      const cashSalesTotal = salesRows[0]?.total_cash_sales ?? 0

      // 2. Expected cash = Opening cash + Cash Sales
      const expectedCash = currentShift.opening_cash_dzd + cashSalesTotal

      // 3. Difference = Closing cash - Expected cash
      const difference = closingCashDzd - expectedCash
      const now = new Date().toISOString()

      // 4. Update shift in DB
      await window.electron.db.execute(
        `UPDATE shifts 
         SET expected_cash_dzd = ?, closing_cash_dzd = ?, difference_dzd = ?, status = 'closed', closed_at = ? 
         WHERE id = ?`,
        [expectedCash, closingCashDzd, difference, now, currentShift.id]
      )

      const closedShift: Shift = {
        ...currentShift,
        expected_cash_dzd: expectedCash,
        closing_cash_dzd: closingCashDzd,
        difference_dzd: difference,
        status: 'closed',
        closed_at: now,
      }

      set({ activeShift: null, isLoading: false })
      logger.info('Shift closed successfully', { id: currentShift.id, expectedCash, closingCashDzd, difference })

      return { closedShift, expectedCash, difference }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل في إغلاق الوردية'
      logger.error('Close shift failed', err)
      set({ error: msg, isLoading: false })
      throw new Error(msg)
    }
  },
}))
