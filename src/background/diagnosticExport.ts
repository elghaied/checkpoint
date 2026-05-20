import { readBuffer } from '@/shared/diagnosticBuffer'
import { DEFAULT_SETTINGS, type DiagnosticEntry, type DiagnosticReport, type ExtensionSettings, type LastSaveAttempt, type TrackedItem, type CustomList, type CustomTagRegistry } from '@/shared/types'

const SALT_KEY = 'diagnosticSalt'
const LAST_SAVE_ATTEMPT_KEY = 'lastSaveAttempt'
const REDACT_KEYS = new Set(['title', 'url', 'query', 'lastUrl', 'name', 'searchQuery', 'mainTitle', 'altTitles'])

let saltCache: string | null = null

async function getSalt(): Promise<string> {
  if (saltCache) return saltCache
  const existing = await new Promise<string | undefined>((resolve) =>
    chrome.storage.local.get(SALT_KEY, (r) => resolve(r[SALT_KEY] as string | undefined))
  )
  if (existing) {
    saltCache = existing
    return existing
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const salt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  await new Promise<void>((resolve) =>
    chrome.storage.local.set({ [SALT_KEY]: salt }, () => resolve())
  )
  saltCache = salt
  return salt
}

async function hashTitle(input: string): Promise<string> {
  const salt = await getSalt()
  const data = new TextEncoder().encode(salt + ':' + input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return 't#' + hex.slice(0, 8)
}

function urlToHost(s: string): string {
  try {
    return new URL(s).host
  } catch {
    return s
  }
}

async function redactString(s: string): Promise<string> {
  // Replace any inline URL with its host.
  return s.replace(/https?:\/\/[^\s)'"]+/g, (m) => urlToHost(m))
}

async function redactValue(value: unknown, keyHint: string | null): Promise<unknown> {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (keyHint && REDACT_KEYS.has(keyHint)) {
      // title/query/name → hash; url/lastUrl → host
      if (keyHint === 'url' || keyHint === 'lastUrl') return urlToHost(value)
      return await hashTitle(value)
    }
    return await redactString(value)
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((v) => redactValue(v, keyHint)))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await redactValue(v, k)
    }
    return out
  }
  return value
}

export async function redactEntry(entry: DiagnosticEntry): Promise<DiagnosticEntry> {
  return {
    ...entry,
    msg: await redactString(entry.msg),
    data: entry.data === undefined ? undefined : await redactValue(entry.data, null),
  }
}

async function readSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) =>
    chrome.storage.local.get('settings', (r) =>
      resolve((r.settings as ExtensionSettings) ?? { ...DEFAULT_SETTINGS })
    )
  )
}

async function readItems(): Promise<TrackedItem[]> {
  return new Promise((resolve) =>
    chrome.storage.local.get('trackedItems', (r) => resolve((r.trackedItems as TrackedItem[]) ?? []))
  )
}

async function readLists(): Promise<CustomList[]> {
  return new Promise((resolve) =>
    chrome.storage.local.get('customLists', (r) => resolve((r.customLists as CustomList[]) ?? []))
  )
}

async function readTags(): Promise<CustomTagRegistry> {
  return new Promise((resolve) =>
    chrome.storage.local.get('customTags', (r) => resolve((r.customTags as CustomTagRegistry) ?? {}))
  )
}

async function readBytesInUse(): Promise<number> {
  return new Promise((resolve) =>
    chrome.storage.local.getBytesInUse(null, (bytes) => resolve(bytes))
  )
}

async function readLastSaveAttempt(): Promise<LastSaveAttempt | undefined> {
  return new Promise((resolve) =>
    chrome.storage.local.get(LAST_SAVE_ATTEMPT_KEY, (r) =>
      resolve(r[LAST_SAVE_ATTEMPT_KEY] as LastSaveAttempt | undefined)
    )
  )
}

export async function buildDiagnosticReport(): Promise<DiagnosticReport> {
  const [settings, items, lists, tags, bytes, lsa, rawLog] = await Promise.all([
    readSettings(),
    readItems(),
    readLists(),
    readTags(),
    readBytesInUse(),
    readLastSaveAttempt(),
    readBuffer(),
  ])

  const formatCounts: Record<'MANGA' | 'MANHWA' | 'MANHUA', number> = { MANGA: 0, MANHWA: 0, MANHUA: 0 }
  for (const it of items) {
    if (it.format === 'MANGA' || it.format === 'MANHWA' || it.format === 'MANHUA') {
      formatCounts[it.format] += 1
    }
  }

  const redactedLog = await Promise.all(rawLog.map(redactEntry))

  return {
    schemaVersion: 1,
    generatedAt: Date.now(),
    extensionVersion: chrome.runtime.getManifest().version,
    browser: { ua: navigator.userAgent, locale: navigator.language },
    settings,
    storageSummary: {
      itemCount: items.length,
      formatCounts,
      customListsCount: lists.length,
      customTagsCount: Object.keys(tags).length,
      storageBytesInUse: bytes,
      lastSaveAttempt: lsa,
    },
    log: redactedLog,
  }
}

// Test-only — never call from production.
export function __resetSaltForTests(): void {
  saltCache = null
}
