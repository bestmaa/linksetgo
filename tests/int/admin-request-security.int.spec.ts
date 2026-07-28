import { describe, expect, it } from 'vitest'

import { isExactObject } from '@/lib/domain/exact-object'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'

describe('authenticated mutation request boundaries', () => {
  it('accepts only the configured exact browser origin', () => {
    const sameOrigin = new Request('https://relay.example/api/admin/domains', {
      headers: {
        origin: 'https://relay.example',
        'sec-fetch-site': 'same-origin',
      },
      method: 'POST',
    })
    const crossOrigin = new Request('https://relay.example/api/admin/domains', {
      headers: {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      },
      method: 'POST',
    })

    expect(isSameOriginMutation(sameOrigin, 'https://relay.example')).toBe(true)
    expect(isSameOriginMutation(crossOrigin, 'https://relay.example')).toBe(false)
  })

  it('rejects missing, null, same-site, and malformed origin evidence', () => {
    const requests = [
      new Request('https://relay.example/api/admin/domains', { method: 'POST' }),
      new Request('https://relay.example/api/admin/domains', {
        headers: { origin: 'null' },
        method: 'POST',
      }),
      new Request('https://relay.example/api/admin/domains', {
        headers: {
          origin: 'https://relay.example',
          'sec-fetch-site': 'same-site',
        },
        method: 'POST',
      }),
      new Request('https://relay.example/api/admin/domains', {
        headers: { origin: 'not a URL' },
        method: 'POST',
      }),
    ]

    expect(
      requests.every((request) => !isSameOriginMutation(request, 'https://relay.example')),
    ).toBe(true)
  })

  it('requires exactly the declared JSON keys', () => {
    expect(isExactObject({ plan: 'pro', workspaceId: '12' }, ['plan', 'workspaceId'])).toBe(true)
    expect(
      isExactObject({ plan: 'pro', workspaceId: '12', organizationId: 'forged' }, [
        'plan',
        'workspaceId',
      ]),
    ).toBe(false)
    expect(isExactObject({ plan: 'pro' }, ['plan', 'workspaceId'])).toBe(false)
    expect(isExactObject([], ['plan', 'workspaceId'])).toBe(false)
  })
})
