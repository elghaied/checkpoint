import type { DiagnosticEntry, DiagnosticLevel } from './types'

const LEVEL_PRIORITY: Record<DiagnosticLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Console output rules: unchanged.
// Dev: all levels go to console.  Prod: warn+ only.
const MIN_CONSOLE_LEVEL: DiagnosticLevel = import.meta.env.DEV ? 'debug' : 'warn'

function shouldConsole(level: DiagnosticLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_CONSOLE_LEVEL]
}

type Sink = (entry: Omit<DiagnosticEntry, 'ctx'>) => void
let bufferSink: Sink = () => {} // no-op until a context installs one

export function setBufferSink(sink: Sink): void {
  bufferSink = sink
}

function joinArgs(args: unknown[]): { msg: string; data?: unknown } {
  if (args.length === 0) return { msg: '' }
  const first = args[0]
  const rest = args.slice(1)
  const msg = String(first)
  if (rest.length === 0) return { msg }
  // If second arg is an object, expose it as `data`; otherwise stringify everything.
  const second = rest[0]
  if (second && typeof second === 'object') {
    return { msg, data: rest.length === 1 ? second : rest }
  }
  return { msg: [msg, ...rest.map(String)].join(' ') }
}

function emit(level: DiagnosticLevel, tag: string, args: unknown[]): void {
  const { msg, data } = joinArgs(args)
  bufferSink({ ts: Date.now(), level, tag, msg, data })
}

export function createLogger(tag: string) {
  const prefix = `[${tag}]`
  return {
    debug: (...args: unknown[]) => {
      if (shouldConsole('debug')) console.log(prefix, ...args)
      emit('debug', tag, args)
    },
    info: (...args: unknown[]) => {
      if (shouldConsole('info')) console.log(prefix, ...args)
      emit('info', tag, args)
    },
    warn: (...args: unknown[]) => {
      if (shouldConsole('warn')) console.warn(prefix, ...args)
      emit('warn', tag, args)
    },
    error: (...args: unknown[]) => {
      if (shouldConsole('error')) console.error(prefix, ...args)
      emit('error', tag, args)
    },
  }
}
