import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Lock, ShieldAlert, Clock as ClockIcon, Calendar, UserCheck, KeyRound } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'

interface SessionLockModalProps {
  readonly isOpen: boolean
  readonly onUnlock: () => void
}

export function SessionLockModal({ isOpen, onUnlock }: SessionLockModalProps): React.JSX.Element | null {
  const currentUser = useAuthStore((s) => s.currentUser)
  const addToast = useToastStore((s) => s.addToast)
  const t = useLanguageStore((s) => s.t)

  const [pin, setPin] = useState<string>('')
  const [isVerifying, setIsVerifying] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [timeStr, setTimeStr] = useState<string>('')
  const [dateStr, setDateStr] = useState<string>('')

  // Live Ticking Clock & Dynamic Date
  useEffect(() => {
    if (!isOpen) return

    const updateClock = (): void => {
      const now = new Date()
      const savedLang = localStorage.getItem('mellah_lang') || 'ar'
      const locale = savedLang === 'fr' ? 'fr-FR' : 'ar-DZ'

      setTimeStr(now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setDateStr(now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
    }

    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [isOpen])

  // Physical Keyboard Handler (0-9, Backspace, Enter)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < 6) {
          setPin((prev) => prev + e.key)
          setError(null)
        }
      } else if (e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1))
        setError(null)
      } else if (e.key === 'Enter') {
        if (pin && pin.length >= 4 && currentUser) {
          setIsVerifying(true)
          setError(null)
          window.electron
            .verifyPin(pin, currentUser.id)
            .then((res) => {
              if (res) {
                setPin('')
                addToast({ message: t('تم فتح الشاشة وإلغاء القفل بنجاح'), variant: 'success' })
                onUnlock()
              } else {
                setError(t('رمز PIN غير صحيح، يرجى المحاولة مجدداً'))
                setPin('')
              }
            })
            .catch((err) => {
              // eslint-disable-next-line no-console
              console.error('[SessionLockModal]', err)
              setError(t('حدث خطأ أثناء التحقق من الرمز'))
            })
            .finally(() => {
              setIsVerifying(false)
            })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, pin, currentUser, onUnlock, addToast, t])

  if (!isOpen || !currentUser) return null

  const handleNumClick = (num: string): void => {
    if (pin.length < 6) {
      setPin((prev) => prev + num)
      setError(null)
    }
  }

  const handleDelete = (): void => {
    setPin((prev) => prev.slice(0, -1))
    setError(null)
  }

  const handleUnlock = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault()
    if (!pin || pin.length < 4) {
      setError(t('يرجى إدخال رمز PIN المكون من 4 إلى 6 أرقام'))
      return
    }

    setIsVerifying(true)
    setError(null)
    try {
      const res = await window.electron.verifyPin(pin, currentUser.id)
      if (res) {
        setPin('')
        addToast({ message: t('تم فتح الشاشة وإلغاء القفل بنجاح'), variant: 'success' })
        onUnlock()
      } else {
        setError(t('رمز PIN غير صحيح، يرجى المحاولة مجدداً'))
        setPin('')
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SessionLockModal]', err)
      setError(t('حدث خطأ أثناء التحقق من الرمز'))
    } finally {
      setIsVerifying(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-slate-950/98 backdrop-blur-2xl text-slate-100 flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden animate-fade-in">
      {/* Ambient Pulsing Background Glow 1 */}
      <div
        style={{
          background: 'radial-gradient(circle, var(--color-accent, #0A84FF) 0%, transparent 70%)',
          animation: 'lock-pulse-glow 6s ease-in-out infinite alternate'
        }}
        className="absolute -top-32 -right-32 w-[650px] h-[650px] rounded-full blur-[150px] opacity-25 pointer-events-none"
      />

      {/* Ambient Pulsing Background Glow 2 */}
      <div
        style={{
          background: 'radial-gradient(circle, var(--color-accent-hover, #00C6FF) 0%, transparent 70%)',
          animation: 'lock-pulse-glow 8s ease-in-out infinite alternate-reverse'
        }}
        className="absolute -bottom-32 -left-32 w-[650px] h-[650px] rounded-full blur-[150px] opacity-20 pointer-events-none"
      />

      {/* Top Header Bar */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold flex items-center gap-2 backdrop-blur-md shadow-sm">
            <Lock className="w-3.5 h-3.5 animate-bounce" />
            <span>{t('🔒 الشاشة مغلقة لحماية الخصوصية والصندوق')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full backdrop-blur-md">
          <UserCheck className="w-3.5 h-3.5 text-accent" />
          <span>{currentUser.full_name}</span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-300 font-mono">ID #{currentUser.id}</span>
        </div>
      </div>

      {/* Main Screen Content Grid */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center max-w-6xl mx-auto w-full my-auto">
        {/* Left Hero Column: Clock & Standby Greeting */}
        <div className="lg:col-span-6 flex flex-col justify-center space-y-5 text-center lg:text-right">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold w-fit mx-auto lg:mx-0">
            <ClockIcon className="w-4 h-4 animate-spin" style={{ animationDuration: '10s' }} />
            <span>MELLAH POS STANDBY MODE</span>
          </div>

          <div className="space-y-1">
            <div className="text-6xl sm:text-7xl lg:text-8xl font-black font-mono tracking-tight text-white drop-shadow-2xl">
              {timeStr || '12:00:00'}
            </div>
            <div className="text-base sm:text-lg font-bold text-slate-300 flex items-center justify-center lg:justify-start gap-2 pt-1">
              <Calendar className="w-5 h-5 text-accent shrink-0" />
              <span>{dateStr}</span>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 max-w-md font-semibold leading-relaxed mx-auto lg:mx-0">
            {t('تم قفل شاشة البيع مؤقتاً لحماية مبيعاتك وصندوق النقدية. يرجى كتابة رمز الـ PIN الخاص بك لإلغاء القفل والعودة للعمل.')}
          </p>
        </div>

        {/* Right Column: Sleek Glassmorphic PIN Numpad Card */}
        <div className="lg:col-span-6 max-w-sm w-full mx-auto">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-white/10 backdrop-blur-xl shadow-2xl space-y-6">
            {/* User Avatar & Subtitle */}
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="relative">
                <div
                  style={{
                    background: 'linear-gradient(135deg, var(--color-accent, #0A84FF) 0%, var(--color-accent-hover, #00C6FF) 100%)'
                  }}
                  className="absolute -inset-1.5 rounded-full blur-md opacity-70 animate-pulse pointer-events-none"
                />
                <div
                  style={{
                    background: 'linear-gradient(135deg, var(--color-accent, #0A84FF) 0%, var(--color-accent-hover, #00C6FF) 100%)'
                  }}
                  className="relative w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-black shadow-lg border-2 border-white/30"
                >
                  {currentUser.full_name ? currentUser.full_name.charAt(0).toUpperCase() : <KeyRound className="w-7 h-7" />}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-black text-white">{currentUser.full_name}</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">{t('أدخل رمز الـ PIN لإلغاء القفل')}</p>
              </div>
            </div>

            {/* PIN Dot Indicators */}
            <div className="flex justify-center gap-3 dir-ltr py-1">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: pin.length > idx ? 'var(--color-accent, #0A84FF)' : undefined,
                    borderColor: pin.length > idx ? 'var(--color-accent, #0A84FF)' : undefined,
                    boxShadow: pin.length > idx ? '0 0 12px var(--color-accent, #0A84FF)' : undefined
                  }}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                    pin.length > idx ? 'scale-125 border-transparent' : 'border-slate-700 bg-slate-800/80'
                  }`}
                />
              ))}
            </div>

            {/* Error Message Alert */}
            {error && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold flex items-center justify-center gap-2 animate-shake">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Glass Numpad Grid */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  type="button"
                  key={num}
                  onClick={() => handleNumClick(num)}
                  className="py-3.5 rounded-2xl bg-white/5 hover:bg-white/15 active:scale-95 border border-white/10 text-xl font-black text-white backdrop-blur-md transition-all shadow-md hover:border-accent hover:shadow-accent/20 cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleDelete}
                className="py-3.5 rounded-2xl bg-white/5 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 active:scale-95 border border-white/10 text-xs font-bold text-slate-400 transition-all cursor-pointer"
              >
                {t('مسح')}
              </button>
              <button
                type="button"
                onClick={() => handleNumClick('0')}
                className="py-3.5 rounded-2xl bg-white/5 hover:bg-white/15 active:scale-95 border border-white/10 text-xl font-black text-white backdrop-blur-md transition-all shadow-md hover:border-accent cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => handleUnlock()}
                disabled={isVerifying || pin.length < 4}
                style={{
                  background:
                    pin.length >= 4
                      ? 'linear-gradient(135deg, var(--color-accent, #0A84FF) 0%, var(--color-accent-hover, #00C6FF) 100%)'
                      : undefined
                }}
                className={`py-3.5 rounded-2xl text-xs font-black transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                  pin.length >= 4
                    ? 'text-white hover:opacity-90 shadow-hero-glow'
                    : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
                }`}
              >
                {isVerifying ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{t('دخول')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer Info */}
      <div className="relative z-10 flex items-center justify-between text-[11px] font-bold text-slate-500 pt-4 border-t border-white/5">
        <span>MELLAH POS v1.0 • Standby Lock Engine</span>
        <span>{t('اضغط على أرقام لوحة المفاتيح أو الشاشة لإدخال الرمز')}</span>
      </div>

      <style>{`
        @keyframes lock-pulse-glow {
          0% { opacity: 0.15; transform: scale(0.95); }
          100% { opacity: 0.35; transform: scale(1.1); }
        }
      `}</style>
    </div>,
    document.body
  )
}
