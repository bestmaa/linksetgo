import { describe, expect, it } from 'vitest'

import {
  LINK_EVENT_TOKEN_TTL_MS,
  linkEventResourceKey,
  mintLinkEventToken,
  verifyLinkEventToken,
} from '@/lib/server/link-event-token'

const secret = 'link-event-token-secret-with-at-least-thirty-two-characters'
const issuedAt = new Date('2026-07-30T12:00:00.000Z')
const binding = {
  appID: 12,
  appSlug: 'oberoi',
  eventHashSecret: secret,
  hostname: 'go.linksetgo.com',
  linkID: 34,
  linkSlug: 'offer',
  nonce: 'abcdefghijklmnopqrstuvwx',
  now: issuedAt,
}

describe('public link-event token', () => {
  it('mints a short-lived signed token bound to one exact public link and host', () => {
    const token = mintLinkEventToken(binding)
    const claims = verifyLinkEventToken({
      appSlug: binding.appSlug,
      eventHashSecret: secret,
      hostname: binding.hostname,
      linkSlug: binding.linkSlug,
      now: new Date(issuedAt.getTime() + 60_000),
      token,
    })

    expect(claims).toMatchObject({
      appSlug: binding.appSlug,
      expiresAt: issuedAt.getTime() + LINK_EVENT_TOKEN_TTL_MS,
      hostname: binding.hostname,
      issuedAt: issuedAt.getTime(),
      linkSlug: binding.linkSlug,
      nonce: binding.nonce,
      resourceKey: linkEventResourceKey(binding.appID, binding.linkID, secret),
    })
    expect(claims).not.toHaveProperty('appID')
    expect(claims).not.toHaveProperty('linkID')
  })

  it('rejects tampering and a different app, link, or hostname binding', () => {
    const token = mintLinkEventToken(binding)
    const verify = (overrides: Partial<Parameters<typeof verifyLinkEventToken>[0]> = {}) =>
      verifyLinkEventToken({
        appSlug: binding.appSlug,
        eventHashSecret: secret,
        hostname: binding.hostname,
        linkSlug: binding.linkSlug,
        now: new Date(issuedAt.getTime() + 60_000),
        token,
        ...overrides,
      })

    expect(verify({ appSlug: 'another-app' })).toBeNull()
    expect(verify({ linkSlug: 'another-link' })).toBeNull()
    expect(verify({ hostname: 'another.example' })).toBeNull()
    const replacement = token.endsWith('A') ? 'B' : 'A'
    expect(verify({ token: `${token.slice(0, -1)}${replacement}` })).toBeNull()
  })

  it('rejects an expired token and an implausibly future-dated token', () => {
    const token = mintLinkEventToken(binding)
    expect(
      verifyLinkEventToken({
        appSlug: binding.appSlug,
        eventHashSecret: secret,
        hostname: binding.hostname,
        linkSlug: binding.linkSlug,
        now: new Date(issuedAt.getTime() + LINK_EVENT_TOKEN_TTL_MS),
        token,
      }),
    ).toBeNull()
    expect(
      verifyLinkEventToken({
        appSlug: binding.appSlug,
        eventHashSecret: secret,
        hostname: binding.hostname,
        linkSlug: binding.linkSlug,
        now: new Date(issuedAt.getTime() - 31_000),
        token,
      }),
    ).toBeNull()
  })
})
