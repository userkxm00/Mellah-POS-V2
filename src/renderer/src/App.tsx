import React, { useEffect, useState, useCallback, Suspense, lazy } from 'react'
import { ExternalLink } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { startBackgroundSyncLoop } from '@/services/syncEngine'
import { SplashScreen } from '@/pages/SplashScreen'
import { LoginPage } from '@/pages/LoginPage'
import { HomeLauncherPage } from '@/pages/HomeLauncherPage'

const POSCheckoutPage = lazy(() => import('@/pages/POSCheckoutPage').then((m) => ({ default: m.POSCheckoutPage })))
const SalesHistoryPage = lazy(() => import('@/pages/SalesHistoryPage').then((m) => ({ default: m.SalesHistoryPage })))
const ReturnsPage = lazy(() => import('@/pages/ReturnsPage').then((m) => ({ default: m.ReturnsPage })))
const CustomersPage = lazy(() => import('@/pages/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const SuppliersPage = lazy(() => import('@/pages/SuppliersPage').then((m) => ({ default: m.SuppliersPage })))
const LabelPrinterPage = lazy(() => import('@/pages/LabelPrinterPage').then((m) => ({ default: m.LabelPrinterPage })))
const ProductsPage = lazy(() => import('@/pages/ProductsPage').then((m) => ({ default: m.ProductsPage })))
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })))
const BranchesPage = lazy(() => import('@/pages/BranchesPage').then((m) => ({ default: m.BranchesPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })))
const MaintenancePage = lazy(() => import('@/pages/MaintenancePage').then((m) => ({ default: m.MaintenancePage })))
import { initAutoBackupScheduler } from '@/services/backupService'
import { sendAppLaunchTelegramNotification } from '@/services/telegramService'
import { ToastContainer } from '@/components/ui'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal'
import { FirstRunWizardModal } from '@/components/setup/FirstRunWizardModal'
import { SessionLockModal } from '@/components/auth/SessionLockModal'
import { useIdleTimer } from '@/hooks/useIdleTimer'
import { useStoreSettingsStore } from '@/stores/storeSettingsStore'
import { useLanguageStore, type Language } from '@/stores/languageStore'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'

// In-window routes (Instant 0ms SPA navigation inside the main window)
type InWindowRoute =
  | 'launcher'
  | 'pos'
  | 'history'
  | 'returns'
  | 'customers'
  | 'suppliers'
  | 'labels'
  | 'products'
  | 'reports'
  | 'users'
  | 'branches'
  | 'settings'
  | 'audit_logs'
  | 'maintenance'

// Modules that open in a secondary Electron BrowserWindow (Empty set by default for Instant 0ms SPA Mode)
const SECONDARY_MODULES = new Set<string>([])

function getSecondaryModule(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('module')
}

