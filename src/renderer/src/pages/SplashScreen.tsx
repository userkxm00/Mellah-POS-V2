import React, { useEffect, useState } from 'react'
import { Store } from 'lucide-react'

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
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F2F2F7] ${
        isFadingOut ? 'splash-fade-out' : ''
      }`}
    >
      {/* Ambient background glow */}
      <div className="absolute w-[500px] h-[500px] bg-accent/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="splash-logo flex flex-col items-center gap-5 relative">
        {/* Logo icon */}
        <div className="w-24 h-24 rounded-[28px] bg-accent flex items-center justify-center shadow-ambient-lg">
          <Store className="w-12 h-12 text-white" />
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
