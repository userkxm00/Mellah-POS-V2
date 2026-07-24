import { useEffect, useState, useRef } from 'react'

export function useIdleTimer(timeoutMinutes: number = 5): {
  isLocked: boolean
  lockSession: () => void
  unlockSession: () => void
} {
  const [isLocked, setIsLocked] = useState<boolean>(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const resetTimer = (): void => {
    if (isLocked) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    const ms = Math.max(1, timeoutMinutes) * 60 * 1000
    timerRef.current = setTimeout(() => {
      setIsLocked(true)
    }, ms)
  }

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']

    const handleUserActivity = (): void => {
      resetTimer()
    }

    events.forEach((evt) => window.addEventListener(evt, handleUserActivity))
    resetTimer()

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [timeoutMinutes, isLocked])

  return {
    isLocked,
    lockSession: () => setIsLocked(true),
    unlockSession: () => setIsLocked(false),
  }
}
