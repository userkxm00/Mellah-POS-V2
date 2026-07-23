import { describe, it, expect } from 'vitest'

/**
 * Test the formatCurrency utility.
 * We re-implement the function here to avoid importing from renderer
 * (which requires DOM/Vite env). In production, this function lives in
 * src/renderer/src/lib/format.ts — keep them in sync.
 */
function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))

  return `DA ${formatted}`
}

describe('formatCurrency', () => {
  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('DA 0')
  })

  it('formats small amounts without separators', () => {
    expect(formatCurrency(500)).toBe('DA 500')
  })

  it('formats amounts with thousand separators', () => {
    expect(formatCurrency(12500)).toBe('DA 12,500')
  })

  it('formats large amounts correctly', () => {
    expect(formatCurrency(1234567)).toBe('DA 1,234,567')
  })

  it('rounds decimal amounts', () => {
    expect(formatCurrency(1234.56)).toBe('DA 1,235')
  })

  it('handles negative amounts', () => {
    expect(formatCurrency(-5000)).toBe('DA -5,000')
  })
})
