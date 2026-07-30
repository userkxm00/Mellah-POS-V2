import React, { useEffect, useState, useRef } from 'react'
import { useToastStore, type Toast as ToastType } from '@/stores/toastStore'

const variantStyles: Record<ToastType['variant'], { bg: string; icon: string; border: string; progress: string }> = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/60',
    icon: '✓',
    border: 'border-emerald-200 dark:border-emerald-800/60',
    progress: 'bg-emerald-500',
  },
  error: {
    bg: 'bg-rose-50 dark:bg-rose-950/60',
    icon: '✕',
    border: 'border-rose-200 dark:border-rose-800/60',
    progress: 'bg-rose-500',
  },
  info: {
    bg: 'bg-sky-50 dark:bg-sky-950/60',
    icon: 'ℹ',
    border: 'border-sky-200 dark:border-sky-800/60',
    progress: 'bg-sky-500',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/60',
    icon: '⚠',
    border: 'border-amber-200 dark:border-amber-800/60',
    progress: 'bg-amber-500',
  },
}

const variantIconBg: Record<ToastType['variant'], string> = {
  success: 'bg-emerald-500 text-white',
  error: 'bg-rose-500 text-white',
  info: 'bg-sky-500 text-white',
  warning: 'bg-amber-500 text-white',
}

function ToastItem({ toast }: { readonly toast: ToastType }): React.JSX.Element {
  const removeToast = useToastStore((s) => s.removeToast)
  const styles = variantStyles[toast.variant]

  const DURATION = 4000
  const [progress, setProgress] = useState(100)
  const [isHovered, setIsHovered] = useState(false)
  const startTimeRef = useRef<number>(Date.now())
  const remainingTimeRef = useRef<number>(DURATION)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    if (!isHovered) {
      startTimeRef.current = Date.now()
      const totalTime = remainingTimeRef.current

      interval = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current
        const remaining = Math.max(0, totalTime - elapsed)
        remainingTimeRef.current = remaining
        const pct = (remaining / DURATION) * 100

        setProgress(pct)

        if (remaining <= 0) {
          clearInterval(interval)
          removeToast(toast.id)
        }
      }, 50)
    }

    return () => clearInterval(interval)
  }, [isHovered, toast.id, removeToast])

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => removeToast(toast.id)}
      className={[
        'relative flex items-center gap-3 px-4 py-3.5 rounded-2xl border shadow-hero-glow overflow-hidden transition-all duration-200 cursor-pointer select-none',
        'toast-enter',
        'min-w-[320px] max-w-[440px]',
        styles.bg,
        styles.border,
      ].join(' ')}
      role="alert"
    >
      <span
        className={[
          'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-layered-sm',
          variantIconBg[toast.variant],
        ].join(' ')}
      >
        {styles.icon}
      </span>
      <p className="flex-1 text-sm font-semibold text-[#1C2B3A] dark:text-slate-100">{toast.message}</p>
      <button
        type="button"
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-text-tertiary dark:text-slate-400 transition-colors"
        aria-label="إغلاق"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Countdown Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/5 dark:bg-white/5">
        <div
          className={`h-full ${styles.progress} transition-all duration-75 ease-linear`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export function ToastContainer(): React.JSX.Element {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return <></>

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[99999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  )
}
