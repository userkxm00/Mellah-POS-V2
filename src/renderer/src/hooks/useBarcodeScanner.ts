import { useEffect, useRef } from 'react'

interface BarcodeScannerOptions {
  onScan: (barcode: string) => void
  thresholdMs?: number
  debounceMs?: number
}

/**
 * Custom hook for keyboard-wedge barcode scanners.
 * Hardware scanners type fast (< 50ms inter-keystroke) followed by Enter.
 */
export function useBarcodeScanner({
  onScan,
  thresholdMs = 50,
  debounceMs = 300,
}: BarcodeScannerOptions): void {
  const bufferRef = useRef<string>('')
  const bufferStartTimeRef = useRef<number>(0)
  const lastKeyTimeRef = useRef<number>(0)
  const lastScannedBarcodeRef = useRef<string>('')
  const lastScanTimeRef = useRef<number>(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore modifier keys
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const target = e.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      const currentTime = Date.now()
      const timeDiff = currentTime - lastKeyTimeRef.current

      // If key press interval is greater than threshold, reset buffer (human typing delay)
      if (timeDiff > thresholdMs && bufferRef.current.length > 0) {
        bufferRef.current = ''
      }

      lastKeyTimeRef.current = currentTime

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim()
        const totalDuration = currentTime - bufferStartTimeRef.current
        const avgKeyTime = barcode.length > 0 ? totalDuration / barcode.length : 999
        bufferRef.current = ''

        // Human typing in input field should NOT trigger barcode scan
        if (isInput && avgKeyTime > thresholdMs) {
          return
        }

        if (barcode.length >= 3) {
          // Prevent rapid duplicate scans within debounce window
          if (
            barcode === lastScannedBarcodeRef.current &&
            currentTime - lastScanTimeRef.current < debounceMs
          ) {
            e.preventDefault()
            return
          }

          lastScannedBarcodeRef.current = barcode
          lastScanTimeRef.current = currentTime

          if (isInput) {
            e.preventDefault()
          }

          onScan(barcode)
        }
      } else if (e.key.length === 1) {
        if (bufferRef.current.length === 0) {
          bufferStartTimeRef.current = currentTime
        }
        bufferRef.current += e.key
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onScan, thresholdMs, debounceMs])
}
