import React from 'react'

interface AnimatedBrandLogoProps {
  readonly size?: 'sm' | 'md' | 'lg' | 'xl'
  readonly showText?: boolean
  readonly className?: string
  readonly subtitle?: string
}

export function AnimatedBrandLogo({
  size = 'md',
  showText = true,
  className = '',
  subtitle = 'MANAGEMENT & POS'
}: AnimatedBrandLogoProps): React.JSX.Element {
  const sizeMap = {
    sm: { container: 'w-8 h-8 rounded-xl', icon: 'w-5 h-5', title: 'text-sm', sub: 'text-[9px]' },
    md: { container: 'w-11 h-11 rounded-2xl', icon: 'w-7 h-7', title: 'text-lg', sub: 'text-[10px]' },
    lg: { container: 'w-14 h-14 rounded-2xl', icon: 'w-9 h-9', title: 'text-2xl', sub: 'text-xs' },
    xl: { container: 'w-20 h-20 rounded-3xl', icon: 'w-12 h-12', title: 'text-3xl', sub: 'text-xs' }
  }

  const currentSize = sizeMap[size]

  return (
    <div className={`flex items-center gap-3.5 select-none ${className}`}>
      {/* Animated Emblem Container */}
      <div className="relative group cursor-pointer">
        {/* Breathing Ambient Glow */}
        <div className="absolute -inset-1 bg-gradient-to-r from-accent via-indigo-500 to-amber-400 rounded-3xl blur-md opacity-40 group-hover:opacity-75 transition duration-500 animate-pulse" />

        {/* Outer Icon Box */}
        <div
          className={`relative ${currentSize.container} bg-[#0A6EDB] flex items-center justify-center shadow-layered-md overflow-hidden border border-white/20 transition-all duration-300 group-hover:scale-105 group-hover:shadow-blue-500/40`}
        >
          {/* Shimmer Light Sweep Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

          {/* Minimalist World-Class Monogram M Vector */}
          <svg
            className={`${currentSize.icon} text-white drop-shadow-md transition-transform duration-500 group-hover:scale-105`}
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M140,342 L140,178 L256,292 L372,178 L372,342"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="46"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Typography */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <h1 className={`${currentSize.title} font-black text-accent tracking-wider leading-tight drop-shadow-sm`}>
              MELLAH POS
            </h1>
          </div>
          {subtitle && (
            <p className={`${currentSize.sub} font-black text-text-primary dark:text-slate-300 tracking-widest uppercase`}>
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
