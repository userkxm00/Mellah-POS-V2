import { create } from 'zustand'
import type { Shift } from '@/types/database'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/stores/authStore'

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
  if (!user || !branch) {
    throw new Error('لا توجد جلسة مستخدم أو فرع نشط. يرجى تسجيل الدخول أولاً')
  }
  return {
    cashierId: user.id,
    branchId: branch.id,
  }
}

export const useShiftStore = create<ShiftState>((set, get) => ({
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

      throw new Error('قناة الاتصال بالخادم غير متوفرة لفتح الوردية')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل في فتح الوردية'
      logger.error('Open shift failed', err)
      set({ error: msg, isLoading: false })
      throw err
    }
  },

  closeShift: async (closingCashDzd: number) => {
    set({ isLoading: true, error: null })
    const activeShift = get().activeShift
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

      throw new Error('قناة الاتصال بالخادم غير متوفرة لإغلاق الوردية')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل في إغلاق الوردية'
      logger.error('Close shift failed', err)
      set({ error: msg, isLoading: false })
      throw err
    }
  },
}))
