import React, { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useLanguageStore } from '@/stores/languageStore'

interface SplashScreenProps {
  onFinished: () => void
}

export function SplashScreen({ onFinished }: SplashScreenProps): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  const language = useLanguageStore((s) => s.language)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // 1. Smoothly increment progress state from 0 to 100 over 2.8 seconds
    const duration = 2800 // 2.8s
    const step = 2 // 2% increments
    const intervalTime = (duration / 100) * step

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval)
          return 100
        }
        return prev + step
      })
    }, intervalTime)

    // 2. Auto-dismiss splash screen at 3.2 seconds (holds at 100% for 400ms before fading out)
    const timer = setTimeout(() => {
      setIsFadingOut(true)
      setTimeout(onFinished, 300)
    }, 3200)

    return () => {
      clearInterval(progressInterval)
      clearTimeout(timer)
    }
  }, [onFinished])

  return (
    <div
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#F2F2F7] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 overflow-hidden select-none transition-colors duration-300 ${
        isFadingOut ? 'splash-fade-out' : ''
      }`}
    >
      {/* Ambient Pulsing Background Blob 1 */}
      <div
        style={{
          background: 'radial-gradient(circle, var(--color-accent, #0A84FF) 0%, transparent 70%)',
          animation: 'splash-pulse-glow 4s ease-in-out infinite alternate'
        }}
        className="absolute w-[600px] h-[600px] rounded-full blur-[140px] opacity-25 pointer-events-none -top-20 -right-20"
      />

      {/* Ambient Pulsing Background Blob 2 */}
      <div
        style={{
          background: 'radial-gradient(circle, var(--color-accent-hover, #00C6FF) 0%, transparent 70%)',
          animation: 'splash-pulse-glow 5s ease-in-out infinite alternate-reverse'
        }}
        className="absolute w-[600px] h-[600px] rounded-full blur-[140px] opacity-20 pointer-events-none -bottom-20 -left-20"
      />

      <div className="splash-logo flex flex-col items-center gap-6 relative z-10">
        {/* Animated Emblem Logo Box */}
        <div className="relative group">
          {/* Breathing Accent Glow */}
          <div
            style={{ background: 'linear-gradient(135deg, var(--color-accent, #0A84FF) 0%, var(--color-accent-hover, #00C6FF) 100%)' }}
            className="absolute -inset-3 rounded-[36px] blur-2xl opacity-60 animate-pulse pointer-events-none"
          />

          {/* Floating Emblem Box */}
          <div
            style={{
              background: 'linear-gradient(135deg, var(--color-accent, #0A84FF) 0%, var(--color-accent-hover, #00C6FF) 100%)',
              animation: 'splash-float 3s ease-in-out infinite'
            }}
            className="relative w-28 h-28 rounded-[32px] flex items-center justify-center shadow-hero-glow border border-white/30 overflow-hidden"
          >
            {/* Shimmer Light Sweep Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full splash-shimmer pointer-events-none" />

            {/* Monogram M Vector */}
            <svg
              className="w-16 h-16 text-white drop-shadow-md"
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

        {/* Brand Typography */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/80 dark:bg-white/10 backdrop-blur-md border border-gray-200/80 dark:border-white/20 text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-300 animate-spin" style={{ animationDuration: '6s' }} />
            <span>MELLAH POS ECOSYSTEM</span>
          </div>

          <h1
            style={{ color: 'var(--color-accent, #0A84FF)' }}
            className="text-4xl sm:text-5xl font-black tracking-[0.2em] uppercase drop-shadow-lg animate-pulse"
          >
            MELLAH POS
          </h1>
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400 tracking-widest uppercase">
            {t('نظام نقاط البيع والتشغيل الذكي')}
          </p>
        </div>

        {/* High-End Glass Loading Bar - GPU Accelerated scaleX */}
        <div className="w-56 h-1.5 rounded-full bg-gray-200 dark:bg-slate-800/80 border border-gray-300/50 dark:border-slate-700/50 overflow-hidden mt-2 p-0.5 shadow-inner relative">
          <div
            className="h-full rounded-full w-full"
            style={{
              transform: `scaleX(${progress / 100})`,
              transformOrigin: language === 'fr' ? 'left' : 'right',
              transition: 'transform 0.15s linear',
              background: 'linear-gradient(90deg, var(--color-accent, #0A84FF) 0%, var(--color-accent-hover, #00C6FF) 100%)',
              boxShadow: '0 0 12px var(--color-accent, #0A84FF)',
              willChange: 'transform'
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes splash-float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-8px) scale(1.02); }
        }
        @keyframes splash-shimmer {
          0% { transform: translateX(-150%) rotate(25deg); }
          100% { transform: translateX(150%) rotate(25deg); }
        }
        @keyframes splash-pulse-glow {
          0% { opacity: 0.15; transform: scale(0.95); }
          100% { opacity: 0.35; transform: scale(1.1); }
        }
        .splash-shimmer {
          animation: splash-shimmer 2.5s infinite ease-in-out;
        }
      `}</style>
    </div>
  )
}
