import { describe, expect, it } from 'vitest'

import { GET as getLiveness } from '@/app/api/health/live/route'
import { evaluateReadiness } from '@/lib/server/health'

describe('health checks', () => {
  it('serves a non-cacheable liveness response', async () => {
    const response = getLiveness()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  it('reports a ready database without exposing internal details', async () => {
    const result = await evaluateReadiness(async () => undefined)

    expect(result).toEqual({ status: 'ok', checks: { database: 'ok' } })
  })

  it('turns database errors and timeouts into a safe unavailable result', async () => {
    const failed = await evaluateReadiness(async () => {
      throw new Error('postgresql://user:secret@database/relay')
    })
    const timedOut = await evaluateReadiness(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
      1,
    )

    expect(failed).toEqual({
      status: 'unavailable',
      checks: { database: 'unavailable' },
    })
    expect(timedOut).toEqual(failed)
    expect(JSON.stringify(failed)).not.toContain('secret')
  })
})
