import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  domainStatusPresentation,
  normalizeCustomHostnameDraft,
  releaseGuidance,
} from '@/features/domains/domains.helpers'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import {
  isActiveConsoleUser,
  listConsoleDomains,
  normalizeCustomDomainHostname,
  registerConsoleCustomDomain,
} from '@/lib/server/domain-console'
import type { Domain, User } from '@/payload-types'

const activeUser: User = {
  collection: 'users',
  createdAt: '2026-07-27T00:00:00.000Z',
  email: 'owner@relay.test',
  id: 7,
  name: 'Workspace owner',
  role: 'admin',
  status: 'active',
  updatedAt: '2026-07-27T00:00:00.000Z',
}

describe('custom-domain console boundary', () => {
  it('accepts one hostname but rejects URLs, IPs, wildcards, and paths', () => {
    expect(normalizeCustomHostnameDraft('Links.Company.com.')).toBe('links.company.com')
    expect(normalizeCustomDomainHostname('Links.Company.com.')).toBe('links.company.com')

    for (const unsafe of [
      'https://links.company.com',
      '127.0.0.1',
      '*.company.com',
      'links.company.com/path',
      'links.company.com:443',
    ]) {
      expect(normalizeCustomHostnameDraft(unsafe)).toBeNull()
      expect(normalizeCustomDomainHostname(unsafe)).toBeNull()
    }
  })

  it('never forwards browser lifecycle, evidence, token, or managed type fields', async () => {
    let capturedData: Record<string, unknown> = {}
    const payload = {
      create: async (options: { data: Record<string, unknown> }) => {
        capturedData = options.data
        return {
          createdAt: '2026-07-27T00:00:00.000Z',
          hostname: String(options.data.hostname),
          id: 41,
          status: options.data.status,
          type: options.data.type,
          updatedAt: '2026-07-27T00:00:00.000Z',
          verificationToken: options.data.verificationToken,
          workspace: options.data.workspace,
        } as Domain
      },
    } as unknown as Payload

    const untrustedInput = {
      activatedAt: '2026-07-27T00:00:00.000Z',
      hostname: 'Links.Company.com',
      status: 'active',
      type: 'managed',
      verificationToken: 'attacker-selected-token',
      workspaceID: '12',
    }
    const result = await registerConsoleCustomDomain(payload, activeUser, untrustedInput)

    expect(result.ok).toBe(true)
    expect(capturedData).toMatchObject({
      hostname: 'links.company.com',
      status: 'pending-dns',
      type: 'custom',
      workspace: 12,
    })
    expect(capturedData).not.toHaveProperty('activatedAt')
    expect(capturedData.verificationToken).not.toBe('attacker-selected-token')
    expect(String(capturedData.verificationToken)).toHaveLength(43)
  })

  it('recognizes only an active authenticated user', () => {
    expect(isActiveConsoleUser(activeUser)).toBe(true)
    expect(isActiveConsoleUser({ ...activeUser, status: 'disabled' })).toBe(false)
    expect(isActiveConsoleUser(null)).toBe(false)
  })

  it('lists with both tenant access controls and the selected workspace filter', async () => {
    let findOptions: Record<string, unknown> = {}
    const domain: Domain = {
      createdAt: '2026-07-27T00:00:00.000Z',
      hostname: 'links.company.com',
      id: 41,
      status: 'active',
      type: 'custom',
      updatedAt: '2026-07-27T00:00:00.000Z',
      verificationToken: 'server-generated-domain-token-value',
      workspace: 12,
    }
    const payload = {
      find: async (options: Record<string, unknown>) => {
        findOptions = options
        return { docs: [domain] }
      },
    } as unknown as Payload

    const result = await listConsoleDomains(payload, activeUser, '12')

    expect(result).toMatchObject({
      ok: true,
      value: { docs: [{ hostname: 'links.company.com' }] },
    })
    expect(findOptions).toMatchObject({
      collection: 'domains',
      overrideAccess: false,
      user: activeUser,
      where: { workspace: { equals: 12 } },
    })
  })

  it('keeps every lifecycle status explicit and blocks mobile release before active', () => {
    expect(domainStatusPresentation('pending-dns')).toMatchObject({
      label: 'Pending DNS',
      tone: 'neutral',
    })
    expect(domainStatusPresentation('association-incomplete')).toMatchObject({
      label: 'Association incomplete',
      tone: 'warning',
    })
    expect(releaseGuidance({ status: 'certificate-ready', type: 'custom' })).toContain(
      'Do not ship',
    )
    expect(releaseGuidance({ status: 'active', type: 'custom' })).toContain('ready')
  })
})

describe('bounded console JSON requests', () => {
  it('accepts a small JSON body', async () => {
    const request = new Request('https://relay.test/api/admin/domains', {
      body: JSON.stringify({ hostname: 'links.company.com', workspaceId: '12' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    await expect(readBoundedJSON(request, 2048)).resolves.toMatchObject({
      ok: true,
      value: { hostname: 'links.company.com', workspaceId: '12' },
    })
  })

  it('rejects oversized declared and streamed bodies', async () => {
    const declared = new Request('https://relay.test/api/admin/domains', {
      body: '{}',
      headers: { 'content-length': '2049', 'content-type': 'application/json' },
      method: 'POST',
    })
    const streamed = new Request('https://relay.test/api/admin/domains', {
      body: JSON.stringify({ hostname: 'x'.repeat(3000) }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    await expect(readBoundedJSON(declared, 2048)).resolves.toMatchObject({
      ok: false,
      status: 413,
    })
    await expect(readBoundedJSON(streamed, 2048)).resolves.toMatchObject({
      ok: false,
      status: 413,
    })
  })

  it('rejects non-JSON media types before parsing', async () => {
    const request = new Request('https://relay.test/api/admin/domains', {
      body: '{}',
      headers: { 'content-type': 'text/plain' },
      method: 'POST',
    })

    await expect(readBoundedJSON(request, 2048)).resolves.toMatchObject({
      ok: false,
      status: 415,
    })
  })
})
