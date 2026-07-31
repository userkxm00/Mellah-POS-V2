import React, { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { startBackgroundSyncLoop } from '@/services/syncEngine'
import { SplashScreen } from '@/pages/SplashScreen'
import { LoginPage } from '@/pages/LoginPage'
import { HomeLauncherPage } from '@/pages/HomeLauncherPage'
import { POSCheckoutPage } from '@/pages/POSCheckoutPage'
import { SalesHistoryPage } from '@/pages/SalesHistoryPage'
import { ReturnsPage } from '@/pages/ReturnsPage'
import { CustomersPage } from '@/pages/CustomersPage'
import { SuppliersPage } from '@/pages/SuppliersPage'
import { LabelPrinterPage } from '@/pages/LabelPrinterPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { UsersPage } from '@/pages/UsersPage'
import { BranchesPage } from '@/pages/BranchesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { MaintenancePage } from '@/pages/MaintenancePage'
import { initAutoBackupScheduler } from '@/services/backupService'
import { sendAppLaunchTelegramNotification } from '@/services/telegramService'
import { ToastContainer } from '@/components/ui'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal'
import { FirstRunWizardModal } from '@/components/setup/FirstRunWizardModal'
import { SessionLockModal } from '@/components/auth/SessionLockModal'
import { useIdleTimer } from '@/hooks/useIdleTimer'
import { useStoreSettingsStore } from '@/stores/storeSettingsStore'

// In-window routes (fast navigation inside the main window)
type InWindowRoute = 'launcher' | 'pos' | 'history' | 'returns' | 'customers' | 'labels' | 'maintenance'

// Modules that open in a secondary Electron BrowserWindow (all non-POS modules)
const SECONDARY_MODULES = new Set([
  'history',
  'returns',
  'customers',
  'suppliers',
  'labels',
  'products',
  'reports',
  'users',
  'branches',
  'settings',
  'audit_logs',
  'maintenance',
])

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
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false)

  const { isLocked, unlockSession } = useIdleTimer(5)

  // Check if this is a secondary module window
  const secondaryModule = getSecondaryModule()

  useEffect(() => {
    checkAuthSession()
    useStoreSettingsStore.getState().loadSettings()

    // Function to apply saved brand color from localStorage
    const applySavedBrandColor = (): void => {
      const savedColor = localStorage.getItem('mellah_brand_color')
      if (savedColor) {
        document.documentElement.style.setProperty('--color-accent', savedColor)
      }
    }

    // Apply on initial mount
    applySavedBrandColor()

    // Listen for window focus & storage changes (multi-window Electron sync)
    const handleSync = (): void => {
      applySavedBrandColor()
      useStoreSettingsStore.getState().loadSettings()
    }

    window.addEventListener('focus', handleSync)
    window.addEventListener('storage', handleSync)

    const stopSyncLoop = startBackgroundSyncLoop()
    const stopAutoBackup = initAutoBackupScheduler()
    return () => {
      stopSyncLoop()
      stopAutoBackup()
      window.removeEventListener('focus', handleSync)
      window.removeEventListener('storage', handleSync)
    }
  }, [checkAuthSession])

  // Send App Launch Telegram Notification once per main window session
  const [hasSentLaunchNotif, setHasSentLaunchNotif] = useState<boolean>(false)

  useEffect(() => {
    if (isAuthenticated && currentUser && !hasSentLaunchNotif && !secondaryModule) {
      setHasSentLaunchNotif(true)
      const branch = useAuthStore.getState().currentBranch
      const sendNotif = (verStr: string): void => {
        sendAppLaunchTelegramNotification({
          branchName: branch?.name || 'الفرع الرئيسي',
          userName: currentUser.full_name,
          appVersion: verStr,
        }).catch(() => {})
      }

      if (window.electron?.appInfo?.getVersion) {
        window.electron.appInfo
          .getVersion()
          .then((v) => sendNotif(`v${v} (Windows Desktop)`))
          .catch(() => sendNotif('v1.0.1 (Windows Desktop)'))
      } else {
        sendNotif('v1.0.1 (Windows Desktop)')
      }
    }
  }, [isAuthenticated, currentUser, hasSentLaunchNotif, secondaryModule])

  // Handle navigation from launcher / command palette
  const handleLauncherNavigate = useCallback((moduleId: string) => {
    if (moduleId.startsWith('/')) {
      const cleanRoute = moduleId.replace('/', '')
      if (cleanRoute === 'pos') setCurrentPage('pos')
      else if (cleanRoute === 'launcher') setCurrentPage('launcher')
      else if (SECONDARY_MODULES.has(cleanRoute)) {
        window.electron.openModuleWindow(cleanRoute)
      }
      return
    }

    if (SECONDARY_MODULES.has(moduleId)) {
      window.electron.openModuleWindow(moduleId)
    } else {
      setCurrentPage(moduleId as InWindowRoute)
    }
  }, [])

  // Global Keyboard Shortcuts Listener for Ctrl+K and ?
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command Palette: Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsCommandPaletteOpen((prev) => !prev)
        return
      }

      // Keyboard Shortcuts Overlay: ? (outside input fields)
      if (e.key === '?' || (e.shiftKey && e.key === '?')) {
        const target = e.target as HTMLElement
        const isInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable

        if (!isInput) {
          e.preventDefault()
          setIsShortcutsModalOpen((prev) => !prev)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
      <div className="h-screen w-screen flex items-center justify-center bg-[#F4F5F9] dark:bg-[#0F172A]">
        <div className="flex flex-col items-center gap-4 bg-white/80 dark:bg-slate-800/80 p-8 rounded-3xl shadow-hero-glow border border-white/60 dark:border-slate-700/60 backdrop-blur-xl">
          <div className="animate-spin rounded-full h-10 w-10 border-3 border-accent border-t-transparent" />
          <p className="text-sm font-bold text-[#6B7A8D] dark:text-slate-300">جاري التحقق من الجلسة...</p>
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
      <div className="h-screen w-screen overflow-auto bg-[#F4F5F9] dark:bg-[#0F172A]">
        {secondaryModule === 'history' && <SalesHistoryPage onBack={() => window.close()} />}
        {secondaryModule === 'returns' && <ReturnsPage onBack={() => window.close()} />}
        {secondaryModule === 'customers' && <CustomersPage onBack={() => window.close()} />}
        {secondaryModule === 'suppliers' && hasRole(['admin', 'manager']) && (
          <SuppliersPage onBack={() => window.close()} />
        )}
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
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigate={handleLauncherNavigate}
        />
        <KeyboardShortcutsModal
          isOpen={isShortcutsModalOpen}
          onClose={() => setIsShortcutsModalOpen(false)}
        />
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
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigate={handleLauncherNavigate}
        />
        <KeyboardShortcutsModal
          isOpen={isShortcutsModalOpen}
          onClose={() => setIsShortcutsModalOpen(false)}
        />
        <ToastContainer />
      </>
    )
  }

  // In-window pages (POS, history, returns, customers, labels)
  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col bg-[#F4F5F9] dark:bg-[#0F172A]">
      <main className="flex-1 overflow-auto page-enter">
        {currentPage === 'pos' && <POSCheckoutPage onNavigateToHome={goHome} />}
        {currentPage === 'history' && <SalesHistoryPage onBack={goHome} />}
        {currentPage === 'returns' && <ReturnsPage onBack={goHome} />}
        {currentPage === 'customers' && <CustomersPage onBack={goHome} />}
        {currentPage === 'labels' && <LabelPrinterPage onBack={goHome} />}
      </main>
      <FirstRunWizardModal />
      <SessionLockModal isOpen={isLocked} onUnlock={unlockSession} />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={handleLauncherNavigate}
      />
      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
      <ToastContainer />
    </div>
  )
}

export default App
