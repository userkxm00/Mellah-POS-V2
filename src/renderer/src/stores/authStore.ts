import { create } from 'zustand'
import type { User, Branch, UserRole } from '@/types/database'
import { logger } from '@/lib/logger'

interface UserWithBranch extends User {
  branch_name: string
}

interface AuthState {
  currentUser: UserWithBranch | null
  currentBranch: Branch | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  loginWithPin: (pin: string) => Promise<UserWithBranch>
  logout: () => void
  checkAuthSession: () => Promise<void>
  hasRole: (allowedRoles: UserRole[]) => boolean
}

const SESSION_KEY = 'mellah_pos_session_user_id'

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  currentBranch: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  loginWithPin: async (pin: string) => {
    set({ isLoading: true, error: null })
    try {
      const cleanPin = pin.trim()
      const rows = await window.electron.db.query<UserWithBranch>(
        `SELECT u.*, b.name as branch_name 
         FROM users u 
         JOIN branches b ON b.id = u.branch_id 
         WHERE u.pin_hash = ? AND u.deleted_at IS NULL 
         LIMIT 1`,
        [cleanPin]
      )

      if (rows.length === 0) {
        throw new Error('رمز PIN غير صحيح')
      }

      const user = rows[0]
      const branchRows = await window.electron.db.query<Branch>(
        `SELECT * FROM branches WHERE id = ?`,
        [user.branch_id]
      )

      const branch = branchRows[0] ?? null

      localStorage.setItem(SESSION_KEY, user.id)
      set({
        currentUser: user,
        currentBranch: branch,
        isAuthenticated: true,
        isLoading: false,
      })

      logger.info('User logged in with PIN', { id: user.id, name: user.full_name, role: user.role })
      return user
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل الدخول'
      logger.warn('Login failed', { err })
      set({ error: msg, isLoading: false })
      throw new Error(msg)
    }
  },

  logout: () => {
    localStorage.removeItem(SESSION_KEY)
    set({ currentUser: null, currentBranch: null, isAuthenticated: false })
    logger.info('User logged out')
  },

  checkAuthSession: async () => {
    set({ isLoading: true })
    try {
      const savedUserId = localStorage.getItem(SESSION_KEY)
      if (!savedUserId) {
        set({ isAuthenticated: false, isLoading: false })
        return
      }

      const rows = await window.electron.db.query<UserWithBranch>(
        `SELECT u.*, b.name as branch_name 
         FROM users u 
         JOIN branches b ON b.id = u.branch_id 
         WHERE u.id = ? AND u.deleted_at IS NULL 
         LIMIT 1`,
        [savedUserId]
      )

      if (rows.length > 0) {
        const user = rows[0]
        const branchRows = await window.electron.db.query<Branch>(
          `SELECT * FROM branches WHERE id = ?`,
          [user.branch_id]
        )

        set({
          currentUser: user,
          currentBranch: branchRows[0] ?? null,
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        localStorage.removeItem(SESSION_KEY)
        set({ isAuthenticated: false, isLoading: false })
      }
    } catch {
      set({ isAuthenticated: false, isLoading: false })
    }
  },

  hasRole: (allowedRoles: UserRole[]) => {
    const user = get().currentUser
    if (!user) return false
    return allowedRoles.includes(user.role)
  },
}))
