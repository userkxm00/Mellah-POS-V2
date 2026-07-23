type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  data?: unknown
  timestamp: string
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// In production, only show warnings and errors
const MIN_LEVEL: LogLevel = import.meta.env.DEV ? 'debug' : 'warn'

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL]
}

function formatEntry(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`
  if (entry.data !== undefined) {
    return `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`
  }
  return `${prefix} ${entry.message}`
}

function createEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
  return {
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Structured logger for MELLAH POS.
 * Use this instead of console.log (which is forbidden by eslint rules).
 * In development: logs to the dev console.
 * In production: only logs warnings and errors.
 */
export const logger = {
  debug(message: string, data?: unknown): void {
    const entry = createEntry('debug', message, data)
    if (shouldLog('debug')) {
      // eslint-disable-next-line no-console
      console.debug(formatEntry(entry))
    }
  },

  info(message: string, data?: unknown): void {
    const entry = createEntry('info', message, data)
    if (shouldLog('info')) {
      // eslint-disable-next-line no-console
      console.info(formatEntry(entry))
    }
  },

  warn(message: string, data?: unknown): void {
    const entry = createEntry('warn', message, data)
    if (shouldLog('warn')) {
      // eslint-disable-next-line no-console
      console.warn(formatEntry(entry))
    }
  },

  error(message: string, data?: unknown): void {
    const entry = createEntry('error', message, data)
    if (shouldLog('error')) {
      // eslint-disable-next-line no-console
      console.error(formatEntry(entry))
    }
  },
}
