import { describe, expect, it } from 'vitest'

import { parseRuntimeLinkConfig, selectRuntimeLinkConfig } from '@/lib/domain/runtime-link-config'
import {
  canUseSharedRuntimeForApps,
  normalizeRuntimeWorkspaceID,
} from '@/lib/server/runtime-link-config'

describe('runtime workspace link configuration', () => {
  it('selects an active custom domain without a build-time client domain', () => {
    const result = selectRuntimeLinkConfig({
      domains: [
        { hostname: 'team.shared.test', status: 'active', type: 'managed' },
        { hostname: 'go.brand.test', status: 'active', type: 'custom' },
        { hostname: 'pending.brand.test', status: 'pending-dns', type: 'custom' },
      ],
      edition: 'cloud',
      installationBaseURL: 'https://linksetgo.example',
      sharedBaseURL: 'https://go.linksetgo.example',
      workspaceID: '12',
    })

    expect(result).toEqual({
      baseUrl: 'https://go.brand.test',
      hostname: 'go.brand.test',
      pathStyle: 'host-scoped',
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
      pathStyle: 'host-scoped',
      source: 'installation',
    })
  })

  it('prefers the shared clean-link origin for Free even when a managed domain exists', () => {
    expect(
      selectRuntimeLinkConfig({
        domains: [{ hostname: 'team.linksetgo.test', status: 'active', type: 'managed' }],
        edition: 'cloud',
        installationBaseURL: 'https://app.linksetgo.test',
        preferShared: true,
        sharedBaseURL: 'https://go.linksetgo.test/path-is-ignored',
        workspaceID: '12',
      }),
    ).toEqual({
      baseUrl: 'https://go.linksetgo.test',
      hostname: 'go.linksetgo.test',
      pathStyle: 'shared-clean',
      source: 'shared',
      workspaceId: '12',
    })
  })

  it('keeps an existing Free app on its active managed domain until it has a shared key', () => {
    expect(canUseSharedRuntimeForApps([{ publicKey: null }])).toBe(false)
    expect(
      selectRuntimeLinkConfig({
        domains: [{ hostname: 'legacy-free.linksetgo.test', status: 'active', type: 'managed' }],
        edition: 'cloud',
        installationBaseURL: 'https://app.linksetgo.test',
        preferShared: canUseSharedRuntimeForApps([{ publicKey: null }]),
        sharedEligible: canUseSharedRuntimeForApps([{ publicKey: null }]),
        sharedBaseURL: 'https://go.linksetgo.test',
        workspaceID: '12',
      }),
    ).toEqual({
      baseUrl: 'https://legacy-free.linksetgo.test',
      hostname: 'legacy-free.linksetgo.test',
      pathStyle: 'host-scoped',
      source: 'managed',
      workspaceId: '12',
    })
  })

  it('keeps paid legacy apps host-scoped and lets newly keyed apps use shared clean links', () => {
    expect(canUseSharedRuntimeForApps([{ publicKey: 'new-quick-app' }])).toBe(true)
    expect(canUseSharedRuntimeForApps([])).toBe(true)
    expect(
      selectRuntimeLinkConfig({
        domains: [{ hostname: 'links.paid.test', status: 'active', type: 'custom' }],
        edition: 'cloud',
        installationBaseURL: 'https://app.linksetgo.test',
        preferShared: false,
        sharedEligible: false,
        sharedBaseURL: 'https://go.linksetgo.test',
        workspaceID: '13',
      }),
    ).toMatchObject({
      baseUrl: 'https://links.paid.test',
      pathStyle: 'host-scoped',
      source: 'custom',
    })
  })

  it('does not select the shared fallback for a paid legacy app without a public key', () => {
    expect(
      selectRuntimeLinkConfig({
        domains: [{ hostname: 'pending.paid.test', status: 'certificate-ready', type: 'custom' }],
        edition: 'cloud',
        installationBaseURL: 'https://app.linksetgo.test',
        sharedEligible: false,
        sharedBaseURL: 'https://go.linksetgo.test',
        workspaceID: '13',
      }),
    ).toBeNull()
  })

  it('uses the shared origin as the Cloud fallback when no active paid domain exists', () => {
    expect(
      selectRuntimeLinkConfig({
        domains: [{ hostname: 'go.brand.test', status: 'certificate-ready', type: 'custom' }],
        edition: 'cloud',
        installationBaseURL: 'https://app.linksetgo.test',
        sharedBaseURL: 'https://go.linksetgo.test',
        workspaceID: '12',
      }),
    ).toMatchObject({
      baseUrl: 'https://go.linksetgo.test',
      pathStyle: 'shared-clean',
      source: 'shared',
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
        pathStyle: 'host-scoped',
        source: 'custom',
        workspaceId: '12',
      }),
    ).not.toBeNull()

    expect(
      parseRuntimeLinkConfig({
        baseUrl: 'https://go.linksetgo.test',
        hostname: 'go.linksetgo.test',
        pathStyle: 'shared-clean',
        source: 'shared',
        workspaceId: '12',
      }),
    ).not.toBeNull()
    expect(
      parseRuntimeLinkConfig({
        baseUrl: 'https://go.linksetgo.test',
        hostname: 'go.linksetgo.test',
        pathStyle: 'host-scoped',
        source: 'shared',
        workspaceId: '12',
      }),
    ).toBeNull()

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
