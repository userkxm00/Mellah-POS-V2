import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Store,
  RotateCcw,
  Package,
  BarChart3,
  Users,
  Building2,
  Settings,
  Receipt,
  UserPlus,
  Tag,
  LogOut,
  Crown,
  Briefcase,
  UserCheck,
  ShieldCheck,
  Clock,
  Calendar,
  Sparkles,
  Zap,
  ExternalLink,
  RefreshCw,
  Wrench,
  Truck
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { CountUpNumber } from '@/components/ui/CountUpNumber'
import { useAuthStore } from '@/stores/authStore'
import { useSyncStore } from '@/stores/syncStore'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { UpdateNotificationBanner } from '@/components/updates/UpdateNotificationBanner'
import { AnimatedBrandLogo } from '@/components/brand/AnimatedBrandLogo'
import { manualReconnectAndSync } from '@/services/syncEngine'
import type { UserRole } from '@/types/database'

interface LauncherTile {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  iconBg: string
  glowColor: string
  roles: UserRole[]
  /** If true, navigates in-window. If false, opens a new Electron window. */
  inWindow: boolean
}

interface HomeLauncherPageProps {
  onNavigate: (moduleId: string) => void
}

interface Particle {
  id: number
  x: number
  size: number
  duration: number
  delay: number
}

