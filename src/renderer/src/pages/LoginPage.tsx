import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Delete,
  ArrowLeft,
  Crown,
  UserCheck,
  Briefcase,
  ChevronRight,
  KeyRound
} from 'lucide-react'
import { Button } from '@/components/ui'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { AnimatedBrandLogo } from '@/components/brand/AnimatedBrandLogo'
import type { UserRole } from '@/types/database'

interface LocalUser {
  id: string
  full_name: string
  role: UserRole
}

export function LoginPage(): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  useLanguageStore((s) => s.version)

  const roleMeta = useMemo<Record<UserRole, { label: string; icon: React.ReactNode; color: string }>>(
    () => ({
      admin: {
        label: t('مدير النظام'),
        icon: <Crown className="w-3.5 h-3.5" />,
        color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      },
      manager: {
        label: t('مشرف المتجر'),
        icon: <Briefcase className="w-3.5 h-3.5" />,
        color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      },
      cashier: {
        label: t('كاشير'),
        icon: <UserCheck className="w-3.5 h-3.5" />,
        color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      },
    }),
    [t]
  )
  const [users, setUsers] = useState<LocalUser[]>([])
  const [selectedUser, setSelectedUser] = useState<LocalUser | null>(null)
  const [pin, setPin] = useState<string>('')
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)

  const loginWithPin = useAuthStore((s) => s.loginWithPin)
  const isLoading = useAuthStore((s) => s.isLoading)
  const addToast = useToastStore((s) => s.addToast)

  // Load local users on mount
  useEffect(() => {
    (async () => {
      try {
        const rows = await window.electron.db.query<LocalUser>(
          `SELECT id, full_name, role FROM users WHERE deleted_at IS NULL ORDER BY role ASC, full_name ASC`
        )
        setUsers(rows)
      } catch (err) {// eslint-disable-next-line no-console
      console.error("[LoginPage]", err); addToast({ message: t('فشل تحميل قائمة المستخدمين'), variant: 'error' })
      } finally {
        setIsLoadingUsers(false)
      }
    })()
  }, [addToast, t])

  // ── PIN input handlers ──
  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length < 6) setPin((prev) => prev + digit)
    },
    [pin]
  )

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1))
  }, [])

  const handleClear = useCallback(() => {
    setPin('')
  }, [])

  const handleLogin = useCallback(
    async (pinToSubmit?: string) => {
      const code = pinToSubmit ?? pin
      if (!code) {
        addToast({ message: t('أدخل رمز PIN أولاً'), variant: 'error' })
        return
      }
      try {
        const targetUserId =
          selectedUser && selectedUser.id !== '__manual__' ? selectedUser.id : undefined
        const user = await loginWithPin(code, targetUserId)
        addToast({
          message: `${t('مرحباً بك يا')} ${user.full_name}`,
          variant: 'success',
        })
      } catch (err) {
        const msg = err instanceof Error ? t(err.message) : t('رمز PIN غير صحيح')
        addToast({ message: msg, variant: 'error' })
        setPin('')
      }
    },
    [pin, selectedUser, loginWithPin, addToast, t]
  )

  const handleBackToUserPicker = useCallback(() => {
    setSelectedUser(null)
    setPin('')
  }, [])

  // Physical keyboard listener
  useEffect(() => {
    if (!selectedUser) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key)
      else if (e.key === 'Backspace') handleBackspace()
      else if (e.key === 'Escape') handleBackToUserPicker()
      else if (e.key === 'Enter') handleLogin()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedUser, handleDigit, handleBackspace, handleBackToUserPicker, handleLogin])

  // ════════════════════════════════════════════
  // PHASE 1 — User Picker Grid
  // ════════════════════════════════════════════
  if (!selectedUser) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#F2F2F7] dark:bg-slate-950 p-6 select-none relative overflow-hidden">
        {/* Modern 3-Blob Ambient Moving Glow */}
        <div className="absolute w-[650px] h-[650px] bg-gradient-to-tr from-accent/20 to-blue-400/20 rounded-full blur-3xl pointer-events-none -top-32 -right-32 animate-blob" />
        <div className="absolute w-[500px] h-[500px] bg-gradient-to-br from-purple-500/15 to-accent/15 rounded-full blur-3xl pointer-events-none -bottom-20 -left-20 animate-blob animation-delay-2000" />
        <div className="absolute w-[400px] h-[400px] bg-gradient-to-r from-emerald-500/10 to-teal-400/15 rounded-full blur-3xl pointer-events-none top-1/3 left-1/3 animate-blob animation-delay-4000" />

        <div className="relative w-full max-w-2xl flex flex-col items-center page-enter">
          {/* Brand Header */}
          <AnimatedBrandLogo size="lg" subtitle={t('الفرع الرئيسي')} className="mb-2" />

          <p className="text-sm font-bold text-text-secondary mt-4 mb-8">
            {t('اختر حسابك لتسجيل الدخول')}
          </p>

          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-3 border-accent border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
              {users.map((user) => {
                const meta = roleMeta[user.role]
                const initials = user.full_name
                  .split(' ')
                  .map((w) => w.charAt(0))
                  .slice(0, 2)
                  .join('')

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUser(user)}
                    className="p-6 rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-gray-200/80 dark:border-slate-800 shadow-md hover:shadow-2xl hover:border-accent/60 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col items-center gap-3.5 group relative overflow-hidden"
                  >
                    {/* Ambient Hover Accent Sheen */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                    {/* Avatar circle */}
                    <div className="relative">
                      <div
                        style={{
                          background: 'linear-gradient(135deg, var(--color-accent, #0A84FF) 0%, var(--color-accent-hover, #00C6FF) 100%)'
                        }}
                        className="absolute -inset-1 rounded-full blur-sm opacity-50 group-hover:opacity-100 group-hover:blur-md transition-all pointer-events-none"
                      />
                      <div
                        style={{
                          background: 'linear-gradient(135deg, var(--color-accent, #0A84FF) 0%, var(--color-accent-hover, #00C6FF) 100%)'
                        }}
                        className="relative w-16 h-16 rounded-full text-white font-black text-xl flex items-center justify-center border-2 border-white/40 shadow-md group-hover:scale-105 transition-transform"
                      >
                        {initials || <UserCheck className="w-7 h-7" />}
                      </div>
                    </div>

                    {/* Name */}
                    <span className="text-base font-black text-slate-800 dark:text-slate-100 text-center leading-snug group-hover:text-accent transition-colors">
                      {user.full_name}
                    </span>

                    {/* Role badge */}
                    <span
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${meta.color}`}
                    >
                      {meta.icon}
                      <span>{t(meta.label)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Fallback: manual PIN entry without picking user */}
          <button
            onClick={() => setSelectedUser({ id: '__manual__', full_name: t('مستخدم آخر'), role: 'cashier' })}
            className="mt-8 text-xs font-bold text-text-tertiary hover:text-accent transition-colors flex items-center gap-1"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{t('الدخول برمز PIN مباشرة بدون اختيار حساب')}</span>
          </button>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════
  // PHASE 2 — PIN Entry for Selected User
  // ════════════════════════════════════════════
  const meta = roleMeta[selectedUser.role]
  const initials = selectedUser.full_name
    .split(' ')
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('')

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#F2F2F7] dark:bg-slate-950 p-6 select-none relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl pointer-events-none -top-20 -right-20" />
      <div className="absolute w-[400px] h-[400px] bg-accent/5 rounded-full blur-3xl pointer-events-none -bottom-10 -left-10" />

      {/* PIN Card */}
      <div className="relative w-full max-w-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl p-8 rounded-3xl shadow-ambient-lg border border-white dark:border-slate-800 flex flex-col items-center page-enter">
        {/* Back button */}
        <button
          onClick={handleBackToUserPicker}
          className="absolute top-5 right-5 flex items-center gap-1 text-xs font-bold text-text-tertiary dark:text-slate-400 hover:text-accent transition-colors"
        >
          <span>{t('العودة')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Selected user avatar */}
        <div className="w-20 h-20 rounded-full bg-accent/10 text-accent font-black text-2xl flex items-center justify-center border-2 border-accent/20 mb-3">
          {initials}
        </div>

        <h2 className="text-lg font-black text-text-primary dark:text-slate-100">{selectedUser.full_name}</h2>
        <span
          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border mt-1.5 ${meta.color}`}
        >
          {meta.icon}
          <span>{t(meta.label)}</span>
        </span>

        <p className="text-xs text-text-secondary dark:text-slate-400 mt-4 mb-6">{t('أدخل رمز PIN الخاص بك')}</p>

        {/* Masked PIN Dots */}
        <div className="flex items-center justify-center gap-3.5 mb-8 h-10 w-full">
          {Array.from({ length: 4 }).map((_, index) => {
            const hasValue = index < pin.length
            return (
              <div
                key={`pin-dot-${index}`}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  hasValue
                    ? 'bg-accent scale-125 shadow-ambient-sm ring-4 ring-accent/20'
                    : 'bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600'
                }`}
              />
            )
          })}
        </div>

        {/* Keypad Grid (3×4) — Forced LTR for standard left-to-right 1-2-3 layout */}
        <div dir="ltr" className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-text-primary dark:text-slate-100 font-black text-xl shadow-ambient-sm border border-gray-200/80 dark:border-slate-700/80 transition-all duration-150 btn-press flex items-center justify-center"
            >
              {digit}
            </button>
          ))}

          {/* Clear */}
          <button
            type="button"
            onClick={handleClear}
            className="h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-text-secondary dark:text-slate-300 font-bold text-xs border border-gray-200/80 dark:border-slate-700/80 transition-all duration-150 btn-press flex items-center justify-center"
          >
            {t('مسح C')}
          </button>

          {/* Zero */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-text-primary dark:text-slate-100 font-black text-xl shadow-ambient-sm border border-gray-200/80 dark:border-slate-700/80 transition-all duration-150 btn-press flex items-center justify-center"
          >
            0
          </button>

          {/* Backspace */}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-text-secondary dark:text-slate-300 font-bold text-lg border border-gray-200/80 dark:border-slate-700/80 transition-all duration-150 btn-press flex items-center justify-center"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Submit Button */}
        <Button
          variant="primary"
          size="lg"
          className="w-full max-w-[280px] mt-6 py-3.5 font-bold shadow-ambient flex items-center justify-center gap-2"
          disabled={pin.length < 4}
          loading={isLoading}
          onClick={() => handleLogin()}
        >
          <span>{t('تسجيل الدخول')}</span>
          <ArrowLeft className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
