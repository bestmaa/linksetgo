import { InMemoryRateLimitProvider } from '@/lib/application/rate-limit-provider'
import {
  QUICK_LINK_CREATION_LIMIT,
  rateLimitQuickLinkCreation,
} from '@/lib/server/quick-link-rate-limit'
import { describe, expect, it } from 'vitest'

const secret = 'quick-link-rate-limit-secret-with-enough-characters'

describe('quick-link creation rate limit', () => {
  it('caps each actor across rotating workspaces without sharing raw identifiers', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const input = {
      actorID: 'owner-1',
      eventHashSecret: secret,
      provider,
      workspaceID: 'workspace-1',
    }

    for (let attempt = 0; attempt < QUICK_LINK_CREATION_LIMIT; attempt += 1) {
      await expect(rateLimitQuickLinkCreation(input)).resolves.toMatchObject({ allowed: true })
    }
    await expect(rateLimitQuickLinkCreation(input)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    })
    await expect(
      rateLimitQuickLinkCreation({ ...input, workspaceID: 'workspace-2' }),
    ).resolves.toMatchObject({ allowed: false })
    await expect(
      rateLimitQuickLinkCreation({ ...input, actorID: 'owner-2' }),
    ).resolves.toMatchObject({ allowed: true })
  })
})
