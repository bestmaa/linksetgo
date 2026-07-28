export type RateLimitRequest = {
  bucket: string
  key: string
  limit: number
  windowMs: number
}

export type RateLimitDecision = {
  allowed: boolean
  remaining: number
  resetAt: string
}

export interface RateLimitProvider {
  consume(request: RateLimitRequest): Promise<RateLimitDecision>
}

type FixedWindow = {
  count: number
  resetAtMs: number
}

export class InMemoryRateLimitProvider implements RateLimitProvider {
  private readonly now: () => number
  private readonly windows = new Map<string, FixedWindow>()

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  async consume(request: RateLimitRequest): Promise<RateLimitDecision> {
    const limit = Math.max(1, Math.floor(request.limit))
    const windowMs = Math.max(1_000, Math.floor(request.windowMs))
    const nowMs = this.now()
    const storageKey = `${request.bucket}:${request.key}`
    const current = this.windows.get(storageKey)
    const window =
      !current || current.resetAtMs <= nowMs ? { count: 0, resetAtMs: nowMs + windowMs } : current

    window.count += 1
    this.windows.set(storageKey, window)
    this.pruneExpired(nowMs)

    return {
      allowed: window.count <= limit,
      remaining: Math.max(0, limit - window.count),
      resetAt: new Date(window.resetAtMs).toISOString(),
    }
  }

  private pruneExpired(nowMs: number): void {
    if (this.windows.size < 1_000) return

    for (const [key, window] of this.windows) {
      if (window.resetAtMs <= nowMs) this.windows.delete(key)
    }
  }
}
