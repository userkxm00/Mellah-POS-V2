import { useEffect, useState, useRef, useCallback } from 'react'

export function useIdleTimer(timeoutMinutes: number = 5): {
  isLocked: boolean
  lockSession: () => void
  unlockSession: () => void
} {
  const [isLocked, setIsLocked] = useState<boolean>(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const resetTimer = useCallback((): void => {
    if (isLocked) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    if (timeoutMinutes <= 0) {
      // Auto-lock is disabled
      return
    }

    const ms = timeoutMinutes * 60 * 1000
    timerRef.current = setTimeout(() => {
      setIsLocked(true)
    }, ms)
  }, [isLocked, timeoutMinutes])

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
  }, [resetTimer])

  return {
    isLocked,
    lockSession: () => setIsLocked(true),
    unlockSession: () => setIsLocked(false),
  }
}
