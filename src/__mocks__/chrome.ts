import { vi } from 'vitest'

// In-memory store for chrome.storage.local
const store: Record<string, unknown> = {}

const chromeStub = {
  storage: {
    local: {
      get: vi.fn((keys: string | string[], callback: (result: Record<string, unknown>) => void) => {
        const keyList = typeof keys === 'string' ? [keys] : keys
        const result: Record<string, unknown> = {}
        for (const key of keyList) {
          if (key in store) {
            result[key] = store[key]
          }
        }
        callback(result)
      }),
      set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(store, items)
        callback?.()
      }),
      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        const keyList = typeof keys === 'string' ? [keys] : keys
        for (const key of keyList) {
          delete store[key]
        }
        callback?.()
      }),
      clear: vi.fn((callback?: () => void) => {
        for (const key of Object.keys(store)) {
          delete store[key]
        }
        callback?.()
      }),
      getBytesInUse: vi.fn((_keys: string | string[] | null, callback: (bytes: number) => void) => {
        const bytes = JSON.stringify(store).length
        callback(bytes)
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    getManifest: vi.fn(() => ({ version: '0.0.0-test' })),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    get: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  notifications: {
    create: vi.fn(),
    clear: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
  },
}

// Assign to globalThis so it's available as `chrome` in all test files
Object.assign(globalThis, { chrome: chromeStub })

/**
 * Reset the in-memory storage between tests.
 * Call this in beforeEach() for storage-dependent tests.
 */
export function resetChromeStorage(): void {
  for (const key of Object.keys(store)) {
    delete store[key]
  }
}
