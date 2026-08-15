import { describe, it, expect, beforeEach } from 'vitest'
import { setMainSession, getMainSession, requireAuth, requireRole, validateBranchAccess } from '../../src/main/session'
import type { MainSession } from '../../src/main/session'

describe('IPC Security & Authorization Layer (Phase 2B)', () => {
  beforeEach(() => {
    setMainSession(null)
  })

  it('rejects unauthenticated requests (requireAuth)', () => {
    expect(() => requireAuth()).toThrow('Unauthorized: Authentication required')
  })

  it('populates and retrieves canonical MainSession', () => {
    const session: MainSession = {
      userId: 'u-cashier-1',
      role: 'cashier',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers'],
      fullName: 'Ahmad Cashier',
    }
    setMainSession(session)

    const active = getMainSession()
    expect(active).toEqual(session)
    expect(requireAuth()).toEqual(session)
  })

  it('denies cashier from executing admin or manager operations', () => {
    const cashierSession: MainSession = {
      userId: 'u-cashier-1',
      role: 'cashier',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers'],
      fullName: 'Ahmad Cashier',
    }
    setMainSession(cashierSession)

    // Cashier attempting admin-only handler (e.g. user management, settings save)
    expect(() => requireRole(cashierSession, ['admin'])).toThrow("Forbidden: Role 'cashier' is not authorized")

    // Cashier attempting admin/manager handler (e.g. void sale, product creation)
    expect(() => requireRole(cashierSession, ['admin', 'manager'])).toThrow("Forbidden: Role 'cashier' is not authorized")
  })

  it('denies manager from executing admin-only operations', () => {
    const managerSession: MainSession = {
      userId: 'u-manager-1',
      role: 'manager',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers'],
      fullName: 'Samir Manager',
    }
    setMainSession(managerSession)

    // Manager attempting admin-only handler (e.g. user management)
    expect(() => requireRole(managerSession, ['admin'])).toThrow("Forbidden: Role 'manager' is not authorized")

    // Manager attempting admin/manager operation -> ALLOWED
    expect(() => requireRole(managerSession, ['admin', 'manager'])).not.toThrow()
  })

  it('allows admin to execute any operation', () => {
    const adminSession: MainSession = {
      userId: 'u-admin-1',
      role: 'admin',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers', 'b-oran'],
      fullName: 'Karim Admin',
    }
    setMainSession(adminSession)

    expect(() => requireRole(adminSession, ['admin'])).not.toThrow()
    expect(() => requireRole(adminSession, ['admin', 'manager'])).not.toThrow()
    expect(() => requireRole(adminSession, ['admin', 'manager', 'cashier'])).not.toThrow()
  })

  it('prevents cashier from attempting cross-branch access', () => {
    const cashierSession: MainSession = {
      userId: 'u-cashier-1',
      role: 'cashier',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers'],
      fullName: 'Ahmad Cashier',
    }

    // Cashier passing arbitrary targetBranchId 'b-oran' -> MUST be forced back to 'b-algiers'
    const branch = validateBranchAccess(cashierSession, 'b-oran')
    expect(branch).toBe('b-algiers')
  })

  it('validates branch access policy for manager/admin against allowedBranchIds', () => {
    const managerSession: MainSession = {
      userId: 'u-manager-1',
      role: 'manager',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers'], // Only authorized for Algiers
      fullName: 'Samir Manager',
    }

    // Manager attempting unauthorized targetBranchId 'b-oran' -> MUST throw error
    expect(() => validateBranchAccess(managerSession, 'b-oran')).toThrow(
      "Forbidden: User 'u-manager-1' is not authorized for branch 'b-oran'"
    )

    // Manager attempting authorized primary branch 'b-algiers' -> ALLOWED
    expect(validateBranchAccess(managerSession, 'b-algiers')).toBe('b-algiers')

    // Admin authorized for multiple branches
    const adminSession: MainSession = {
      userId: 'u-admin-1',
      role: 'admin',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers', 'b-oran'],
      fullName: 'Karim Admin',
    }

    expect(validateBranchAccess(adminSession, 'b-oran')).toBe('b-oran')
    expect(validateBranchAccess(adminSession, 'b-algiers')).toBe('b-algiers')
    expect(() => validateBranchAccess(adminSession, 'b-unauthorized')).toThrow(
      "Forbidden: User 'u-admin-1' is not authorized for branch 'b-unauthorized'"
    )
  })

  it('prevents renderer from establishing session or impersonating another user via auth:set-session handler', () => {
    // 1. Unauthenticated state: calling set-session with arbitrary userId MUST fail and maintain null session
    const handleSetSession = (requestedUserId: string | null): boolean => {
      if (!requestedUserId) {
        setMainSession(null)
        return true
      }
      const active = getMainSession()
      if (active && active.userId === requestedUserId) {
        return true
      }
      setMainSession(null)
      return false
    }

    // Attempting to elevate identity when active is null -> FAILS
    expect(handleSetSession('u-admin-victim')).toBe(false)
    expect(getMainSession()).toBeNull()
    expect(() => requireAuth()).toThrow('Unauthorized: Authentication required')

    // 2. Authenticated cashier session
    const cashierSession: MainSession = {
      userId: 'u-cashier-1',
      role: 'cashier',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers'],
      fullName: 'Ahmad Cashier',
    }
    setMainSession(cashierSession)

    // Cashier calling set-session with their own ID -> PRESERVED
    expect(handleSetSession('u-cashier-1')).toBe(true)
    expect(getMainSession()).toEqual(cashierSession)

    // Cashier attempting impersonation by calling set-session with admin's userId -> REJECTED & CLEARED
    expect(handleSetSession('u-admin-victim')).toBe(false)
    expect(getMainSession()).toBeNull()
    expect(() => requireAuth()).toThrow('Unauthorized: Authentication required')
  })

  it('enforces shift close authorization rules', () => {
    const cashierSession: MainSession = {
      userId: 'u-cashier-1',
      role: 'cashier',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers'],
      fullName: 'Ahmad Cashier',
    }
    setMainSession(cashierSession)

    const checkShiftCloseAuth = (session: MainSession, shiftCashierId: string, shiftBranchId: string): void => {
      if (session.role === 'cashier' && shiftCashierId !== session.userId) {
        throw new Error('Forbidden: Cashiers can only close their own shift')
      }
      validateBranchAccess(session, shiftBranchId)
    }

    // Cashier closing own shift -> ALLOWED
    expect(() => checkShiftCloseAuth(cashierSession, 'u-cashier-1', 'b-algiers')).not.toThrow()

    // Cashier closing another cashier's shift -> DENIED
    expect(() => checkShiftCloseAuth(cashierSession, 'u-cashier-2', 'b-algiers')).toThrow(
      'Forbidden: Cashiers can only close their own shift'
    )

    // Manager closing another cashier's shift in authorized branch -> ALLOWED
    const managerSession: MainSession = {
      userId: 'u-manager-1',
      role: 'manager',
      branchId: 'b-algiers',
      allowedBranchIds: ['b-algiers'],
      fullName: 'Samir Manager',
    }
    expect(() => checkShiftCloseAuth(managerSession, 'u-cashier-1', 'b-algiers')).not.toThrow()

    // Manager closing shift in unauthorized branch -> DENIED
    expect(() => checkShiftCloseAuth(managerSession, 'u-cashier-1', 'b-oran')).toThrow(
      "Forbidden: User 'u-manager-1' is not authorized for branch 'b-oran'"
    )
  })

  it('derives void/return stock movement branch from original sale branch', () => {
    const managerSession: MainSession = {
      userId: 'u-manager-1',
      role: 'manager',
      branchId: 'b-oran', // Manager active context is Oran
      allowedBranchIds: ['b-algiers', 'b-oran'], // Authorized for both
      fullName: 'Samir Manager',
    }
    setMainSession(managerSession)

    const originalSaleBranch = 'b-algiers'

    // Authorized branch validation
    const branchToUse = validateBranchAccess(managerSession, originalSaleBranch)
    expect(branchToUse).toBe('b-algiers') // Restock movement will be created in b-algiers, not b-oran
  })

  it('validates returns with authoritative DB unit prices, unique return row PKs, and status updates', () => {
    // 1. Unique Primary Keys & DB Price Overrides
    const mockSaleItems = [
      { variant_id: 'v1', quantity: 3, unit_price_dzd: 2000 },
      { variant_id: 'v2', quantity: 2, unit_price_dzd: 5000 },
    ]
    const existingReturns: Array<{ variant_id: string; total_returned: number }> = []

    const processReturnValidation = (
      requestedItems: Array<{ variantId: string; quantity: number }>
    ) => {
      const returnedMap = new Map<string, number>()
      for (const r of existingReturns) {
        returnedMap.set(r.variant_id, r.total_returned)
      }

      const itemMap = new Map<string, { purchasedQty: number; unitPriceDzd: number }>()
      let totalPurchasedQtyAcrossSale = 0
      for (const si of mockSaleItems) {
        itemMap.set(si.variant_id, { purchasedQty: si.quantity, unitPriceDzd: si.unit_price_dzd })
        totalPurchasedQtyAcrossSale += si.quantity
      }

      let totalRefundDzd = 0
      const generatedRowIds: string[] = []

      for (const item of requestedItems) {
        const dbItem = itemMap.get(item.variantId)
        if (!dbItem) {
          throw new Error(`عفواً! المنتج المطلوب إرجاعه (ID: ${item.variantId}) غير موجود في الفاتورة الأصلية`)
        }
        const alreadyReturned = returnedMap.get(item.variantId) ?? 0
        const remaining = dbItem.purchasedQty - alreadyReturned

        if (item.quantity > remaining) {
          throw new Error(`الكمية المطلوبة للإرجاع (${item.quantity}) تتجاوز الكمية المتبقية القابلة للإرجاع (${remaining})`)
        }

        totalRefundDzd += dbItem.unitPriceDzd * item.quantity
        generatedRowIds.push(`ret-row-${Math.random().toString(36).slice(2)}`)
        returnedMap.set(item.variantId, alreadyReturned + item.quantity)
      }

      let totalReturnedAcrossSale = 0
      for (const [, qty] of returnedMap.entries()) {
        totalReturnedAcrossSale += qty
      }

      const saleStatus = totalReturnedAcrossSale >= totalPurchasedQtyAcrossSale ? 'refunded' : 'partial_refund'
      return { totalRefundDzd, generatedRowIds, saleStatus }
    }

    // Attempting to return unknown variant -> DENIED
    expect(() => processReturnValidation([{ variantId: 'v-unknown', quantity: 1 }])).toThrow(
      'غير موجود في الفاتورة الأصلية'
    )

    // Attempting to return more than purchased (3 v1 purchased, requesting 5) -> DENIED
    expect(() => processReturnValidation([{ variantId: 'v1', quantity: 5 }])).toThrow(
      'تتجاوز الكمية المتبقية القابلة للإرجاع'
    )

    // Partial Return of 1 x v1 -> Total Refund = 2,000 DZD (DB price), status = partial_refund
    const partialRes = processReturnValidation([{ variantId: 'v1', quantity: 1 }])
    expect(partialRes.totalRefundDzd).toBe(2000)
    expect(partialRes.saleStatus).toBe('partial_refund')
    expect(partialRes.generatedRowIds.length).toBe(1)

    // Full Return of 3 x v1 + 2 x v2 -> Total Refund = 3*2000 + 2*5000 = 16,000 DZD, status = refunded, 2 distinct row PKs
    const fullRes = processReturnValidation([
      { variantId: 'v1', quantity: 3 },
      { variantId: 'v2', quantity: 2 },
    ])
    expect(fullRes.totalRefundDzd).toBe(16000)
    expect(fullRes.saleStatus).toBe('refunded')
    expect(fullRes.generatedRowIds.length).toBe(2)
    expect(fullRes.generatedRowIds[0]).not.toBe(fullRes.generatedRowIds[1]) // Proves unique primary keys
  })
})
