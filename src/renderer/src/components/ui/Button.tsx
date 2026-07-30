import React from 'react'

// ----- Types -----

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly loading?: boolean
  readonly children: React.ReactNode
}

// ----- Style maps -----

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover shadow-hero-glow hover:shadow-layered-lg active:scale-[0.98]',
  secondary:
    'bg-white dark:bg-slate-800 text-[#1C2B3A] dark:text-slate-100 border border-gray-200/80 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-750 shadow-layered-sm hover:shadow-layered active:scale-[0.98]',
  danger:
    'bg-danger text-white hover:brightness-110 shadow-layered-sm active:scale-[0.98]',
  ghost:
    'bg-transparent text-[#6B7A8D] dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-[#1C2B3A] dark:hover:text-slate-100 active:scale-[0.98]',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs font-semibold rounded-xl gap-1.5',
  md: 'px-4 py-2.5 text-sm font-semibold rounded-2xl gap-2',
  lg: 'px-6 py-3 text-base font-bold rounded-2xl gap-2.5',
}

// ----- Component -----

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center',
        'transition-all duration-150 ease-smooth select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        variantStyles[variant],
        sizeStyles[size],
        isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
        className,
      ].join(' ')}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}
