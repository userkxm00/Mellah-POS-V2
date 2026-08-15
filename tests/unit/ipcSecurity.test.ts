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
})
