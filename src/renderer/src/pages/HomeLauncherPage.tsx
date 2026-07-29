import React, { useState, useEffect } from 'react'
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
  ExternalLink,
  Clock,
  Calendar,
  Sparkles,
  ShieldCheck,
  Zap,
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
  roles: UserRole[]
  /** If true, navigates in-window. If false, opens a new Electron window. */
  inWindow: boolean
}

const tiles: LauncherTile[] = [
  {
    id: 'pos',
    label: useLanguageStore.getState().t('نقطة البيع (POS)'),
    description: useLanguageStore.getState().t('واجهة الكاشير البيع الفوري السريع'),
    icon: <Store className="w-8 h-8" />,
    iconBg: 'bg-accent text-white',
    roles: ['admin', 'manager', 'cashier'],
    inWindow: true,
  },
  {
    id: 'history',
    label: useLanguageStore.getState().t('سجل المبيعات'),
    description: useLanguageStore.getState().t('استعراض الفواتير وإعادة الطباعة'),
    icon: <Receipt className="w-8 h-8" />,
    iconBg: 'bg-[#5856D6] text-white',
    roles: ['admin', 'manager', 'cashier'],
    inWindow: false,
  },
  {
    id: 'returns',
    label: useLanguageStore.getState().t('إدارة المرتجعات'),
    description: useLanguageStore.getState().t('استرجاع المنتجات والتعويضات'),
    icon: <RotateCcw className="w-8 h-8" />,
    iconBg: 'bg-warning text-white',
    roles: ['admin', 'manager', 'cashier'],
    inWindow: false,
  },
  {
    id: 'customers',
    label: useLanguageStore.getState().t('الزبائن والولاء'),
    description: useLanguageStore.getState().t('قاعدة الزبائن ونقاط المكافآت'),
    icon: <UserPlus className="w-8 h-8" />,
    iconBg: 'bg-[#FF2D55] text-white',
    roles: ['admin', 'manager', 'cashier'],
    inWindow: false,
  },
  {
    id: 'labels',
    label: useLanguageStore.getState().t('طباعة الملصقات'),
    icon: <Tag className="w-8 h-8" />,
    description: useLanguageStore.getState().t('تيكيتات الباركود 40mm×30mm'),
    iconBg: 'bg-[#FF9500] text-white',
    roles: ['admin', 'manager', 'cashier'],
    inWindow: false,
  },
  {
    id: 'products',
    label: useLanguageStore.getState().t('المنتجات والمخزون'),
    description: useLanguageStore.getState().t('إضافة السلع والمقاسات والألوان'),
    icon: <Package className="w-8 h-8" />,
    iconBg: 'bg-success text-white',
    roles: ['admin', 'manager'],
    inWindow: false,
  },
  {
    id: 'suppliers',
    label: useLanguageStore.getState().t('الموردين والديون'),
    description: useLanguageStore.getState().t('فواتير الشراء وديون السلع (Fournisseurs)'),
    icon: <Truck className="w-8 h-8" />,
    iconBg: 'bg-[#FF9500] text-white',
    roles: ['admin', 'manager'],
    inWindow: false,
  },
  {
    id: 'reports',
    label: useLanguageStore.getState().t('التقارير والتحليلات'),
    description: useLanguageStore.getState().t('مؤشرات الأرباح والمبيعات الحية'),
    icon: <BarChart3 className="w-8 h-8" />,
    iconBg: 'bg-[#AF52DE] text-white',
    roles: ['admin', 'manager'],
    inWindow: false,
  },
  {
    id: 'users',
    label: useLanguageStore.getState().t('إدارة المستخدمين'),
    description: useLanguageStore.getState().t('إضافة وحذف وتعيين أدوار الطاقم'),
    icon: <Users className="w-8 h-8" />,
    iconBg: 'bg-[#007AFF] text-white',
    roles: ['admin'],
    inWindow: false,
  },
  {
    id: 'branches',
    label: useLanguageStore.getState().t('إدارة الفروع'),
    description: useLanguageStore.getState().t('الفروع والمحلات التابعة للمتجر'),
    icon: <Building2 className="w-8 h-8" />,
    iconBg: 'bg-[#34C759] text-white',
    roles: ['admin'],
    inWindow: false,
  },
  {
    id: 'settings',
    label: useLanguageStore.getState().t('إعدادات المتجر'),
    description: useLanguageStore.getState().t('بيانات الفاتورة والنسخ الاحتياطي'),
    icon: <Settings className="w-8 h-8" />,
    iconBg: 'bg-[#8E8E93] text-white',
    roles: ['admin'],
    inWindow: false,
  },
  {
    id: 'audit_logs',
    label: useLanguageStore.getState().t('سجل العمليات (Audit)'),
    description: useLanguageStore.getState().t('استعراض سجل التدقيق والأمان'),
    icon: <ShieldCheck className="w-8 h-8" />,
    iconBg: 'bg-[#34C759] text-white',
    roles: ['admin'],
    inWindow: false,
  },
  {
    id: 'maintenance',
    label: useLanguageStore.getState().t('الصيانة والتحديثات'),
    description: useLanguageStore.getState().t('فحص وإصلاح النظام وتحديث التطبيق'),
    icon: <Wrench className="w-8 h-8" />,
    iconBg: 'bg-[#FF9500] text-white',
    roles: ['admin'],
    inWindow: false,
  },
]

