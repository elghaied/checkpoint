type AcquireResult =
  | { allowed: true }
  | { allowed: false; waitMs: number }

const WINDOW_MS = 60_000

export class RateLimiter {
  private timestamps: number[] = []
  private maxPerWindow: number

  constructor(maxPerMinute: number) {
    this.maxPerWindow = maxPerMinute
  }

  tryAcquire(): AcquireResult {
    const now = Date.now()
    this.prune(now)

    if (this.timestamps.length < this.maxPerWindow) {
      this.timestamps.push(now)
      return { allowed: true }
    }

    const oldest = this.timestamps[0]
    const waitMs = oldest + WINDOW_MS - now
    return { allowed: false, waitMs: Math.max(1, waitMs) }
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS
    while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
      this.timestamps.shift()
    }
  }
}
