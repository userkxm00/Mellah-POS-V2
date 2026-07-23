import React from 'react'

type CardPadding = 'compact' | 'default' | 'spacious'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: CardPadding
  glass?: boolean
  onClick?: () => void
}

const paddingStyles: Record<CardPadding, string> = {
  compact: 'p-3',
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
    : 'bg-bg-card rounded-card shadow-ambient'

  return (
    <div
      className={[
        baseStyles,
        paddingStyles[padding],
        'transition-all duration-200 ease-smooth',
        onClick ? 'cursor-pointer hover:shadow-ambient-lg hover:-translate-y-0.5' : '',
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
