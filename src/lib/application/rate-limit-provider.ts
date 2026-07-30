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
  consumePair(first: RateLimitRequest, second: RateLimitRequest): Promise<RateLimitDecision>
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

  async consumePair(first: RateLimitRequest, second: RateLimitRequest): Promise<RateLimitDecision> {
    const nowMs = this.now()
    const firstWindow = this.readWindow(first, nowMs)
    const secondWindow = this.readWindow(second, nowMs)
    const firstLimit = Math.max(1, Math.floor(first.limit))
    const secondLimit = Math.max(1, Math.floor(second.limit))
    const blocked = [
      { limit: firstLimit, window: firstWindow },
      { limit: secondLimit, window: secondWindow },
    ].filter(({ limit, window }) => window.count >= limit)

    if (blocked.length > 0) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Math.max(...blocked.map(({ window }) => window.resetAtMs))).toISOString(),
      }
    }

    firstWindow.count += 1
    secondWindow.count += 1
    this.windows.set(`${first.bucket}:${first.key}`, firstWindow)
    this.windows.set(`${second.bucket}:${second.key}`, secondWindow)
    this.pruneExpired(nowMs)
    return {
      allowed: true,
      remaining: Math.min(firstLimit - firstWindow.count, secondLimit - secondWindow.count),
      resetAt: new Date(Math.max(firstWindow.resetAtMs, secondWindow.resetAtMs)).toISOString(),
    }
  }

  private readWindow(request: RateLimitRequest, nowMs: number): FixedWindow {
    const windowMs = Math.max(1_000, Math.floor(request.windowMs))
    const current = this.windows.get(`${request.bucket}:${request.key}`)
    return !current || current.resetAtMs <= nowMs
      ? { count: 0, resetAtMs: nowMs + windowMs }
      : current
  }

  private pruneExpired(nowMs: number): void {
    if (this.windows.size < 1_000) return

    for (const [key, window] of this.windows) {
      if (window.resetAtMs <= nowMs) this.windows.delete(key)
    }
  }
}
