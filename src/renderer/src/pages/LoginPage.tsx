import React, { useState, useEffect, useCallback } from 'react'
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

const roleMeta: Record<UserRole, { label: string; icon: React.ReactNode; color: string }> = {
  admin: {
    label: useLanguageStore.getState().t('مدير النظام'),
    icon: <Crown className="w-4 h-4" />,
    color: 'bg-accent/10 text-accent border-accent/20',
  },
  manager: {
    label: useLanguageStore.getState().t('مشرف المتجر'),
    icon: <Briefcase className="w-4 h-4" />,
    color: 'bg-warning/10 text-warning border-warning/20',
  },
  cashier: {
    label: useLanguageStore.getState().t('كاشير'),
    icon: <UserCheck className="w-4 h-4" />,
    color: 'bg-success/10 text-success border-success/20',
  },
}

export function LoginPage(): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full">
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
                    onClick={() => setSelectedUser(user)}
                    className="user-tile group"
                  >
                    {/* Avatar circle */}
                    <div className="w-16 h-16 rounded-full bg-accent/10 text-accent font-black text-xl flex items-center justify-center border-2 border-accent/20 group-hover:bg-accent group-hover:text-white group-hover:border-accent transition-all duration-200">
                      {initials}
                    </div>

                    {/* Name */}
                    <span className="text-sm font-extrabold text-text-primary text-center leading-tight">
                      {user.full_name}
                    </span>

                    {/* Role badge */}
                    <span
                      className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.color}`}
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
    <div className="flex h-screen w-screen items-center justify-center bg-[#F2F2F7] p-6 select-none relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl pointer-events-none -top-20 -right-20" />
      <div className="absolute w-[400px] h-[400px] bg-accent/5 rounded-full blur-3xl pointer-events-none -bottom-10 -left-10" />

      {/* PIN Card */}
      <div className="relative w-full max-w-md bg-white/90 backdrop-blur-2xl p-8 rounded-3xl shadow-ambient-lg border border-white flex flex-col items-center page-enter">
        {/* Back button */}
        <button
          onClick={handleBackToUserPicker}
          className="absolute top-5 right-5 flex items-center gap-1 text-xs font-bold text-text-tertiary hover:text-accent transition-colors"
        >
          <span>{t('العودة')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Selected user avatar */}
        <div className="w-20 h-20 rounded-full bg-accent/10 text-accent font-black text-2xl flex items-center justify-center border-2 border-accent/20 mb-3">
          {initials}
        </div>

        <h2 className="text-lg font-black text-text-primary">{selectedUser.full_name}</h2>
        <span
          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border mt-1.5 ${meta.color}`}
        >
          {meta.icon}
          <span>{t(meta.label)}</span>
        </span>

        <p className="text-xs text-text-secondary mt-4 mb-6">{t('أدخل رمز PIN الخاص بك')}</p>

        {/* Masked PIN Dots */}
        <div className="flex items-center justify-center gap-3.5 mb-8 h-10 w-full">
          {Array.from({ length: 4 }).map((_, index) => {
            const hasValue = index < pin.length
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  hasValue
                    ? 'bg-accent scale-125 shadow-ambient-sm ring-4 ring-accent/20'
                    : 'bg-gray-200 border border-gray-300'
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
              className="h-14 rounded-2xl bg-white hover:bg-gray-50 text-text-primary font-black text-xl shadow-ambient-sm border border-gray-200/80 transition-all duration-150 btn-press flex items-center justify-center"
            >
              {digit}
            </button>
          ))}

          {/* Clear */}
          <button
            type="button"
            onClick={handleClear}
            className="h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 text-text-secondary font-bold text-xs border border-gray-200/80 transition-all duration-150 btn-press flex items-center justify-center"
          >
            {t('مسح C')}
          </button>

          {/* Zero */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-white hover:bg-gray-50 text-text-primary font-black text-xl shadow-ambient-sm border border-gray-200/80 transition-all duration-150 btn-press flex items-center justify-center"
          >
            0
          </button>

          {/* Backspace */}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 text-text-secondary font-bold text-lg border border-gray-200/80 transition-all duration-150 btn-press flex items-center justify-center"
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
