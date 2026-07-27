import React, { useEffect, useRef, useState } from 'react'

interface CountUpNumberProps {
  value: number
  duration?: number
  formatter?: (val: number) => string
  className?: string
}

export function CountUpNumber({
  value,
  duration = 200,
  formatter,
  className = '',
}: CountUpNumberProps): React.JSX.Element {
  const [displayValue, setDisplayValue] = useState(value)
  const prevValueRef = useRef(value)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const startValue = prevValueRef.current
    const endValue = value

    if (startValue === endValue) {
      setDisplayValue(endValue)
      return
    }

    const startTime = performance.now()

    const update = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / duration)
      // Ease out quad
      const easedProgress = 1 - (1 - progress) * (1 - progress)
      const current = startValue + (endValue - startValue) * easedProgress

      setDisplayValue(current)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(update)
      } else {
        setDisplayValue(endValue)
        prevValueRef.current = endValue
      }
    }

    animationFrameRef.current = requestAnimationFrame(update)

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [value, duration])

  const formattedOutput = formatter ? formatter(displayValue) : Math.round(displayValue).toLocaleString()

  return (
    <span className={`tabular-nums transition-colors duration-150 ${className}`}>
      {formattedOutput}
    </span>
  )
}
