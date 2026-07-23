import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'

export function LoginPage(): React.JSX.Element {
  const [pin, setPin] = useState<string>('')
  const loginWithPin = useAuthStore((s) => s.loginWithPin)
  const isLoading = useAuthStore((s) => s.isLoading)
  const addToast = useToastStore((s) => s.addToast)

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length < 6) {
        setPin((prev) => prev + digit)
      }
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
        addToast({ message: 'أدخل رمز PIN أولاً', variant: 'error' })
        return
      }

      try {
        const user = await loginWithPin(code)
        addToast({
          message: `مرحباً بك يا ${user.full_name} (${user.role === 'admin' ? 'مدير' : user.role === 'manager' ? 'مشرف' : 'كاشير'})`,
          variant: 'success',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'رمز PIN خاطئ'
        addToast({ message: msg, variant: 'error' })
        setPin('')
      }
    },
    [pin, loginWithPin, addToast]
  )

  // Listen to physical keyboard numeric keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key)
      } else if (e.key === 'Backspace') {
        handleBackspace()
      } else if (e.key === 'Escape') {
        handleClear()
      } else if (e.key === 'Enter') {
        handleLogin()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleDigit, handleBackspace, handleClear, handleLogin])

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg-base p-6 select-none">
      {/* Background ambient glow */}
      <div className="absolute w-[500px] h-[500px] bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      {/* Login Card */}
      <div className="relative w-full max-w-md glass-card p-8 shadow-ambient-lg border border-white/40 flex flex-col items-center">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-accent tracking-tight">MELLAH POS</h1>
          <p className="text-sm font-semibold text-text-primary mt-1">فرع الجزائر العاصمة</p>
          <p className="text-xs text-text-tertiary mt-0.5">أدخل رمز PIN لتسجيل الدخول</p>
        </div>

        {/* Masked PIN Dots */}
        <div className="flex items-center justify-center gap-3 mb-8 h-12 w-full">
          {Array.from({ length: 4 }).map((_, index) => {
            const hasValue = index < pin.length
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  hasValue
                    ? 'bg-accent scale-125 shadow-ambient-sm'
                    : 'bg-gray-200 border border-border'
                }`}
              />
            )
          })}
        </div>

        {/* Keypad Grid (3x4) */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-white/80 hover:bg-white text-text-primary font-bold text-xl shadow-ambient-sm border border-white/60 transition-all duration-150 btn-press flex items-center justify-center"
            >
              {digit}
            </button>
          ))}

          {/* Clear button */}
          <button
            type="button"
            onClick={handleClear}
            className="h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 text-text-secondary font-bold text-sm border border-border transition-all duration-150 btn-press flex items-center justify-center"
          >
            مسح C
          </button>

          {/* Zero button */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-white/80 hover:bg-white text-text-primary font-bold text-xl shadow-ambient-sm border border-white/60 transition-all duration-150 btn-press flex items-center justify-center"
          >
            0
          </button>

          {/* Backspace button */}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 text-text-secondary font-bold text-lg border border-border transition-all duration-150 btn-press flex items-center justify-center"
          >
            ⌫
          </button>
        </div>

        {/* Submit Button */}
        <Button
          variant="primary"
          size="lg"
          className="w-full max-w-[280px] mt-6 py-3.5 font-bold shadow-ambient"
          disabled={pin.length < 4}
          loading={isLoading}
          onClick={() => handleLogin()}
        >
          تسجيل الدخول →
        </Button>

        {/* Demo Fast Login Pills */}
        <div className="mt-8 pt-4 border-t border-white/20 w-full text-center space-y-2">
          <p className="text-[11px] text-text-tertiary">حسابات تجريبية سريعة:</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => {
                setPin('1234')
                handleLogin('1234')
              }}
              className="px-3 py-1 rounded-full bg-accent-light text-accent text-xs font-bold hover:bg-accent hover:text-white transition-colors"
            >
              👑 المدير (1234)
            </button>
            <button
              onClick={() => {
                setPin('0000')
                handleLogin('0000')
              }}
              className="px-3 py-1 rounded-full bg-success-light text-success text-xs font-bold hover:bg-success hover:text-white transition-colors"
            >
              👤 الكاشير (0000)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