export function HomeLauncherPage({ onNavigate }: HomeLauncherPageProps): React.JSX.Element {
  const [isReconnecting, setIsReconnecting] = useState(false)
  const isOnline = useSyncStore((s) => s.isOnline)
  const currentUser = useAuthStore((s) => s.currentUser)
  const currentBranch = useAuthStore((s) => s.currentBranch)
  const logout = useAuthStore((s) => s.logout)
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.version)
  const hasRole = useAuthStore((s) => s.hasRole)
  const language = useLanguageStore((s) => s.language)

  const pageContainerRef = useRef<HTMLDivElement>(null)

  // Zero-State Parallax Mouse Listener (Bypasses React Re-renders via CSS Variables)
  useEffect(() => {
    let rafId: number

    const handleMouseMove = (e: MouseEvent): void => {
      rafId = requestAnimationFrame(() => {
        if (pageContainerRef.current) {
          const normX = (e.clientX - window.innerWidth / 2) * -0.015
          const normY = (e.clientY - window.innerHeight / 2) * -0.015
          pageContainerRef.current.style.setProperty('--bg-parallax-x', `${normX.toFixed(2)}px`)
          pageContainerRef.current.style.setProperty('--bg-parallax-y', `${normY.toFixed(2)}px`)
        }
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  // Floating Particles Data (Generated once on mount)
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        id: i,
        x: (i * 8.3 + 4) % 100,
        size: 4 + (i % 4) * 2,
        duration: 8 + (i % 5) * 2,
        delay: (i * 0.4) % 5,
      })),
    []
  )

  // Direct DOM 3D Tilt Event Handlers (0% React Overhead)
  const handleTileMouseMove = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const target = e.currentTarget
    const rect = target.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const rotateX = Math.round(((y - centerY) / centerY) * -9)
    const rotateY = Math.round(((x - centerX) / centerX) * 9)
    target.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`
  }

  const handleTileMouseLeave = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const target = e.currentTarget
    target.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
    target.style.boxShadow = ''
  }

  const handleTileMouseEnter = (e: React.MouseEvent<HTMLButtonElement>, glowColor: string): void => {
    e.currentTarget.style.boxShadow = `0 14px 30px -6px ${glowColor}`
  }

  const tiles = useMemo<LauncherTile[]>(
    () => [
      {
        id: 'pos',
        label: t('نقطة البيع (POS)'),
        description: t('واجهة الكاشير البيع الفوري السريع'),
        icon: <Store className="w-8 h-8" />,
        iconBg: 'bg-accent text-white',
        glowColor: 'rgba(20, 184, 166, 0.35)',
        roles: ['admin', 'manager', 'cashier'],
        inWindow: true,
      },
      {
        id: 'history',
        label: t('سجل المبيعات'),
        description: t('استعراض الفواتير وإعادة الطباعة'),
        icon: <Receipt className="w-8 h-8" />,
        iconBg: 'bg-[#5856D6] text-white',
        glowColor: 'rgba(88, 86, 214, 0.35)',
        roles: ['admin', 'manager', 'cashier'],
        inWindow: false,
      },
      {
        id: 'returns',
        label: t('إدارة المرتجعات'),
        description: t('استرجاع المنتجات والتعويضات'),
        icon: <RotateCcw className="w-8 h-8" />,
        iconBg: 'bg-warning text-white',
        glowColor: 'rgba(245, 158, 11, 0.35)',
        roles: ['admin', 'manager', 'cashier'],
        inWindow: false,
      },
      {
        id: 'customers',
        label: t('الزبائن والولاء'),
        description: t('قاعدة الزبائن ونقاط المكافآت'),
        icon: <UserPlus className="w-8 h-8" />,
        iconBg: 'bg-[#FF2D55] text-white',
        glowColor: 'rgba(255, 45, 85, 0.35)',
        roles: ['admin', 'manager', 'cashier'],
        inWindow: false,
      },
      {
        id: 'labels',
        label: t('طباعة الملصقات'),
        icon: <Tag className="w-8 h-8" />,
        description: t('تيكيتات الباركود 40mm×30mm'),
        iconBg: 'bg-[#FF9500] text-white',
        glowColor: 'rgba(255, 149, 0, 0.35)',
        roles: ['admin', 'manager', 'cashier'],
        inWindow: false,
      },
      {
        id: 'products',
        label: t('المنتجات والمخزون'),
        description: t('إضافة السلع والمقاسات والألوان'),
        icon: <Package className="w-8 h-8" />,
        iconBg: 'bg-success text-white',
        glowColor: 'rgba(52, 199, 89, 0.35)',
        roles: ['admin', 'manager'],
        inWindow: false,
      },
      {
        id: 'suppliers',
        label: t('الموردين والديون'),
        description: t('فواتير الشراء وديون السلع (Fournisseurs)'),
        icon: <Truck className="w-8 h-8" />,
        iconBg: 'bg-[#FF9500] text-white',
        glowColor: 'rgba(255, 149, 0, 0.35)',
        roles: ['admin', 'manager'],
        inWindow: false,
      },
      {
        id: 'reports',
        label: t('التقارير والتحليلات'),
        description: t('مؤشرات الأرباح والمبيعات الحية'),
        icon: <BarChart3 className="w-8 h-8" />,
        iconBg: 'bg-[#AF52DE] text-white',
        glowColor: 'rgba(175, 82, 222, 0.35)',
        roles: ['admin', 'manager'],
        inWindow: false,
      },
      {
        id: 'users',
        label: t('إدارة المستخدمين'),
        description: t('إضافة وحذف وتعيين أدوار الطاقم'),
        icon: <Users className="w-8 h-8" />,
        iconBg: 'bg-[#007AFF] text-white',
        glowColor: 'rgba(0, 122, 255, 0.35)',
        roles: ['admin'],
        inWindow: false,
      },
      {
        id: 'branches',
        label: t('إدارة الفروع'),
        description: t('الفروع والمحلات التابعة للمتجر'),
        icon: <Building2 className="w-8 h-8" />,
        iconBg: 'bg-[#34C759] text-white',
        glowColor: 'rgba(52, 199, 89, 0.35)',
        roles: ['admin'],
        inWindow: false,
      },
      {
        id: 'settings',
        label: t('إعدادات المتجر'),
        description: t('بيانات الفاتورة والنسخ الاحتياطي'),
        icon: <Settings className="w-8 h-8" />,
        iconBg: 'bg-[#8E8E93] text-white',
        glowColor: 'rgba(142, 142, 147, 0.35)',
        roles: ['admin'],
        inWindow: false,
      },
      {
        id: 'audit_logs',
        label: t('سجل العمليات (Audit)'),
        description: t('استعراض سجل التدقيق والأمان'),
        icon: <ShieldCheck className="w-8 h-8" />,
        iconBg: 'bg-[#34C759] text-white',
        glowColor: 'rgba(52, 199, 89, 0.35)',
        roles: ['admin'],
        inWindow: false,
      },
      {
        id: 'maintenance',
        label: t('الصيانة والتحديثات'),
        description: t('فحص وإصلاح النظام وتحديث التطبيق'),
        icon: <Wrench className="w-8 h-8" />,
        iconBg: 'bg-[#FF9500] text-white',
        glowColor: 'rgba(255, 149, 0, 0.35)',
        roles: ['admin'],
        inWindow: false,
      },
    ],
    [t]
  )

  const roleBadges = useMemo<Record<UserRole, { label: string; icon: React.ReactNode; style: string }>>(
    () => ({
      admin: {
        label: t('مدير النظام'),
        icon: <Crown className="w-3.5 h-3.5" />,
        style: 'bg-accent/10 text-accent border-accent/20',
      },
      manager: {
        label: t('مشرف المتجر'),
        icon: <Briefcase className="w-3.5 h-3.5" />,
        style: 'bg-warning/10 text-warning border-warning/20',
      },
      cashier: {
        label: t('كاشير'),
        icon: <UserCheck className="w-3.5 h-3.5" />,
        style: 'bg-success/10 text-success border-success/20',
      },
    }),
    [t]
  )

  // Live ticking clock
  const [timeStr, setTimeStr] = useState<string>('')
  const [dateStr, setDateStr] = useState<string>('')

  useEffect(() => {
    const updateTime = (): void => {
      const now = new Date()
      const locale = language === 'fr' ? 'fr-FR' : 'ar-DZ'
      setTimeStr(
        now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
      setDateStr(
        now.toLocaleDateString(locale, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [language])

  const [todaySalesDzd, setTodaySalesDzd] = useState<number>(0)
  const [todayTxCount, setTodayTxCount] = useState<number>(0)

  useEffect(() => {
    (async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0]
        const rows = await window.electron.db.query<{ total: number; count: number }>(`
          SELECT COALESCE(SUM(total_dzd), 0) as total, COUNT(*) as count 
          FROM sales 
          WHERE status = 'completed' AND date(created_at) = ?
        `, [todayStr])
        if (rows.length > 0) {
          setTodaySalesDzd(rows[0].total)
          setTodayTxCount(rows[0].count)
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[HomeLauncherPage]', err)
      }
    })()
  }, [])

  const addToast = useToastStore((s) => s.addToast)

  const handleManualReconnect = async (): Promise<void> => {
    setIsReconnecting(true)
    try {
      const { isOnline: onlineStatus, processed } = await manualReconnectAndSync()
      if (onlineStatus) {
        addToast({
          message: processed > 0 ? `${t('تم الاتصال ومزامنة')} ${processed} ${t('عملية بنجاح!')}` : t('تم الاتصال بالشبكة بنجاح (أونلاين)'),
          variant: 'success',
        })
      } else {
        addToast({
          message: t('تعذر الاتصال بالشبكة، تحقق من اتصال الإنترنت (أوفلاين)'),
          variant: 'error',
        })
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[HomeLauncherPage]', err)
      addToast({ message: t('حدث خطأ أثناء فحص الاتصال'), variant: 'error' })
    } finally {
      setIsReconnecting(false)
    }
  }

  if (!currentUser) return <></>

  const badge = roleBadges[currentUser.role]
  const visibleTiles = tiles.filter((tile) => hasRole(tile.roles))

  return (
    <div
      ref={pageContainerRef}
      className="flex h-screen w-screen flex-col bg-[#F2F2F7] dark:bg-slate-950 select-none relative overflow-hidden"
    >
      {/* Update notification banner */}
      <UpdateNotificationBanner />

      {/* GPU-Accelerated Parallax Background Ambient Glows */}
      <div
        style={{
          transform: 'translate3d(var(--bg-parallax-x, 0px), var(--bg-parallax-y, 0px), 0px)',
          willChange: 'transform',
          transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className="absolute w-[650px] h-[650px] bg-accent/12 rounded-full blur-[140px] pointer-events-none -top-32 right-1/4 z-0"
      />
      <div
        style={{
          transform: 'translate3d(calc(var(--bg-parallax-x, 0px) * -1.2), calc(var(--bg-parallax-y, 0px) * -1.2), 0px)',
          willChange: 'transform',
          transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className="absolute w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none -bottom-20 -left-20 z-0"
      />

      {/* Hardware-Accelerated Floating Glass Particles System */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {particles.map((p) => (
          <div
            key={p.id}
            style={{
              left: `${p.x}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animation: `float-particle ${p.duration}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
              willChange: 'transform',
            }}
            className="absolute bottom-0 rounded-full bg-white/15 dark:bg-white/5 border border-white/10 backdrop-blur-[2px] pointer-events-none"
          />
        ))}
      </div>

      {/* ── Top Bar ── */}
      <header className="glass-header border-b border-gray-200/80 dark:border-slate-800 px-8 py-3.5 flex items-center justify-between z-20 shadow-layered-sm relative overflow-hidden group">
        {/* Header Light Sweep */}
        <div
          style={{ animation: 'header-shimmer 7s ease-in-out infinite' }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent -translate-x-full pointer-events-none"
        />

        <AnimatedBrandLogo
          size="md"
          subtitle={currentBranch?.name ? t(currentBranch.name) : t('الفرع الرئيسي')}
        />

        <div className="flex items-center gap-4 relative z-10">
          {/* Sync status & Reconnect button */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all shadow-sm ${
                isOnline
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-danger/10 text-danger border-danger/20 animate-pulse'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isOnline ? 'bg-success animate-pulse' : 'bg-danger'
                }`}
              />
              <span>{isOnline ? t('أونلاين (متزامن)') : t('أوفلاين (محلي)')}</span>
            </div>

            <button
              onClick={handleManualReconnect}
              disabled={isReconnecting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-slate-900/90 border border-gray-200/80 dark:border-slate-700/80 text-text-primary dark:text-slate-100 hover:border-accent hover:text-accent text-xs font-bold shadow-layered-sm transition-all btn-press disabled:opacity-50 cursor-pointer"
              title={t('إعادة الاتصال بالشبكة والمزامنة يدوياً')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin text-accent' : ''}`} />
              <span>{isReconnecting ? t('جاري الفحص...') : t('إعادة الاتصال')}</span>
            </button>
          </div>

          {/* User Profile Tile */}
          <div className="flex items-center gap-2.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-gray-200/80 dark:border-slate-700/80 px-3.5 py-1.5 rounded-full shadow-layered-sm">
            <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center font-black text-xs border border-accent/20">
              {currentUser.full_name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-text-primary dark:text-slate-100 leading-none">
                {currentUser.full_name}
              </span>
              <span className="text-[10px] font-bold text-text-secondary dark:text-slate-300 mt-0.5">
                {t(badge.label)}
              </span>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={() => {
              if (window.confirm(t('هل تريد تسجيل الخروج؟'))) logout()
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gray-200/80 dark:bg-slate-800/80 text-text-primary dark:text-slate-100 hover:bg-danger/10 hover:text-danger text-xs font-black transition-colors btn-press cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('خروج')}</span>
          </button>
        </div>
      </header>

      {/* ── Main Dashboard Content ── */}
      <main className="flex-1 flex flex-col px-8 py-6 max-w-7xl mx-auto w-full overflow-y-auto page-enter space-y-6 relative z-10">
        {/* Welcome Hero Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, var(--color-accent, #0A84FF) 0%, var(--color-accent-hover, #0070E0) 100%)',
            color: '#FFFFFF'
          }}
          className="relative overflow-hidden p-6 rounded-3xl shadow-lg border border-white/30 flex flex-col md:flex-row items-center justify-between gap-6 group"
        >
          {/* Banner Reflection Light Sweep */}
          <div
            style={{ animation: 'banner-shimmer 5s ease-in-out infinite' }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full pointer-events-none z-10"
          />

          <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-1.5 text-center md:text-right z-10">
            <div className="inline-flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-xs font-bold text-white backdrop-blur-md mb-1 shadow-sm border border-white/30">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-white">{t('لوحة التحكم والتشغيل المركزية')}</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white drop-shadow-sm">
              {t('مرحباً بك،')} {currentUser.full_name} 👋
            </h2>
            <p className="text-xs font-semibold text-white/95">
              {t('اختر الوحدة المطلوبة للبدء. نظام نقاط البيع يعمل بمرونة وسرعة تامة.')}
            </p>
          </div>

          {/* Live Date & Time Widget */}
          <div className="flex items-center gap-4 bg-white/20 backdrop-blur-xl px-5 py-3.5 rounded-2xl border border-white/30 z-10 shrink-0 shadow-layered-sm">
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Calendar className="w-3.5 h-3.5 text-white" />
                <span className="text-white">{dateStr}</span>
              </div>
              <div className="flex items-center gap-1.5 text-lg font-black font-mono mt-0.5 text-white">
                <Clock className="w-4 h-4 text-amber-300" />
                <span className="text-white">{timeStr}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick System Summary Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card-premium p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center border border-accent/20 shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-text-secondary dark:text-slate-400">{t('الفرع النشط')}</p>
              <p className="text-xs font-black text-text-primary dark:text-slate-100 mt-0.5">
                {currentBranch?.name ? t(currentBranch.name) : t('الفرع الرئيسي')}
              </p>
            </div>
          </div>

          <div className="glass-card-premium p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center border border-success/20 shadow-sm">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-text-secondary dark:text-slate-400">{t('مبيعات اليوم')} ({todayTxCount} {t('عملية')})</p>
              <p className="text-xs font-black text-success mt-0.5 currency font-mono">
                <CountUpNumber value={todaySalesDzd} formatter={(v) => formatCurrency(v)} />
              </p>
            </div>
          </div>

          <div className="glass-card-premium p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center border border-warning/20 shadow-sm">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-text-secondary dark:text-slate-400">{t('صلاحياتك الحالية')}</p>
              <p className="text-xs font-black text-text-primary dark:text-slate-100 mt-0.5">
                {t(badge.label)} ({currentUser.full_name})
              </p>
            </div>
          </div>
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between pt-2">
          <h3 className="text-sm font-black text-text-primary flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
            <span>{t('وحدات النظام المتوفرة')}</span>
          </h3>
          <span className="text-xs font-bold text-text-tertiary">
            {visibleTiles.length} {t('متاحة حسب صلاحياتك')}
          </span>
        </div>

        {/* ── Grid Launcher Tiles ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {visibleTiles.map((tile) => {
            const isHeroPOS = tile.id === 'pos'

            if (isHeroPOS) {
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => onNavigate(tile.id)}
                  onMouseMove={handleTileMouseMove}
                  onMouseLeave={handleTileMouseLeave}
                  onMouseEnter={(e) => handleTileMouseEnter(e, tile.glowColor)}
                  style={{
                    transition: 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease',
                    willChange: 'transform, box-shadow',
                  }}
                  className="launcher-tile-hero group flex flex-col items-center text-center p-5 justify-between min-h-[175px] col-span-1 sm:col-span-2 lg:col-span-1 cursor-pointer relative overflow-hidden"
                >
                  {/* Top Badge */}
                  <span className="self-end text-[10px] font-extrabold text-white bg-white/20 px-2.5 py-0.5 rounded-full border border-white/30 backdrop-blur-md shadow-sm">
                    {t('شاشة سريعة')}
                  </span>

                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shadow-lg backdrop-blur-md group-hover:scale-110 transition-transform duration-200 my-1 text-white">
                    {tile.icon}
                  </div>

                  {/* Label & Description */}
                  <div>
                    <span className="text-sm font-black text-white block leading-tight">
                      {t(tile.label)}
                    </span>
                    <span className="text-[11px] font-bold text-white/90 block mt-1 line-clamp-1">
                      {t(tile.description)}
                    </span>
                  </div>
                </button>
              )
            }

            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => onNavigate(tile.id)}
                onMouseMove={handleTileMouseMove}
                onMouseLeave={handleTileMouseLeave}
                onMouseEnter={(e) => handleTileMouseEnter(e, tile.glowColor)}
                style={{
                  transition: 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease',
                  willChange: 'transform, box-shadow',
                }}
                className="launcher-tile group flex flex-col items-center text-center p-5 justify-between min-h-[175px] cursor-pointer relative overflow-hidden"
              >
                {/* Top Badge for Secondary Windows */}
                {!tile.inWindow ? (
                  <span className="self-end text-[10px] font-extrabold text-text-secondary dark:text-slate-300 bg-gray-100/90 dark:bg-slate-800/90 px-2.5 py-0.5 rounded-full border border-gray-200/90 dark:border-slate-700/90 shadow-sm flex items-center gap-1 group-hover:bg-accent/10 group-hover:text-accent group-hover:border-accent/30 transition-colors">
                    <ExternalLink className="w-3 h-3 text-accent" />
                    <span>{t('نافذة جديدة')}</span>
                  </span>
                ) : (
                  <span className="self-end text-[10px] font-extrabold text-success bg-success/10 px-2.5 py-0.5 rounded-full border border-success/20 shadow-sm">
                    {t('شاشة رئيسية')}
                  </span>
                )}

                {/* Icon */}
                <div
                  className={`w-14 h-14 rounded-2xl ${tile.iconBg} flex items-center justify-center shadow-layered-sm group-hover:scale-110 transition-transform duration-200 my-1`}
                >
                  {tile.icon}
                </div>

                {/* Label & Description */}
                <div>
                  <span className="text-xs font-black text-text-primary block leading-tight group-hover:text-accent transition-colors">
                    {t(tile.label)}
                  </span>
                  <span className="text-[10px] font-bold text-text-tertiary block mt-1 line-clamp-1">
                    {t(tile.description)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </main>

      <style>{`
        @keyframes float-particle {
          0% {
            transform: translateY(105vh) rotate(0deg);
            opacity: 0;
          }
          15% {
            opacity: 0.35;
          }
          85% {
            opacity: 0.35;
          }
          100% {
            transform: translateY(-10vh) rotate(360deg);
            opacity: 0;
          }
        }
        @keyframes header-shimmer {
          0% { transform: translateX(-150%) rotate(15deg); }
          100% { transform: translateX(150%) rotate(15deg); }
        }
        @keyframes banner-shimmer {
          0% { transform: translateX(-150%) rotate(25deg); }
          100% { transform: translateX(150%) rotate(25deg); }
        }
      `}</style>
    </div>
  )
}
