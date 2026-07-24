import React, { useEffect, useState, useCallback } from 'react'
import { Home } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'
import { startBackgroundSyncLoop } from '@/services/syncEngine'
import { SplashScreen } from '@/pages/SplashScreen'
import { LoginPage } from '@/pages/LoginPage'
import { HomeLauncherPage } from '@/pages/HomeLauncherPage'
import { POSCheckoutPage } from '@/pages/POSCheckoutPage'
import { SalesHistoryPage } from '@/pages/SalesHistoryPage'
import { ReturnsPage } from '@/pages/ReturnsPage'
import { CustomersPage } from '@/pages/CustomersPage'
import { LabelPrinterPage } from '@/pages/LabelPrinterPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { UsersPage } from '@/pages/UsersPage'
import { BranchesPage } from '@/pages/BranchesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { MaintenancePage } from '@/pages/MaintenancePage'
import { ToastContainer } from '@/components/ui'
import { FirstRunWizardModal } from '@/components/setup/FirstRunWizardModal'
import { SessionLockModal } from '@/components/auth/SessionLockModal'
import { useIdleTimer } from '@/hooks/useIdleTimer'

// In-window routes (fast navigation inside the main window)
type InWindowRoute = 'launcher' | 'pos' | 'history' | 'returns' | 'customers' | 'labels' | 'maintenance'

// Modules that open in a secondary Electron BrowserWindow (all non-POS modules)
const SECONDARY_MODULES = new Set([
  'history',
  'returns',
  'customers',
  'labels',
  'products',
  'reports',
  'users',
  'branches',
  'settings',
  'audit_logs',
  'maintenance',
])

/**
 * Detects if this renderer instance was opened as a secondary module window.
 * The main process passes `?module=xxx` when creating module windows.
 */
function getSecondaryModule(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('module')
}

export function App(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const currentUser = useAuthStore((s) => s.currentUser)
  const isLoading = useAuthStore((s) => s.isLoading)
  const checkAuthSession = useAuthStore((s) => s.checkAuthSession)
  const hasRole = useAuthStore((s) => s.hasRole)

  const [showSplash, setShowSplash] = useState(true)
  const [currentPage, setCurrentPage] = useState<InWindowRoute>('launcher')

  const { isLocked, unlockSession } = useIdleTimer(5)

  // Check if this is a secondary module window
  const secondaryModule = getSecondaryModule()

  useEffect(() => {
    checkAuthSession()
    const stopSyncLoop = startBackgroundSyncLoop()
    return () => stopSyncLoop()
  }, [checkAuthSession])

  // Handle navigation from the launcher
  const handleLauncherNavigate = useCallback((moduleId: string) => {
    if (SECONDARY_MODULES.has(moduleId)) {
      // Open in a new Electron BrowserWindow via IPC
      window.electron.openModuleWindow(moduleId)
    } else {
      // Navigate in-window
      setCurrentPage(moduleId as InWindowRoute)
    }
  }, [])

  const goHome = useCallback(() => {
    setCurrentPage('launcher')
  }, [])

  // ── Splash Screen ──
  if (showSplash && !secondaryModule) {
    return <SplashScreen onFinished={() => setShowSplash(false)} />
  }

  // ── Loading state ──
  if (isLoading && !secondaryModule) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#F2F2F7]">
        <div className="flex flex-col items-center gap-4 bg-white/80 p-8 rounded-3xl shadow-ambient border border-white backdrop-blur-xl">
          <div className="animate-spin rounded-full h-10 w-10 border-3 border-accent border-t-transparent" />
          <p className="text-sm font-bold text-text-secondary">جاري التحقق من الجلسة...</p>
        </div>
      </div>
    )
  }

  // ── Login screen ──
  if (!isAuthenticated || !currentUser) {
    return (
      <>
        <LoginPage />
        <ToastContainer />
      </>
    )
  }

  // ════════════════════════════════════════════
  // SECONDARY MODULE WINDOW (standalone)
  // ════════════════════════════════════════════
  if (secondaryModule) {
    return (
      <div className="h-screen w-screen overflow-auto bg-[#F2F2F7]">
        {secondaryModule === 'history' && <SalesHistoryPage onBack={() => window.close()} />}
        {secondaryModule === 'returns' && <ReturnsPage onBack={() => window.close()} />}
        {secondaryModule === 'customers' && <CustomersPage onBack={() => window.close()} />}
        {secondaryModule === 'labels' && <LabelPrinterPage onBack={() => window.close()} />}
        {secondaryModule === 'products' && hasRole(['admin', 'manager']) && (
          <ProductsPage onNavigateToPos={() => {}} />
        )}
        {secondaryModule === 'reports' && hasRole(['admin', 'manager']) && (
          <ReportsPage onBack={() => window.close()} />
        )}
        {secondaryModule === 'users' && hasRole(['admin']) && (
          <UsersPage onBack={() => window.close()} />
        )}
        {secondaryModule === 'branches' && hasRole(['admin']) && (
          <BranchesPage onBack={() => window.close()} />
        )}
        {secondaryModule === 'settings' && hasRole(['admin']) && (
          <SettingsPage onBack={() => window.close()} />
        )}
        {secondaryModule === 'audit_logs' && hasRole(['admin']) && (
          <AuditLogPage onBack={() => window.close()} />
        )}
        {secondaryModule === 'maintenance' && hasRole(['admin']) && (
          <MaintenancePage onBack={() => window.close()} />
        )}
        <ToastContainer />
      </div>
    )
  }

  // ════════════════════════════════════════════
  // MAIN WINDOW — Launcher + In-Window Pages
  // ════════════════════════════════════════════
  if (currentPage === 'launcher') {
    return (
      <>
        <HomeLauncherPage onNavigate={handleLauncherNavigate} />
        <FirstRunWizardModal />
        <ToastContainer />
      </>
    )
  }

  // In-window pages (POS, history, returns, customers, labels)
  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col bg-[#F2F2F7]">
      <main className="flex-1 overflow-auto page-enter">
        {currentPage === 'pos' && <POSCheckoutPage onNavigateToHome={goHome} />}
        {currentPage === 'history' && <SalesHistoryPage onBack={goHome} />}
        {currentPage === 'returns' && <ReturnsPage onBack={goHome} />}
        {currentPage === 'customers' && <CustomersPage onBack={goHome} />}
        {currentPage === 'labels' && <LabelPrinterPage onBack={goHome} />}
      </main>
      <FirstRunWizardModal />
      <SessionLockModal isOpen={isLocked} onUnlock={unlockSession} />
      <ToastContainer />
    </div>
  )
}

export default App
