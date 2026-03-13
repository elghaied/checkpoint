interface CacheEntry<T> {
  data: T
  expiresAt: number
}

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
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.defaultTTL,
    })
  }

  clear(): void {
    this.cache.clear()
  }
}
