import React, { forwardRef } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: React.ReactNode
  isValid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function InputComponent(
    { label, error, hint, icon, isValid, className = '', id, ...props },
    ref
  ): React.JSX.Element {
    const inputId = id ?? (label ? label.replace(/\s+/g, '-').toLowerCase() : undefined)

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-extrabold text-[#1C2B3A] dark:text-slate-200"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7A8D] dark:text-slate-400 pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              'w-full px-4 py-2.5 rounded-2xl text-xs font-bold',
              'bg-gray-50 dark:bg-slate-800/80 border transition-all duration-150',
              'placeholder:text-gray-400 dark:placeholder:text-slate-500 text-[#1C2B3A] dark:text-slate-100',
              'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 dark:focus:ring-offset-slate-900 focus:bg-white dark:focus:bg-slate-900',
              error
                ? 'border-danger/80 text-danger focus:ring-danger bg-danger/5'
                : isValid
                  ? 'border-success/60 focus:ring-success bg-success/5'
                  : 'border-gray-200/80 dark:border-slate-700/80 hover:border-gray-300 dark:hover:border-slate-600',
              icon ? 'pr-10' : '',
              isValid && !error ? 'pl-9' : '',
              className,
            ].join(' ')}
            {...props}
          />
          {isValid && !error && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-success animate-scale-in pointer-events-none">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          )}
        </div>

        {error && (
          <p className="text-[11px] font-bold text-danger flex items-center gap-1 mt-0.5 animate-slide-down">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {hint && !error && (
          <p className="text-[11px] font-medium text-[#6B7A8D] dark:text-slate-400 mt-0.5">{hint}</p>
        )}
      </div>
    )
  }
)
