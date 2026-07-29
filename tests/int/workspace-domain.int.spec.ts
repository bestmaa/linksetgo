import { describe, expect, it } from 'vitest'

import {
  buildManagedWorkspaceHostname,
  buildWorkspacePublicLinkURL,
  canTransitionDomain,
  normalizeHostname,
  normalizeWorkspaceSlug,
} from '../../src/lib/domain/workspace-domain'

describe('workspace domain contract', () => {
  it('builds the documented managed URL without a global app-key requirement', () => {
    const hostname = buildManagedWorkspaceHostname('Example', 'linksetgo.com')

    expect(hostname).toBe('example.linksetgo.com')
    expect(
      buildWorkspacePublicLinkURL({
        appKey: 'mall',
        hostname: hostname ?? '',
        linkSlug: 'summer-offer',
      }),
    ).toBe('https://example.linksetgo.com/l/mall/summer-offer')
  })

  it('normalizes DNS names but rejects URLs, ports, wildcards, and malformed labels', () => {
    expect(normalizeHostname('Links.Example.com.')).toBe('links.example.com')
    expect(normalizeHostname('https://links.example.com')).toBeNull()
    expect(normalizeHostname('links.example.com:443')).toBeNull()
    expect(normalizeHostname('*.exampleapp.com')).toBeNull()
    expect(normalizeHostname('-bad.exampleapp.com')).toBeNull()
  })

  it('reserves infrastructure workspace slugs', () => {
    expect(normalizeWorkspaceSlug('example-app')).toBe('example-app')
    expect(normalizeWorkspaceSlug('API')).toBeNull()
    expect(normalizeWorkspaceSlug('ingress')).toBeNull()
    expect(normalizeWorkspaceSlug('linksetgo')).toBeNull()
    expect(normalizeWorkspaceSlug('bad_slug')).toBeNull()
  })

  it('allows only explicit domain activation transitions', () => {
    expect(canTransitionDomain('pending-dns', 'verifying')).toBe(true)
    expect(canTransitionDomain('verifying', 'certificate-ready')).toBe(true)
    expect(canTransitionDomain('certificate-ready', 'active')).toBe(false)
    expect(canTransitionDomain('active', 'pending-dns')).toBe(false)
    expect(canTransitionDomain('active', 'suspended')).toBe(true)
  })
})
