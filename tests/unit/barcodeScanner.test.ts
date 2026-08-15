import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pure keyboard wedge barcode scanner buffer logic validator
export class BarcodeScannerBuffer {
  private buffer = ''
  private bufferStartTime = 0
  private lastKeyTime = 0
  private lastScannedBarcode = ''
  private lastScanTime = 0

  constructor(
    private onScan: (barcode: string) => void,
    private thresholdMs = 50,
    private debounceMs = 300
  ) {}

  handleKeyDown(key: string, isInput: boolean, now = Date.now()): boolean {
    const timeDiff = now - this.lastKeyTime
    if (timeDiff > this.thresholdMs && this.buffer.length > 0) {
      this.buffer = ''
    }
    this.lastKeyTime = now

    if (key === 'Enter') {
      const barcode = this.buffer.trim()
      const totalDuration = now - this.bufferStartTime
      const avgKeyTime = barcode.length > 0 ? totalDuration / barcode.length : 999
      this.buffer = ''

      if (isInput && avgKeyTime > this.thresholdMs) {
        return false // Human typing in text input field
      }

      if (barcode.length >= 3) {
        if (barcode === this.lastScannedBarcode && now - this.lastScanTime < this.debounceMs) {
          return false // Debounced duplicate scan
        }
        this.lastScannedBarcode = barcode
        this.lastScanTime = now
        this.onScan(barcode)
        return true
      }
      return false
    } else if (key.length === 1) {
      if (this.buffer.length === 0) {
        this.bufferStartTime = now
      }
      this.buffer += key
      return false
    }
    return false
  }
}

describe('Barcode Scanner Logic Tests', () => {
  let onScanMock = vi.fn()

  beforeEach(() => {
    onScanMock = vi.fn()
  })

  function simulateKeystrokes(
    scanner: BarcodeScannerBuffer,
    keys: string[],
    delayMs = 10,
    isInput = false,
    startTime = 1000
  ): boolean {
    let currTime = startTime
    let handled = false
    for (const key of keys) {
      const result = scanner.handleKeyDown(key, isInput, currTime)
      if (result) handled = true
      currTime += delayMs
    }
    return handled
  }

  it('triggers onScan for rapid hardware barcode scanner input followed by Enter', () => {
    const scanner = new BarcodeScannerBuffer(onScanMock)
    simulateKeystrokes(scanner, ['1', '2', '3', '4', '5', '6', 'Enter'], 10, false)

    expect(onScanMock).toHaveBeenCalledTimes(1)
    expect(onScanMock).toHaveBeenCalledWith('123456')
  })

  it('ignores barcodes shorter than 3 characters', () => {
    const scanner = new BarcodeScannerBuffer(onScanMock)
    simulateKeystrokes(scanner, ['1', '2', 'Enter'], 10, false)

    expect(onScanMock).not.toHaveBeenCalled()
  })

  it('prevents rapid duplicate scans within the debounce window', () => {
    const scanner = new BarcodeScannerBuffer(onScanMock, 50, 300)

    // First scan "999888" at time t = 1000
    simulateKeystrokes(scanner, ['9', '9', '9', '8', '8', '8', 'Enter'], 10, false, 1000)
    expect(onScanMock).toHaveBeenCalledTimes(1)

    // Rapid duplicate scan 50ms later (t = 1120)
    simulateKeystrokes(scanner, ['9', '9', '9', '8', '8', '8', 'Enter'], 10, false, 1120)
    expect(onScanMock).toHaveBeenCalledTimes(1) // Blocked by debounce
  })

  it('ignores normal human typing in input fields followed by Enter', () => {
    const scanner = new BarcodeScannerBuffer(onScanMock, 50, 300)

    // Human typing in search input field with 200ms inter-key delay
    simulateKeystrokes(scanner, ['p', 'r', 'o', 'd', 'u', 'c', 't', 'Enter'], 200, true, 1000)

    expect(onScanMock).not.toHaveBeenCalled()
  })

  it('does nothing when Enter is pressed without prior buffer', () => {
    const scanner = new BarcodeScannerBuffer(onScanMock)
    simulateKeystrokes(scanner, ['Enter'], 10, false, 1000)

    expect(onScanMock).not.toHaveBeenCalled()
  })
})
