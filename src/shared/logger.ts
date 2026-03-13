type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// In production builds, only show warnings and errors
const MIN_LEVEL: LogLevel = import.meta.env.DEV ? 'debug' : 'warn'

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL]
}

export function createLogger(tag: string) {
  const prefix = `[${tag}]`

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) console.log(prefix, ...args)
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) console.log(prefix, ...args)
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(prefix, ...args)
    },
    error: (...args: unknown[]) => {
      if (shouldLog('error')) console.error(prefix, ...args)
    },
  }
}
