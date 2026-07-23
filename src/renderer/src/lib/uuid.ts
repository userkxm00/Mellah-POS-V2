/**
 * Generate a UUID v4 string.
 * Uses the Web Crypto API (available in both Electron renderer and main).
 */
export function generateUUID(): string {
  return crypto.randomUUID()
}