const roleBadges: Record<UserRole, { label: string; icon: React.ReactNode; style: string }> = {
  admin: {
    label: useLanguageStore.getState().t('مدير النظام'),
    icon: <Crown className="w-3.5 h-3.5" />,
    style: 'bg-accent/10 text-accent border-accent/20',
  },
  manager: {
    label: useLanguageStore.getState().t('مشرف المتجر'),
    icon: <Briefcase className="w-3.5 h-3.5" />,
    style: 'bg-warning/10 text-warning border-warning/20',
  },
  cashier: {
    label: useLanguageStore.getState().t('كاشير'),
    icon: <UserCheck className="w-3.5 h-3.5" />,
    style: 'bg-success/10 text-success border-success/20',
  },
}

interface HomeLauncherPageProps {
  onNavigate: (moduleId: string) => void
}

export function HomeLauncherPage({ onNavigate }: HomeLauncherPageProps): React.JSX.Element {
  const [isReconnecting, setIsReconnecting] = useState(false)
  const isOnline = useSyncStore((s) => s.isOnline)
  const currentUser = useAuthStore((s) => s.currentUser)
  const currentBranch = useAuthStore((s) => s.currentBranch)
  const logout = useAuthStore((s) => s.logout)
  const t = useLanguageStore((s) => s.t)
  const hasRole = useAuthStore((s) => s.hasRole)
  const language = useLanguageStore((s) => s.language)

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
      } catch (err) {// eslint-disable-next-line no-console
      console.error("[HomeLauncherPage]", err); // Fallback
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
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[HomeLauncherPage]", err); addToast({ message: t('حدث خطأ أثناء فحص الاتصال'), variant: 'error' })
    } finally {
      setIsReconnecting(false)
    }
  }

  if (!currentUser) return <></>

  const badge = roleBadges[currentUser.role]
  const visibleTiles = tiles.filter((t) => hasRole(t.roles))

  return (
    <div className="flex h-screen w-screen flex-col bg-[#F2F2F7] select-none relative overflow-hidden">
      {/* Update notification banner */}
      <UpdateNotificationBanner />

      {/* Ambient glow */}
      <div className="absolute w-[700px] h-[700px] bg-accent/6 rounded-full blur-[140px] pointer-events-none -top-40 right-1/4" />
      <div className="absolute w-[500px] h-[500px] bg-accent/4 rounded-full blur-[100px] pointer-events-none -bottom-20 -left-20" />

      {/* ── Top Bar ── */}
      <header className="glass-header border-b border-gray-200/80 px-8 py-3.5 flex items-center justify-between z-20 shadow-layered-sm">
        <AnimatedBrandLogo
          size="md"
          subtitle={currentBranch?.name ? t(currentBranch.name) : t('الفرع الرئيسي')}
        />

        <div className="flex items-center gap-4">
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
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/90 border border-gray-200/80 text-text-primary hover:border-accent hover:text-accent text-xs font-bold shadow-layered-sm transition-all btn-press disabled:opacity-50"
              title={t('إعادة الاتصال بالشبكة والمزامنة يدوياً')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin text-accent' : ''}`} />
              <span>{isReconnecting ? t('جاري الفحص...') : t('إعادة الاتصال')}</span>
            </button>
          </div>

          {/* User Profile Tile */}
          <div className="flex items-center gap-2.5 bg-white/90 backdrop-blur-md border border-gray-200/80 px-3.5 py-1.5 rounded-full shadow-layered-sm">
            <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center font-black text-xs border border-accent/20">
              {currentUser.full_name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-text-primary leading-none">
                {currentUser.full_name}
              </span>
              <span className="text-[10px] font-bold text-text-tertiary mt-0.5">
                {t(badge.label)}
              </span>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={() => {
              if (window.confirm(t('هل تريد تسجيل الخروج؟'))) logout()
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gray-200/60 text-text-secondary hover:bg-danger/10 hover:text-danger text-xs font-bold transition-colors btn-press"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('خروج')}</span>
          </button>
        </div>
      </header>

      {/* ── Main Dashboard Content ── */}
      <main className="flex-1 flex flex-col px-8 py-6 max-w-7xl mx-auto w-full overflow-y-auto page-enter space-y-6">
        {/* Welcome Hero Banner */}
        <div className="relative overflow-hidden bg-gradient-to-r from-accent/90 to-accent text-white p-6 rounded-3xl shadow-hero-glow border border-accent/20 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-1.5 text-center md:text-right z-10">
            <div className="inline-flex items-center gap-1.5 bg-white/15 px-3 py-1 rounded-full text-xs font-bold text-white/90 backdrop-blur-md mb-1 shadow-sm border border-white/20">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{t('لوحة التحكم والتشغيل المركزية')}</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight">
              {t('مرحباً بك،')} {currentUser.full_name} 👋
            </h2>
            <p className="text-xs text-white/80 font-medium">
              {t('اختر الوحدة المطلوبة للبدء. نظام نقاط البيع يعمل بمرونة وسرعة تامة.')}
            </p>
          </div>

          {/* Live Date & Time Widget */}
          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-xl px-5 py-3.5 rounded-2xl border border-white/20 z-10 shrink-0 shadow-layered-sm">
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white/90">
                <Calendar className="w-3.5 h-3.5" />
                <span>{dateStr}</span>
              </div>
              <div className="flex items-center gap-1.5 text-lg font-black text-white font-mono mt-0.5">
                <Clock className="w-4 h-4 text-amber-300" />
                <span>{timeStr}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick System Summary Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card-premium p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center border border-accent/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-text-tertiary">{t('الفرع النشط')}</p>
              <p className="text-xs font-black text-text-primary mt-0.5">
                {currentBranch?.name ? t(currentBranch.name) : t('الفرع الرئيسي')}
              </p>
            </div>
          </div>

          <div className="glass-card-premium p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center border border-success/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-text-tertiary dark:text-slate-400">{t('مبيعات اليوم')} ({todayTxCount} {t('عملية')})</p>
              <p className="text-xs font-black text-success mt-0.5 currency font-mono">
                <CountUpNumber value={todaySalesDzd} formatter={(v) => formatCurrency(v)} />
              </p>
            </div>
          </div>

          <div className="glass-card-premium p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center border border-warning/20">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-text-tertiary">{t('صلاحياتك الحالية')}</p>
              <p className="text-xs font-black text-text-primary mt-0.5">
                {t(badge.label)} ({currentUser.full_name})
              </p>
            </div>
          </div>
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between pt-2">
          <h3 className="text-sm font-black text-text-primary flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
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
                  onClick={() => onNavigate(tile.id)}
                  className="launcher-tile-hero group flex flex-col items-center text-center p-5 justify-between min-h-[175px] col-span-1 sm:col-span-2 lg:col-span-1"
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
                onClick={() => onNavigate(tile.id)}
                className="launcher-tile group flex flex-col items-center text-center p-5 justify-between min-h-[175px]"
              >
                {/* Top Badge for Secondary Windows */}
                {!tile.inWindow ? (
                  <span className="self-end text-[10px] font-extrabold text-text-secondary bg-gray-100/90 px-2.5 py-0.5 rounded-full border border-gray-200/90 shadow-sm flex items-center gap-1 group-hover:bg-accent/10 group-hover:text-accent group-hover:border-accent/30 transition-colors">
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
                  <span className="text-xs font-black text-text-primary block leading-tight">
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
    </div>
  )
}
