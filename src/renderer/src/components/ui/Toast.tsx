import React from 'react'
import { useToastStore, type Toast as ToastType } from '@/stores/toastStore'

// ----- Variant styles -----

const variantStyles: Record<ToastType['variant'], { bg: string; icon: string; border: string }> = {
  success: {
    bg: 'bg-success-light',
    icon: '✓',
    border: 'border-success/20',
  },
  error: {
    bg: 'bg-danger-light',
    icon: '✕',
    border: 'border-danger/20',
  },
  info: {
    bg: 'bg-accent-light',
    icon: 'ℹ',
    border: 'border-accent/20',
  },
  warning: {
    bg: 'bg-warning-light',
    icon: '⚠',
    border: 'border-warning/20',
  },
}

const variantIconBg: Record<ToastType['variant'], string> = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  info: 'bg-accent text-white',
  warning: 'bg-warning text-white',
}

// ----- Single toast -----

function ToastItem({ toast }: { toast: ToastType }): React.JSX.Element {
  const removeToast = useToastStore((s) => s.removeToast)
  const styles = variantStyles[toast.variant]

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-ambient-sm',
        'toast-enter',
        'min-w-[300px] max-w-[420px]',
        styles.bg,
        styles.border,
      ].join(' ')}
      role="alert"
    >
      <span
        className={[
          'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
          variantIconBg[toast.variant],
        ].join(' ')}
      >
        {variantStyles[toast.variant].icon}
      </span>
      <p className="flex-1 text-sm font-medium text-text-primary">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 p-1 rounded hover:bg-black/5 text-text-tertiary transition-colors duration-150"
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
    </div>
  )
}

// ----- Toast container (renders at top-left for RTL) -----

export function ToastContainer(): React.JSX.Element {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div className="fixed top-4 left-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
