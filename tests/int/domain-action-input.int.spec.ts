import { describe, expect, it } from 'vitest'

import { parseDomainActionInput } from '@/lib/domain/domain-action-input'
import { InMemoryRateLimitProvider } from '@/lib/application/rate-limit-provider'
import { rateLimitDomainAction } from '@/lib/server/domain-action-rate-limit'

describe('custom-domain action boundary', () => {
  it('accepts only exact verification and explicit release-confirmation payloads', () => {
    expect(parseDomainActionInput({ action: 'verify', workspaceId: '12' })).toEqual({
      action: 'verify',
      workspaceID: '12',
    })
    expect(
      parseDomainActionInput({
        action: 'confirm-associations',
        confirmReleasedApps: true,
        hostname: 'Links.Brand.Example.',
        workspaceId: '12',
      }),
    ).toEqual({
      action: 'confirm-associations',
      confirmedHostname: 'links.brand.example',
      workspaceID: '12',
    })

    expect(
      parseDomainActionInput({
        action: 'confirm-associations',
        confirmReleasedApps: false,
        hostname: 'links.brand.example',
        workspaceId: '12',
      }),
    ).toBeNull()
    expect(
      parseDomainActionInput({
        action: 'verify',
        status: 'active',
        workspaceId: '12',
      }),
    ).toBeNull()
  })

  it('rate-limits a privacy-hashed actor and domain pair', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const input = {
      actorID: 'actor-1',
      domainID: 'domain-1',
      eventHashSecret: 'domain-action-test-secret-that-is-long',
      provider,
    }

    for (let index = 0; index < 30; index += 1) {
      await expect(rateLimitDomainAction(input)).resolves.toMatchObject({ allowed: true })
    }
    await expect(rateLimitDomainAction(input)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    })
    await expect(rateLimitDomainAction({ ...input, domainID: 'domain-2' })).resolves.toMatchObject({
      allowed: true,
    })
  })
})
