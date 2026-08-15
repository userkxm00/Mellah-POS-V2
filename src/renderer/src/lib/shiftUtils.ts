import { useShiftStore } from '@/stores/shiftStore'
import { useAuthStore } from '@/stores/authStore'

/**
 * Resolves the active open shift ID for a branch safely.
 * Checks Zustand in-memory store first, and falls back to a direct SQLite DB query
 * if state is null (e.g. when opened in a secondary Electron module window).
 */
export async function resolveActiveShiftId(targetBranchId?: string): Promise<string | null> {
  // 1. Check in-memory store
  const activeShiftId = useShiftStore.getState().activeShift?.id
  if (activeShiftId) return activeShiftId

  const branchId = targetBranchId ?? useAuthStore.getState().currentBranch?.id
  if (!branchId) return null

  // 2. Direct DB fallback for open shift in the target branch
  try {
    const rows = await window.electron.db.query<{ id: string }>(
      `SELECT id FROM shifts WHERE branch_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
      [branchId]
    )
    return rows[0]?.id ?? null
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[shiftUtils] Failed to resolve active shift ID:', err)
    return null
  }
}
