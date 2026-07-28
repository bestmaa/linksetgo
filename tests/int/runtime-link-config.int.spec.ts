import { describe, expect, it } from 'vitest'

import { parseRuntimeLinkConfig, selectRuntimeLinkConfig } from '@/lib/domain/runtime-link-config'
import { normalizeRuntimeWorkspaceID } from '@/lib/server/runtime-link-config'

describe('runtime workspace link configuration', () => {
  it('selects an active custom domain without a build-time client domain', () => {
    const result = selectRuntimeLinkConfig({
      domains: [
        { hostname: 'team.shared.test', status: 'active', type: 'managed' },
        { hostname: 'go.brand.test', status: 'active', type: 'custom' },
        { hostname: 'pending.brand.test', status: 'pending-dns', type: 'custom' },
      ],
      edition: 'cloud',
      installationBaseURL: 'https://relay.example',
      workspaceID: '12',
    })

    expect(result).toEqual({
      baseUrl: 'https://go.brand.test',
      hostname: 'go.brand.test',
      source: 'custom',
      workspaceId: '12',
    })
  })

  it('falls back to the installation URL only in Community', () => {
    expect(
      selectRuntimeLinkConfig({
        domains: [{ hostname: 'go.brand.test', status: 'certificate-ready', type: 'custom' }],
        edition: 'community',
        installationBaseURL: 'http://127.0.0.1:3100/path-is-ignored',
        workspaceID: '12',
      }),
    ).toMatchObject({
      baseUrl: 'http://127.0.0.1:3100',
      hostname: '127.0.0.1',
      source: 'installation',
    })
  })

  it('fails closed in Cloud when the workspace has no active domain', () => {
    expect(
      selectRuntimeLinkConfig({
        domains: [{ hostname: 'go.brand.test', status: 'certificate-ready', type: 'custom' }],
        edition: 'cloud',
        installationBaseURL: 'https://legacy-global.example',
        workspaceID: '12',
      }),
    ).toBeNull()
  })

  it('accepts bounded identifiers and rejects malformed workspace input', () => {
    expect(normalizeRuntimeWorkspaceID(' 12 ')).toBe('12')
    expect(normalizeRuntimeWorkspaceID('workspace_abc')).toBe('workspace_abc')
    expect(normalizeRuntimeWorkspaceID('../other')).toBeNull()
    expect(normalizeRuntimeWorkspaceID('x'.repeat(129))).toBeNull()
  })

  it('parses only exact safe origins returned by the authenticated endpoint', () => {
    expect(
      parseRuntimeLinkConfig({
        baseUrl: 'https://go.brand.test',
        hostname: 'go.brand.test',
        source: 'custom',
        workspaceId: '12',
      }),
    ).not.toBeNull()

    expect(
      parseRuntimeLinkConfig({
        baseUrl: 'https://go.brand.test/path',
        hostname: 'go.brand.test',
        source: 'custom',
        workspaceId: '12',
      }),
    ).toBeNull()
    expect(
      parseRuntimeLinkConfig({
        baseUrl: 'https://attacker.test',
        hostname: 'go.brand.test',
        source: 'custom',
        workspaceId: '12',
      }),
    ).toBeNull()
  })
})
