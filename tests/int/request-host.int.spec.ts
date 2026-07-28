import { describe, expect, it } from 'vitest'

import { hostnameFromBaseURL, requestHostname } from '@/lib/domain/request-host'

describe('public request host policy', () => {
  it('ignores forged forwarded-host headers unless proxy trust is explicitly enabled', () => {
    const headers = new Headers({
      host: 'links.relay.example',
      'x-forwarded-host': 'victim.relay.example',
    })

    expect(requestHostname(headers, false)).toEqual({
      ok: true,
      hostname: 'links.relay.example',
      source: 'host',
    })
    expect(requestHostname(headers, true)).toEqual({
      ok: true,
      hostname: 'victim.relay.example',
      source: 'forwarded-host',
    })
  })

  it('fails closed on ambiguous forwarded hosts and malformed authorities', () => {
    expect(
      requestHostname(
        new Headers({
          host: 'links.relay.example',
          'x-forwarded-host': 'victim.relay.example, proxy.relay.example',
        }),
        true,
      ),
    ).toEqual({ ok: false, reason: 'INVALID_FORWARDED_HOST' })

    expect(requestHostname(new Headers({ host: 'relay.example:99999' }), false)).toEqual({
      ok: false,
      reason: 'INVALID_HOST',
    })
  })

  it('normalizes case and strips a valid port without accepting paths or credentials', () => {
    expect(requestHostname(new Headers({ host: 'Links.Relay.Example:443' }), false)).toEqual({
      ok: true,
      hostname: 'links.relay.example',
      source: 'host',
    })
    expect(requestHostname(new Headers({ host: 'user@links.relay.example' }), false).ok).toBe(false)
    expect(requestHostname(new Headers({ host: 'links.relay.example/path' }), false).ok).toBe(false)
  })

  it('extracts the exact canonical hostname from the legacy base URL', () => {
    expect(hostnameFromBaseURL('https://Links.Relay.Example/base?q=1')).toBe('links.relay.example')
    expect(hostnameFromBaseURL('http://[::1]:3100')).toBe('[::1]')
    expect(hostnameFromBaseURL('not a URL')).toBeNull()
  })
})
