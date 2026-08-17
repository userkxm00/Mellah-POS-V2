import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setMainSession, requireAuth, validateBranchAccess, MainSession } from '../../src/main/session'
import { importProductsFromCSV } from '../../src/renderer/src/services/csvProductImport'
import { resolveActiveShiftId } from '../../src/renderer/src/lib/shiftUtils'
import { useShiftStore } from '../../src/renderer/src/stores/shiftStore'
import { useAuthStore } from '../../src/renderer/src/stores/authStore'
import { useStoreSettingsStore, DEFAULT_SETTINGS } from '../../src/renderer/src/stores/storeSettingsStore'
import type { Shift, Branch } from '../../src/renderer/src/types/database'

describe('Multi-Branch Architecture & Session Isolation (Phase 3)', () => {
  beforeEach(() => {
    setMainSession(null)
    useAuthStore.setState({ currentUser: null, currentBranch: null, isAuthenticated: false })
    useShiftStore.setState({ activeShift: null, isLoading: false, error: null })
    useStoreSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, loaded: false })

    // Mock global window.electron object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {
      electron: {
        db: {
          query: vi.fn().mockResolvedValue([]),
          execute: vi.fn().mockResolvedValue({ changes: 1 }),
          transaction: vi.fn().mockResolvedValue(true),
        },
      },
    }
  })

  it('strictly rejects unauthenticated access to branch operations', () => {
    expect(() => requireAuth()).toThrow('Unauthorized: Authentication required')
  })

  it('restricts cashiers to their single assigned branch', () => {
    const cashierSession: MainSession = {
      userId: 'u-cashier-algiers',
      role: 'cashier',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers'],
      fullName: 'Ahmad Cashier',
    }
    setMainSession(cashierSession)

    // Primary branch access -> ALLOWED
    expect(validateBranchAccess(cashierSession)).toBe('b-algiers')
    expect(validateBranchAccess(cashierSession, 'b-algiers')).toBe('b-algiers')

    // Cross-branch request from cashier -> SAFELY CONFINED to cashier's assigned branch
    expect(validateBranchAccess(cashierSession, 'b-oran')).toBe('b-algiers')
  })

  it('allows multi-branch managers to switch only within allowedBranchIds', () => {
    const managerSession: MainSession = {
      userId: 'u-manager-regional',
      role: 'manager',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers', 'b-oran'],
      fullName: 'Samir Manager',
    }
    setMainSession(managerSession)

    // Primary branch -> ALLOWED
    expect(validateBranchAccess(managerSession)).toBe('b-algiers')

    // Second authorized branch -> ALLOWED
    expect(validateBranchAccess(managerSession, 'b-oran')).toBe('b-oran')

    // Unauthorized branch -> DENIED
    expect(() => validateBranchAccess(managerSession, 'b-constantine')).toThrow(
      "Forbidden: User 'u-manager-regional' is not authorized for branch 'b-constantine'"
    )
  })

  it('allows super-admins to access any authorized branch in their policy list', () => {
    const adminSession: MainSession = {
      userId: 'u-admin-super',
      role: 'admin',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers', 'b-oran', 'b-constantine'],
      fullName: 'Karim SuperAdmin',
    }
    setMainSession(adminSession)

    expect(validateBranchAccess(adminSession, 'b-algiers')).toBe('b-algiers')
    expect(validateBranchAccess(adminSession, 'b-oran')).toBe('b-oran')
    expect(validateBranchAccess(adminSession, 'b-constantine')).toBe('b-constantine')
    expect(() => validateBranchAccess(adminSession, 'b-unauthorized')).toThrow(
      "Forbidden: User 'u-admin-super' is not authorized for branch 'b-unauthorized'"
    )
  })

  it('guarantees complete isolation when active branch context is missing', () => {
    const brokenSession: MainSession = {
      userId: 'u-broken',
      role: 'cashier',
      branchId: '',
      allowedBranchIds: [],
      fullName: 'No Branch User',
    }
    setMainSession(brokenSession)

    expect(() => validateBranchAccess(brokenSession)).toThrow(
      "Forbidden: No branch context assigned to user 'u-broken'"
    )
  })

  it('imports products from full CSV string preserving category identity and active branch scoping via Main IPC', async () => {
    const branch: Branch = { id: 'b-algiers', name: 'Algiers', address: null, created_at: '', updated_at: '', deleted_at: null }
    useAuthStore.setState({ currentBranch: branch, isAuthenticated: true })

    const csvData = `Name,Category,Price,Cost,Size,Color,Stock
T-Shirt,Men,1000,600,M,Blue,10
T-Shirt,Women,1200,700,S,Red,5
T-Shirt,Men,1000,600,L,Blue,15`

    const importCsvMock = vi.fn().mockResolvedValue({ importedCount: 3 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window.electron.biz = {
      products: {
        importCsv: importCsvMock,
      },
    }

    const count = await importProductsFromCSV(csvData)
    expect(count).toBe(3)
    expect(importCsvMock).toHaveBeenCalledWith(csvData)
  })

  it('verifies resolveActiveShiftId returns in-memory shift only if it belongs to target branch', async () => {
    const shiftAlgiers: Shift = {
      id: 's-algiers',
      branch_id: 'b-algiers',
      cashier_id: 'u-cashier-1',
      opening_cash_dzd: 5000,
      status: 'open',
      opened_at: '2026-08-15T10:00:00.000Z',
      closed_at: null,
      expected_cash_dzd: null,
      closing_cash_dzd: null,
      difference_dzd: null,
    }

    useShiftStore.setState({ activeShift: shiftAlgiers })
    useAuthStore.setState({ currentBranch: { id: 'b-algiers', name: 'Algiers', address: null, created_at: '', updated_at: '', deleted_at: null } })

    // Resolving for Algiers branch -> Returns in-memory shift
    const resolvedAlgiers = await resolveActiveShiftId('b-algiers')
    expect(resolvedAlgiers).toBe('s-algiers')

    // Resolving for Oran branch -> Ignores Algiers in-memory shift, queries DB for Oran shift
    const resolvedOran = await resolveActiveShiftId('b-oran')
    expect(resolvedOran).toBeNull() // DB mock returns empty array []
  })

  it('resets store settings to DEFAULT_SETTINGS on loadSettings error to prevent branch leakage', async () => {
    const branch: Branch = { id: 'b-oran', name: 'Oran', address: null, created_at: '', updated_at: '', deleted_at: null }
    useAuthStore.setState({ currentBranch: branch, isAuthenticated: true })

    // Mock DB error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window.electron.db.query.mockRejectedValueOnce(new Error('Database query failed'))

    await useStoreSettingsStore.getState().loadSettings('b-oran')

    const settings = useStoreSettingsStore.getState().settings
    expect(settings).toEqual(DEFAULT_SETTINGS)
    expect(useStoreSettingsStore.getState().loaded).toBe(true)
  })
})
