interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const MAX_CACHE_SIZE = 100

export class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private defaultTTL: number

  constructor(ttlMs: number) {
    this.defaultTTL = ttlMs
  }

  get(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.data
  }

  set(key: string, data: T): void {
    // Evict expired entries when cache grows beyond limit
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const now = Date.now()
      for (const [k, v] of this.cache) {
        if (now > v.expiresAt) this.cache.delete(k)
      }
    }

    // If still over limit after expiry sweep, drop oldest entries
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const excess = this.cache.size - MAX_CACHE_SIZE + 1
      const keys = this.cache.keys()
      for (let i = 0; i < excess; i++) {
        const next = keys.next()
        if (!next.done) this.cache.delete(next.value)
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.defaultTTL,
    })
  }

  clear(): void {
    this.cache.clear()
  }
}
