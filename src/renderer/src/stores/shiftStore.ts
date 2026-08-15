import { create } from 'zustand'
import type { Shift } from '@/types/database'
import { generateUUID } from '@/lib/uuid'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/stores/authStore'
import { sendShiftOpenedTelegramNotification } from '@/services/telegramService'

export const DEFAULT_BRANCH_ID = 'b1111111-1111-4111-8111-111111111111'
export const DEFAULT_CASHIER_ID = 'u2222222-2222-4222-8222-222222222222'

export interface ShiftState {
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

export function getActiveUserAndBranch(): { cashierId: string; branchId: string } {
  const user = useAuthStore.getState().currentUser
  const branch = useAuthStore.getState().currentBranch
  return {
    cashierId: user?.id ?? DEFAULT_CASHIER_ID,
    branchId: branch?.id ?? DEFAULT_BRANCH_ID,
  }
}

export const useShiftStore = create<ShiftState>((set) => ({
  activeShift: null,
  isLoading: false,
  error: null,

  fetchActiveShift: async () => {
    set({ isLoading: true, error: null })
    try {
      if (window.electron?.biz?.shifts?.active) {
        const shift = (await window.electron.biz.shifts.active()) as Shift | null
        set({ activeShift: shift, isLoading: false })
        return shift
      }

      const { cashierId, branchId } = getActiveUserAndBranch()
      const rows = await window.electron.db.query<Shift>(
        `SELECT * FROM shifts 
         WHERE branch_id = ? AND cashier_id = ? AND status = 'open' 
         ORDER BY opened_at DESC LIMIT 1`,
        [branchId, cashierId]
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
      if (window.electron?.biz?.shifts?.open) {
        const newShift = (await window.electron.biz.shifts.open(openingCashDzd)) as Shift
        set({ activeShift: newShift, isLoading: false })
        logger.info('Shift opened successfully via Main process IPC', { openingCashDzd })
        return newShift
      }

      const { cashierId, branchId } = getActiveUserAndBranch()
      const existing = await window.electron.db.query<Shift>(
        `SELECT * FROM shifts WHERE branch_id = ? AND cashier_id = ? AND status = 'open'`,
        [branchId, cashierId]
      )

      if (existing.length > 0) {
        set({ activeShift: existing[0], isLoading: false })
        return existing[0]
      }

      const shiftId = generateUUID()
      const now = new Date().toISOString()

      await window.electron.db.execute(
        `INSERT INTO shifts (id, branch_id, cashier_id, opening_cash_dzd, status, opened_at)
         VALUES (?, ?, ?, ?, 'open', ?)`,
        [shiftId, branchId, cashierId, openingCashDzd, now]
      )

      const newShift: Shift = {
        id: shiftId,
        branch_id: branchId,
        cashier_id: cashierId,
        opening_cash_dzd: openingCashDzd,
        status: 'open',
        opened_at: now,
        closed_at: null,
        expected_cash_dzd: null,
        closing_cash_dzd: null,
        difference_dzd: null,
      }

      sendShiftOpenedTelegramNotification({
        cashierName: useAuthStore.getState().currentUser?.full_name || 'الكاشير',
        openingCashDzd,
        branchName: useAuthStore.getState().currentBranch?.name || 'الفرع الرئيسي',
        openedAt: now,
      }).catch((err) => logger.warn('Failed to send shift open telegram notification', err))

      set({ activeShift: newShift, isLoading: false })
      logger.info('Shift opened', { shiftId, openingCashDzd })
      return newShift
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل في فتح الوردية'
      logger.error('Open shift failed', err)
      set({ error: msg, isLoading: false })
      throw err
    }
  },

  closeShift: async (closingCashDzd: number) => {
    set({ isLoading: true, error: null })
    const { activeShift } = useShiftStore.getState()
    if (!activeShift) {
      const msg = 'لا توجد وردية مفتوحة لإغلاقها'
      set({ error: msg, isLoading: false })
      throw new Error(msg)
    }

    try {
      if (window.electron?.biz?.shifts?.close) {
        const res = await window.electron.biz.shifts.close(activeShift.id, closingCashDzd)
        const closedShift: Shift = {
          ...activeShift,
          status: 'closed',
          closing_cash_dzd: closingCashDzd,
          expected_cash_dzd: res.expectedCash,
          difference_dzd: res.difference,
          closed_at: new Date().toISOString(),
        }
        set({ activeShift: null, isLoading: false })
        logger.info('Shift closed successfully via Main process IPC', res)
        return { closedShift, expectedCash: res.expectedCash, difference: res.difference }
      }

      const salesRows = await window.electron.db.query<{ total_cash_sales: number | null }>(
        `SELECT SUM(cash_amount_dzd) as total_cash_sales 
         FROM sales 
         WHERE shift_id = ? AND status = 'completed'`,
        [activeShift.id]
      )

      const repaymentRows = await window.electron.db.query<{ total_repayments: number | null }>(
        `SELECT SUM(amount_dzd) as total_repayments
         FROM customer_payments
         WHERE shift_id = ? AND payment_method = 'cash'`,
        [activeShift.id]
      )

      const totalCashSales = salesRows[0]?.total_cash_sales ?? 0
      const totalRepayments = repaymentRows[0]?.total_repayments ?? 0
      const expectedCash = activeShift.opening_cash_dzd + totalCashSales + totalRepayments
      const difference = closingCashDzd - expectedCash

      const now = new Date().toISOString()

      await window.electron.db.execute(
        `UPDATE shifts 
         SET expected_cash_dzd = ?, closing_cash_dzd = ?, difference_dzd = ?, status = 'closed', closed_at = ? 
         WHERE id = ?`,
        [expectedCash, closingCashDzd, difference, now, activeShift.id]
      )

      const closedShift: Shift = {
        ...activeShift,
        expected_cash_dzd: expectedCash,
        closing_cash_dzd: closingCashDzd,
        difference_dzd: difference,
        status: 'closed',
        closed_at: now,
      }

      set({ activeShift: null, isLoading: false })
      logger.info('Shift closed', { shiftId: activeShift.id, expectedCash, closingCashDzd, difference })
      return { closedShift, expectedCash, difference }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل في إغلاق الوردية'
      logger.error('Close shift failed', err)
      set({ error: msg, isLoading: false })
      throw err
    }
  },
}))
