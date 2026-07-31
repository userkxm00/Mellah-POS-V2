import React, { useEffect, useState } from 'react'

interface SplashScreenProps {
  onFinished: () => void
}

export function SplashScreen({ onFinished }: SplashScreenProps): React.JSX.Element {
  const [isFadingOut, setIsFadingOut] = useState(false)

  useEffect(() => {
    // Auto-dismiss after 1.4s — never block the user
    const timer = setTimeout(() => {
      setIsFadingOut(true)
      // Wait for fade-out animation to complete before signaling parent
      setTimeout(onFinished, 300)
    }, 1100)

    return () => clearTimeout(timer)
  }, [onFinished])

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F2F2F7] dark:bg-slate-950 ${
        isFadingOut ? 'splash-fade-out' : ''
      }`}
    >
      {/* Ambient background glow */}
      <div className="absolute w-[500px] h-[500px] bg-accent/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="splash-logo flex flex-col items-center gap-5 relative">
        {/* Logo icon */}
        <div
          style={{ background: 'linear-gradient(135deg, var(--color-accent, #0A84FF) 0%, var(--color-accent-hover, #00C6FF) 100%)' }}
          className="w-24 h-24 rounded-[28px] flex items-center justify-center shadow-ambient-lg border border-white/20"
        >
          <svg
            className="w-14 h-14 text-white"
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

        {/* Brand name */}
        <div className="text-center">
          <h1 className="text-4xl font-black text-accent tracking-[0.15em]">MELLAH POS</h1>
          <p className="text-sm font-bold text-text-secondary mt-2">نظام نقاط البيع الذكي</p>
        </div>

        {/* Subtle loading bar */}
        <div className="w-48 h-1 rounded-full bg-gray-200 overflow-hidden mt-4">
          <div
            className="h-full bg-accent rounded-full"
            style={{
              animation: 'splash-progress 1.1s cubic-bezier(0.4, 0, 0.2, 1) forwards',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes splash-progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  )
}
