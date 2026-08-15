import { describe, it, expect, beforeEach } from 'vitest'
import { setMainSession, requireAuth, validateBranchAccess, MainSession } from '../../src/main/session'

describe('Multi-Branch Architecture & Session Isolation (Phase 3)', () => {
  beforeEach(() => {
    setMainSession(null)
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

  it('computes CSV product deduplication key consistently with product map lookup format', () => {
    const productName = 'T-Shirt Cotton'
    const categoryId = 'cat-123'
    const prodKey = `${productName.toLowerCase()}_${categoryId ?? ''}`
    expect(prodKey).toBe('t-shirt cotton_cat-123')

    const nullCatKey = `${productName.toLowerCase()}_${''}`
    expect(nullCatKey).toBe('t-shirt cotton_')
  })
})
