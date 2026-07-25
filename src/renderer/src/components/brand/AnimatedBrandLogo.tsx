import React from 'react'

interface AnimatedBrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
  subtitle?: string
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
          className={`relative ${currentSize.container} bg-gradient-to-br from-accent via-blue-600 to-indigo-800 flex items-center justify-center shadow-layered-md overflow-hidden border border-white/20 transition-all duration-300 group-hover:scale-105 group-hover:shadow-accent/40`}
        >
          {/* Shimmer Light Sweep Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

          {/* Discord/Microsoft Style Sleek Vector SVG Emblem */}
          <svg
            className={`${currentSize.icon} text-white drop-shadow-md transition-transform duration-500 group-hover:rotate-6`}
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Top Crown Curve / Hanger Arc */}
            <path
              d="M32 10C35.3137 10 38 12.6863 38 16C38 17.5 37.2 18.8 36 19.5L48 26C50.5 27.5 52 30.2 52 33V48C52 51.3 49.3 54 46 54H18C14.7 54 12 51.3 12 48V33C12 30.2 13.5 27.5 16 26L28 19.5C26.8 18.8 26 17.5 26 16C26 12.6863 28.6863 10 32 10Z"
              fill="url(#logo_grad_bg)"
              fillOpacity="0.25"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Minimalist Bold Monogram M & Tag Tagline */}
            <path
              d="M20 46V32L32 40L44 32V46"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Accent Gold Sparkle Dot */}
            <circle cx="32" cy="16" r="3" fill="#F59E0B" />

            {/* Gradient Definition */}
            <defs>
              <linearGradient id="logo_grad_bg" x1="12" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60A5FA" />
                <stop offset="1" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
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
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" title="System Active" />
          </div>
          {subtitle && (
            <p className={`${currentSize.sub} font-bold text-text-secondary tracking-widest uppercase opacity-85`}>
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
