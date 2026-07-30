import React from 'react'

export type EmptyStateVariant = 'cart' | 'search' | 'sales' | 'customers' | 'generic'

interface EmptyStateProps {
  readonly variant?: EmptyStateVariant
  readonly title: string
  readonly description?: string
  readonly actionLabel?: string
  readonly onAction?: () => void
  readonly className?: string
}

const illustrations: Record<EmptyStateVariant, React.JSX.Element> = {
  cart: (
    <svg className="w-16 h-16 text-text-tertiary dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      <line x1="1" y1="1" x2="23" y2="23" className="stroke-danger/60" strokeWidth="2" />
    </svg>
  ),
  search: (
    <svg className="w-16 h-16 text-text-tertiary dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  sales: (
    <svg className="w-16 h-16 text-text-tertiary dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M7 10l3-3 3 3 4-4" />
    </svg>
  ),
  customers: (
    <svg className="w-16 h-16 text-text-tertiary dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  generic: (
    <svg className="w-16 h-16 text-text-tertiary dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  ),
}

export function EmptyState({
  variant = 'generic',
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center bg-white/40 dark:bg-slate-800/40 rounded-3xl border border-gray-200/60 dark:border-slate-700/60 backdrop-blur-sm shadow-layered-sm ${className}`}>
      <div className="p-4 bg-gray-100/80 dark:bg-slate-700/50 rounded-2xl mb-4 border border-gray-200/50 dark:border-slate-600/50 shadow-inner">
        {illustrations[variant]}
      </div>
      <h3 className="text-lg font-semibold text-[#1C2B3A] dark:text-slate-100 mb-1">{title}</h3>
      {description && <p className="text-sm text-[#6B7A8D] dark:text-slate-400 max-w-sm mb-5 leading-relaxed">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-5 py-2.5 bg-accent hover:bg-accent-hover active:scale-[0.98] text-white font-medium text-sm rounded-xl shadow-hero-glow transition-all duration-150"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
