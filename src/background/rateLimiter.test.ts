import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { RateLimiter } from './rateLimiter'

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter(75)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests within budget', () => {
    const result = limiter.tryAcquire()
    expect(result).toEqual({ allowed: true })
  })

  it('rejects requests when budget exhausted', () => {
    for (let i = 0; i < 75; i++) {
      limiter.tryAcquire()
    }
    const result = limiter.tryAcquire()
    expect(result.allowed).toBe(false)
    expect('waitMs' in result && result.waitMs).toBeGreaterThan(0)
  })

  it('allows requests after window expires', () => {
    for (let i = 0; i < 75; i++) {
      limiter.tryAcquire()
    }
    vi.advanceTimersByTime(61_000)
    const result = limiter.tryAcquire()
    expect(result).toEqual({ allowed: true })
  })

  it('slides window correctly — old timestamps expire', () => {
    for (let i = 0; i < 40; i++) {
      limiter.tryAcquire()
    }
    vi.advanceTimersByTime(30_000)
    for (let i = 0; i < 35; i++) {
      limiter.tryAcquire()
    }
    const blocked = limiter.tryAcquire()
    expect(blocked.allowed).toBe(false)
    vi.advanceTimersByTime(31_000)
    const allowed = limiter.tryAcquire()
    expect(allowed).toEqual({ allowed: true })
  })

  it('records timestamp on successful acquire', () => {
    limiter.tryAcquire()
    for (let i = 0; i < 74; i++) {
      expect(limiter.tryAcquire().allowed).toBe(true)
    }
    expect(limiter.tryAcquire().allowed).toBe(false)
  })

  it('calculates correct waitMs when rejected', () => {
    for (let i = 0; i < 75; i++) {
      limiter.tryAcquire()
    }
    const result = limiter.tryAcquire()
    if (!result.allowed) {
      expect(result.waitMs).toBeGreaterThan(0)
      expect(result.waitMs).toBeLessThanOrEqual(60_000)
    }
  })
})
