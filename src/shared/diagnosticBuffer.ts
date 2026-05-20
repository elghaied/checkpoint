import type { DiagnosticEntry, DiagnosticLevel } from './types'

export const STORAGE_KEY = 'diagnosticLog'
export const MAX_ENTRIES = 500
export const MAX_BYTES = 200 * 1024
export const FLUSH_DEBOUNCE_MS = 150

const LEVEL_RANK: Record<DiagnosticLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

let memory: DiagnosticEntry[] = []
let hydrated = false
let verbose = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pendingFlush: Promise<void> = Promise.resolve()

function clearTimer(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

function scheduleFlush(): void {
  clearTimer()
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushNow()
  }, FLUSH_DEBOUNCE_MS)
}

function evictIfNeeded(): void {
  // Drop by count
  while (memory.length > MAX_ENTRIES) {
    dropOne()
  }
  // Drop by byte size (cheap approximation: JSON length)
  while (memory.length > 0 && JSON.stringify(memory).length > MAX_BYTES) {
    dropOne()
  }
}

function dropOne(): void {
  // Prefer evicting the OLDEST debug/info entry; only drop warn/error if no lower-level entry remains.
  let lowIdx = -1
  for (let i = 0; i < memory.length; i++) {
    if (LEVEL_RANK[memory[i].level] <= LEVEL_RANK['info']) {
      lowIdx = i
      break
    }
  }
  if (lowIdx === -1) {
    memory.shift()
  } else {
    memory.splice(lowIdx, 1)
  }
}

export function setVerbose(b: boolean): void {
  verbose = b
}

export function appendEntry(entry: DiagnosticEntry): void {
  if (entry.level === 'debug' && !verbose) return
  memory.push(entry)
  evictIfNeeded()
  if (entry.level === 'warn' || entry.level === 'error') {
    clearTimer()
    void flushNow()
  } else {
    scheduleFlush()
  }
}

async function writeToStorage(items: DiagnosticEntry[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: items }, () => resolve())
  })
}

async function readFromStorage(): Promise<DiagnosticEntry[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve((result[STORAGE_KEY] as DiagnosticEntry[]) ?? [])
    })
  })
}

export async function hydrate(): Promise<void> {
  if (hydrated) return
  const existing = await readFromStorage()
  memory = [...existing, ...memory]
  evictIfNeeded()
  hydrated = true
}

export async function flushNow(): Promise<void> {
  clearTimer()
  // Serialize flushes through a promise chain so overlapping writes can't interleave.
  pendingFlush = pendingFlush.then(async () => {
    await hydrate()
    await writeToStorage(memory)
  })
  return pendingFlush
}

export async function readBuffer(): Promise<DiagnosticEntry[]> {
  await pendingFlush
  return readFromStorage()
}

export async function clearBuffer(): Promise<void> {
  clearTimer()
  memory = []
  pendingFlush = pendingFlush.then(() => writeToStorage([]))
  return pendingFlush
}

// Test-only — never call from production code.
export function __resetBufferForTests(): void {
  clearTimer()
  memory = []
  hydrated = false
  verbose = false
  pendingFlush = Promise.resolve()
}