export function App(): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.language)
  useLanguageStore((s) => s.version)

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const currentUser = useAuthStore((s) => s.currentUser)
  const isLoading = useAuthStore((s) => s.isLoading)
  const checkAuthSession = useAuthStore((s) => s.checkAuthSession)
  const hasRole = useAuthStore((s) => s.hasRole)

  const [showSplash, setShowSplash] = useState(true)
  const [currentPage, setCurrentPage] = useState<InWindowRoute>('launcher')
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false)

  const sessionTimeoutMinutes = useStoreSettingsStore((s) => s.settings.session_timeout_minutes)
  const { isLocked, unlockSession } = useIdleTimer(sessionTimeoutMinutes)

  // Check if this is a secondary module window
  const secondaryModule = getSecondaryModule()

  useEffect(() => {
    checkAuthSession()
    useStoreSettingsStore.getState().loadSettings()

    // Function to apply saved brand color, language & theme mode from localStorage
    const applySavedBrandColorAndLang = (): void => {
      const savedColor = localStorage.getItem('mellah_brand_color')
      if (savedColor) {
        document.documentElement.style.setProperty('--color-accent', savedColor)
        const savedHover = localStorage.getItem('mellah_brand_color_hover') || savedColor
        document.documentElement.style.setProperty('--color-accent-hover', savedHover)
        if (window.electron?.updateWindowIcon) {
          window.electron.updateWindowIcon(savedColor, savedHover)
        }
      }
      const savedLang = (localStorage.getItem('mellah_lang') as Language | null) || 'ar'
      document.documentElement.lang = savedLang
      document.documentElement.dir = savedLang === 'ar' ? 'rtl' : 'ltr'

      if (savedLang !== useLanguageStore.getState().language) {
        useLanguageStore.getState().setLanguage(savedLang)
      }

      // Multi-window theme & sound settings sync
      const savedTheme = (localStorage.getItem('mellah_pos_theme') as ThemeMode) || 'light'
      if (savedTheme !== useThemeStore.getState().theme) {
        useThemeStore.getState().setTheme(savedTheme)
      } else {
        if (savedTheme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      }

      const savedSoundEnabled = localStorage.getItem('mellah_pos_sound_enabled')
      if (savedSoundEnabled !== null) {
        const isEnabled = savedSoundEnabled === 'true'
        if (isEnabled !== useThemeStore.getState().soundEnabled) {
          useThemeStore.getState().setSoundEnabled(isEnabled)
        }
      }

      const savedSoundVolume = localStorage.getItem('mellah_pos_sound_volume')
      if (savedSoundVolume !== null) {
        const volume = Number.parseFloat(savedSoundVolume)
        if (!Number.isNaN(volume) && volume !== useThemeStore.getState().soundVolume) {
          useThemeStore.getState().setSoundVolume(volume)
        }
      }
    }

    // Apply on initial mount
    applySavedBrandColorAndLang()

    // Listen for window focus & storage changes (multi-window Electron sync)
    const handleSync = (): void => {
      applySavedBrandColorAndLang()
      useStoreSettingsStore.getState().loadSettings()

      const savedLang = localStorage.getItem('mellah_lang') as Language | null
      if (savedLang && savedLang !== useLanguageStore.getState().language) {
        useLanguageStore.getState().setLanguage(savedLang)
      }
    }

    window.addEventListener('focus', handleSync)
    window.addEventListener('storage', handleSync)

    // Periodic sync check every 3s to guarantee multi-window brand color consistency
    const intervalId = setInterval(() => {
      applySavedBrandColorAndLang()
    }, 3000)

    const stopSyncLoop = startBackgroundSyncLoop()
    const stopAutoBackup = initAutoBackupScheduler()
    return () => {
      clearInterval(intervalId)
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
        <Suspense fallback={<div className="h-full w-full flex items-center justify-center p-12 text-xs font-bold text-text-tertiary">جاري التحميل...</div>}>
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
        </Suspense>
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

  // In-window pages (0ms Instant SPA Navigation)
  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col bg-[#F4F5F9] dark:bg-[#0F172A]">
      <main className="flex-1 overflow-auto page-enter">
        <Suspense fallback={<div className="h-full w-full flex items-center justify-center p-12 text-xs font-bold text-text-tertiary">جاري التحميل...</div>}>
          {currentPage === 'pos' && <POSCheckoutPage onNavigateToHome={goHome} />}
          {currentPage === 'history' && <SalesHistoryPage onBack={goHome} />}
          {currentPage === 'returns' && <ReturnsPage onBack={goHome} />}
          {currentPage === 'customers' && <CustomersPage onBack={goHome} />}
          {currentPage === 'suppliers' && hasRole(['admin', 'manager']) && <SuppliersPage onBack={goHome} />}
          {currentPage === 'labels' && <LabelPrinterPage onBack={goHome} />}
          {currentPage === 'products' && hasRole(['admin', 'manager']) && <ProductsPage onNavigateToPos={goHome} />}
          {currentPage === 'reports' && hasRole(['admin', 'manager']) && <ReportsPage onBack={goHome} />}
          {currentPage === 'users' && hasRole(['admin']) && <UsersPage onBack={goHome} />}
          {currentPage === 'branches' && hasRole(['admin']) && <BranchesPage onBack={goHome} />}
          {currentPage === 'settings' && hasRole(['admin']) && <SettingsPage onBack={goHome} />}
          {currentPage === 'audit_logs' && hasRole(['admin']) && <AuditLogPage onBack={goHome} />}
          {currentPage === 'maintenance' && hasRole(['admin']) && <MaintenancePage onBack={goHome} />}
        </Suspense>
      </main>

      {/* Floating Glass Pop-out Button for Hybrid Super Mode */}
      {currentPage !== 'pos' && (
        <button
          type="button"
          onClick={() => {
            if (window.electron?.openModuleWindow) {
              window.electron.openModuleWindow(currentPage)
              goHome()
            }
          }}
          className="fixed top-3.5 right-[240px] z-50 px-3.5 py-2 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-gray-200/80 dark:border-slate-700/80 text-text-secondary dark:text-slate-300 hover:text-accent hover:border-accent/40 shadow-layered-sm transition-all duration-200 cursor-pointer flex items-center gap-1.5 btn-press"
          title={t('فتح هذه الصفحة في نافذة خارجية مستقلة')}
        >
          <ExternalLink className="w-4 h-4" />
          <span className="text-[11px] font-black hidden sm:inline">{t('نافذة خارجية')}</span>
        </button>
      )}
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
