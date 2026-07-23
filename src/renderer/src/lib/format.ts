/**
 * Format a number as Algerian Dinar currency.
 * Always outputs "DA [amount]" with thousand separators.
 * Examples: formatCurrency(12500) → "DA 12,500"
 *           formatCurrency(0) → "DA 0"
 *           formatCurrency(1234567) → "DA 1,234,567"
 */
export function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))

  return `DA ${formatted}`
}

/**
 * Format an ISO 8601 date string for display in Arabic locale.
 * Example: "2024-01-15T10:30:00.000Z" → "15 يناير 2024"
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat('ar-DZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

/**
 * Format an ISO 8601 date string with time.
 * Example: "2024-01-15T10:30:00.000Z" → "15 يناير 2024 10:30"
 */
export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat('ar-DZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * Format a time-only display.
 * Example: "2024-01-15T10:30:00.000Z" → "10:30"
 */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat('ar-DZ', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
