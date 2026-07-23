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
  const lastKeyTimeRef = useRef<number>(0)
  const lastScannedBarcodeRef = useRef<string>('')
  const lastScanTimeRef = useRef<number>(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore modifier keys
      if (e.ctrlKey || e.altKey || e.metaKey) return

      // Ignore input elements if human is typing inside text inputs, EXCEPT if it's barcode scanning
      const target = e.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      const currentTime = Date.now()
      const timeDiff = currentTime - lastKeyTimeRef.current

      // If key press interval is greater than threshold, reset buffer (human typing)
      if (timeDiff > thresholdMs && bufferRef.current.length > 0) {
        bufferRef.current = ''
      }

      lastKeyTimeRef.current = currentTime

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim()
        bufferRef.current = ''

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
            // Prevent submitting forms
            e.preventDefault()
          }

          onScan(barcode)
        }
      } else if (e.key.length === 1) {
        bufferRef.current += e.key
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onScan, thresholdMs, debounceMs])
}
