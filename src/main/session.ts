import type { UserRole } from '../renderer/src/types/database'

export interface MainSession {
  userId: string
  role: UserRole
  branchId: string
  allowedBranchIds: string[]
  fullName: string
}

let activeSession: MainSession | null = null

export function setMainSession(session: MainSession | null): void {
  activeSession = session
}

export function getMainSession(): MainSession | null {
  return activeSession
}

export function requireAuth(): MainSession {
  if (!activeSession) {
    throw new Error('Unauthorized: Authentication required (No active main process session)')
  }
  return activeSession
}

export function requireRole(session: MainSession, allowedRoles: UserRole[]): void {
  if (!allowedRoles.includes(session.role)) {
    throw new Error(`Forbidden: Role '${session.role}' is not authorized. Required: ${allowedRoles.join(', ')}`)
  }
}

export function validateBranchAccess(session: MainSession, requestedBranchId?: string): string {
  if (!session.branchId && !requestedBranchId) {
    throw new Error(`Forbidden: No branch context assigned to user '${session.userId}'`)
  }

  if (session.role === 'cashier') {
    return session.branchId
  }

  const targetBranch = requestedBranchId || session.branchId
  if (!session.allowedBranchIds.includes(targetBranch)) {
    throw new Error(
      `Forbidden: User '${session.userId}' is not authorized for branch '${targetBranch}'`
    )
  }

  return targetBranch
}
