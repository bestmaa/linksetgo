import { describe, expect, it } from 'vitest'

import { InMemoryRateLimitProvider } from '@/lib/application/rate-limit-provider'
import {
  rateLimitFallbackOriginAction,
  rateLimitFallbackOriginRegistration,
} from '@/lib/server/fallback-origin-rate-limit'

const secret = 'fallback-rate-limit-secret-with-enough-characters'

describe('fallback-origin admin rate limits', () => {
  it('caps registrations per actor and workspace', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const input = {
      actorID: 'actor-1',
      eventHashSecret: secret,
      provider,
      workspaceID: 'workspace-1',
    }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(rateLimitFallbackOriginRegistration(input)).resolves.toMatchObject({
        allowed: true,
      })
    }
    await expect(rateLimitFallbackOriginRegistration(input)).resolves.toMatchObject({
      allowed: false,
    })
    await expect(
      rateLimitFallbackOriginRegistration({ ...input, workspaceID: 'workspace-2' }),
    ).resolves.toMatchObject({ allowed: true })
  })

  it('isolates action budgets by origin', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const input = {
      actorID: 'actor-1',
      eventHashSecret: secret,
      originID: 'origin-1',
      provider,
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(rateLimitFallbackOriginAction(input)).resolves.toMatchObject({
        allowed: true,
      })
    }
    await expect(rateLimitFallbackOriginAction(input)).resolves.toMatchObject({
      allowed: false,
    })
    await expect(
      rateLimitFallbackOriginAction({ ...input, originID: 'origin-2' }),
    ).resolves.toMatchObject({ allowed: true })
  })
})
