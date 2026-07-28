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
    const hostname = buildManagedWorkspaceHostname('Oberoi', 'links.relay.example')

    expect(hostname).toBe('oberoi.links.relay.example')
    expect(
      buildWorkspacePublicLinkURL({
        appKey: 'mall',
        hostname: hostname ?? '',
        linkSlug: 'summer-offer',
      }),
    ).toBe('https://oberoi.links.relay.example/l/mall/summer-offer')
  })

  it('normalizes DNS names but rejects URLs, ports, wildcards, and malformed labels', () => {
    expect(normalizeHostname('Links.OberoiMall.com.')).toBe('links.oberoimall.com')
    expect(normalizeHostname('https://links.oberoimall.com')).toBeNull()
    expect(normalizeHostname('links.oberoimall.com:443')).toBeNull()
    expect(normalizeHostname('*.oberoimall.com')).toBeNull()
    expect(normalizeHostname('-bad.oberoimall.com')).toBeNull()
  })

  it('reserves infrastructure workspace slugs', () => {
    expect(normalizeWorkspaceSlug('oberoi-mall')).toBe('oberoi-mall')
    expect(normalizeWorkspaceSlug('API')).toBeNull()
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
