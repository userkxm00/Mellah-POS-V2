import React from 'react'

type CardPadding = 'compact' | 'default' | 'spacious'

interface CardProps {
  readonly children: React.ReactNode
  readonly className?: string
  readonly padding?: CardPadding
  readonly glass?: boolean
  readonly onClick?: () => void
}

const paddingStyles: Record<CardPadding, string> = {
  compact: 'p-3.5',
  default: 'p-5',
  spacious: 'p-7',
}

export function Card({
  children,
  className = '',
  padding = 'default',
  glass = false,
  onClick,
}: CardProps): React.JSX.Element {
  const baseStyles = glass
    ? 'glass-card'
    : 'bg-white dark:bg-slate-900/90 rounded-3xl border border-gray-200/80 dark:border-slate-800 shadow-layered-sm'

  return (
    <div
      className={[
        baseStyles,
        paddingStyles[padding],
        'transition-all duration-200 ease-smooth',
        onClick ? 'cursor-pointer hover:shadow-layered hover:-translate-y-1 active:translate-y-0 active:scale-[0.99]' : '',
        className,
      ].join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}
