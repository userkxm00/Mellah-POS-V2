import React, { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function InputComponent(
    { label, error, hint, icon, className = '', id, ...props },
    ref
  ): React.JSX.Element {
    const inputId = id ?? (label ? label.replace(/\s+/g, '-').toLowerCase() : undefined)

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              'w-full px-4 py-2.5 rounded-xl text-sm',
              'bg-white border transition-all duration-200 ease-smooth',
              'placeholder:text-text-tertiary',
              'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:border-transparent',
              error
                ? 'border-danger text-danger focus:ring-danger'
                : 'border-border hover:border-text-tertiary',
              icon ? 'pr-10' : '',
              className,
            ].join(' ')}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-danger font-medium">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-text-tertiary">{hint}</p>
        )}
      </div>
    )
  }
)
