import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import '../__mocks__/chrome'
import { resetChromeStorage } from '../__mocks__/chrome'

import {
  appendEntry,
  flushNow,
  clearBuffer,
  readBuffer,
  setVerbose,
  hydrate,
  __resetBufferForTests,
  STORAGE_KEY,
  MAX_ENTRIES,
  MAX_BYTES,
  FLUSH_DEBOUNCE_MS,
} from './diagnosticBuffer'
import type { DiagnosticEntry } from './types'

function makeEntry(over: Partial<DiagnosticEntry> = {}): DiagnosticEntry {
  return {
    ts: 1000,
    level: 'info',
    tag: 'test',
    ctx: 'sw',
    msg: 'hello',
    ...over,
  }
}

beforeEach(() => {
  resetChromeStorage()
  __resetBufferForTests()
  setVerbose(false)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('diagnosticBuffer', () => {
  it('appends info/warn/error by default; drops debug when verbose=false', async () => {
    appendEntry(makeEntry({ level: 'debug' }))
    appendEntry(makeEntry({ level: 'info' }))
    appendEntry(makeEntry({ level: 'warn' }))
    appendEntry(makeEntry({ level: 'error' }))
    await flushNow()
    const buf = await readBuffer()
    expect(buf.map((e) => e.level)).toEqual(['info', 'warn', 'error'])
  })

  it('appends debug when verbose=true', async () => {
    setVerbose(true)
    appendEntry(makeEntry({ level: 'debug' }))
    await flushNow()
    expect((await readBuffer()).map((e) => e.level)).toEqual(['debug'])
  })

  it('evicts oldest debug/info first when over MAX_ENTRIES, keeping warn/error', async () => {
    // Fill with MAX_ENTRIES info entries
    for (let i = 0; i < MAX_ENTRIES; i++) {
      appendEntry(makeEntry({ level: 'info', msg: `info-${i}`, ts: i }))
    }
    // Insert an error in the middle by appending now (would evict oldest info)
    appendEntry(makeEntry({ level: 'error', msg: 'boom', ts: 9999 }))
    await flushNow()
    const buf = await readBuffer()
    expect(buf.length).toBe(MAX_ENTRIES)
    // The error entry must be present
    expect(buf.some((e) => e.msg === 'boom' && e.level === 'error')).toBe(true)
    // The very oldest info entry must have been evicted
    expect(buf.some((e) => e.msg === 'info-0')).toBe(false)
  })

  it('prefers evicting debug/info over warn/error when at capacity', async () => {
    // Fill 99% with warn entries and 1 with info
    appendEntry(makeEntry({ level: 'info', msg: 'evict-me', ts: 1 }))
    for (let i = 0; i < MAX_ENTRIES - 1; i++) {
      appendEntry(makeEntry({ level: 'warn', msg: `warn-${i}`, ts: 100 + i }))
    }
    // One more append should drop the 'evict-me' info, not any warn
    appendEntry(makeEntry({ level: 'warn', msg: 'final-warn', ts: 9999 }))
    await flushNow()
    const buf = await readBuffer()
    expect(buf.some((e) => e.msg === 'evict-me')).toBe(false)
    expect(buf.filter((e) => e.level === 'warn').length).toBe(MAX_ENTRIES)
  })

  it('drops warn/error only when no lower-level entries remain', async () => {
    for (let i = 0; i < MAX_ENTRIES; i++) {
      appendEntry(makeEntry({ level: 'warn', msg: `warn-${i}`, ts: i }))
    }
    appendEntry(makeEntry({ level: 'error', msg: 'new-error', ts: 9999 }))
    await flushNow()
    const buf = await readBuffer()
    expect(buf.length).toBe(MAX_ENTRIES)
    // The oldest warn was dropped (because nothing lower-level exists)
    expect(buf.some((e) => e.msg === 'warn-0')).toBe(false)
    expect(buf.some((e) => e.msg === 'new-error')).toBe(true)
  })

  it('evicts on byte cap (MAX_BYTES)', async () => {
    // Each entry has a 1KB msg; ~MAX_BYTES/1024 fit
    const big = 'x'.repeat(1024)
    let i = 0
    // Keep appending until eviction must have occurred
    while (i < 300) {
      appendEntry(makeEntry({ level: 'info', msg: `${i}-${big}`, ts: i }))
      i++
    }
    await flushNow()
    const buf = await readBuffer()
    const bytes = JSON.stringify(buf).length
    expect(bytes).toBeLessThanOrEqual(MAX_BYTES)
    // Most-recent entry must still be present
    expect(buf[buf.length - 1].msg.startsWith(`${i - 1}-`)).toBe(true)
  })

  it('debounces flushes by FLUSH_DEBOUNCE_MS for info entries', async () => {
    appendEntry(makeEntry({ level: 'info', msg: 'first' }))
    // Not flushed yet
    expect(await readBuffer()).toEqual([])
    vi.advanceTimersByTime(FLUSH_DEBOUNCE_MS - 1)
    expect(await readBuffer()).toEqual([])
    vi.advanceTimersByTime(1)
    // Allow the queued promise to resolve
    await vi.runAllTimersAsync()
    expect((await readBuffer()).map((e) => e.msg)).toEqual(['first'])
  })

  it('flushes warn and error immediately', async () => {
    appendEntry(makeEntry({ level: 'error', msg: 'boom' }))
    await vi.runAllTimersAsync()
    expect((await readBuffer()).map((e) => e.msg)).toEqual(['boom'])
  })

  it('hydrates in-memory buffer from storage on first hydrate()', async () => {
    // Pre-populate storage directly
    await new Promise<void>((resolve) =>
      chrome.storage.local.set({ [STORAGE_KEY]: [makeEntry({ msg: 'persisted' })] }, () => resolve())
    )
    __resetBufferForTests()
    await hydrate()
    appendEntry(makeEntry({ level: 'info', msg: 'fresh' }))
    await flushNow()
    const buf = await readBuffer()
    expect(buf.map((e) => e.msg)).toEqual(['persisted', 'fresh'])
  })

  it('clearBuffer empties storage and memory', async () => {
    appendEntry(makeEntry({ level: 'warn', msg: 'gone' }))
    await flushNow()
    await clearBuffer()
    expect(await readBuffer()).toEqual([])
  })
})
