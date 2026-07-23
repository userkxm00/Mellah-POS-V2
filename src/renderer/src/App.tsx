import React, { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { LoginPage } from '@/pages/LoginPage'
import { POSCheckoutPage } from '@/pages/POSCheckoutPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { UsersPage } from '@/pages/UsersPage'
import { BranchesPage } from '@/pages/BranchesPage'
import { ToastContainer } from '@/components/ui'
import type { UserRole } from '@/types/database'

type PageRoute = 'pos' | 'products' | 'users' | 'branches'

export function App(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const currentUser = useAuthStore((s) => s.currentUser)
  const currentBranch = useAuthStore((s) => s.currentBranch)
  const isLoading = useAuthStore((s) => s.isLoading)
  const checkAuthSession = useAuthStore((s) => s.checkAuthSession)
  const logout = useAuthStore((s) => s.logout)
  const hasRole = useAuthStore((s) => s.hasRole)

  const [currentPage, setCurrentPage] = useState<PageRoute>('pos')

  useEffect(() => {
    checkAuthSession()
  }, [checkAuthSession])

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg-base">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-accent border-t-transparent" />
          <p className="text-sm font-semibold text-text-secondary">جاري التحقق من الجلسة...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !currentUser) {
    return (
      <>
        <LoginPage />
        <ToastContainer />
      </>
    )
  }

  const roleBadges: Record<UserRole, { title: string; style: string }> = {
    admin: { title: '👑 مدير', style: 'bg-accent-light text-accent border-accent/20' },
    manager: { title: '💼 مشرف', style: 'bg-warning-light text-warning border-warning/20' },
    cashier: { title: '👤 كاشير', style: 'bg-success-light text-success border-success/20' },
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col bg-bg-base">
      {/* Top Global App Navigation Bar */}
      <nav className="glass border-b border-border-light px-6 py-2 flex items-center justify-between z-30 select-none">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-accent text-lg">MELLAH</span>
            <span className="text-xs text-text-tertiary font-mono">
              ({currentBranch?.name ?? 'الفرع الرئيسي'})
            </span>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage('pos')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 btn-press ${
                currentPage === 'pos'
                  ? 'bg-accent text-white shadow-ambient-sm'
                  : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
              }`}
            >
              🏪 نقطة البيع
            </button>

            {hasRole(['admin', 'manager']) && (
              <button
                onClick={() => setCurrentPage('products')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 btn-press ${
                  currentPage === 'products'
                    ? 'bg-accent text-white shadow-ambient-sm'
                    : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
                }`}
              >
                📦 المنتجات والمخزون
              </button>
            )}

            {hasRole(['admin']) && (
              <button
                onClick={() => setCurrentPage('users')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 btn-press ${
                  currentPage === 'users'
                    ? 'bg-accent text-white shadow-ambient-sm'
                    : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
                }`}
              >
                👥 المستخدمين والصلاحيات
              </button>
            )}

            {hasRole(['admin']) && (
              <button
                onClick={() => setCurrentPage('branches')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 btn-press ${
                  currentPage === 'branches'
                    ? 'bg-accent text-white shadow-ambient-sm'
                    : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
                }`}
              >
                🏢 الفروع
              </button>
            )}
          </div>
        </div>

        {/* User Profile & Logout */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-text-primary">{currentUser.full_name}</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                roleBadges[currentUser.role].style
              }`}
            >
              {roleBadges[currentUser.role].title}
            </span>
          </div>

          <button
            onClick={() => {
              if (window.confirm('هل تريد تسجيل الخروج؟')) {
                logout()
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-gray-100 text-text-secondary hover:bg-danger-light hover:text-danger text-xs font-bold transition-colors btn-press"
          >
            🚪 خروج
          </button>
        </div>
      </nav>

      {/* Main Page Area */}
      <main className="flex-1 overflow-auto">
        {currentPage === 'pos' && <POSCheckoutPage />}
        {currentPage === 'products' && hasRole(['admin', 'manager']) && (
          <ProductsPage onNavigateToPos={() => setCurrentPage('pos')} />
        )}
        {currentPage === 'users' && hasRole(['admin']) && (
          <UsersPage onBack={() => setCurrentPage('pos')} />
        )}
        {currentPage === 'branches' && hasRole(['admin']) && (
          <BranchesPage onBack={() => setCurrentPage('pos')} />
        )}
      </main>

      <ToastContainer />
    </div>
  )
}

export default App
