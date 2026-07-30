import { describe, expect, it } from 'vitest'

import { POST } from '@/app/api/public/link-events/route'

describe('public link-event request boundary', () => {
  it('rejects an oversized body before host or database resolution', async () => {
    const response = await POST(
      new Request('https://links.linksetgo.example/api/public/link-events', {
        body: JSON.stringify({ padding: 'x'.repeat(5000) }),
        headers: {
          'content-type': 'application/json',
          host: 'links.linksetgo.example',
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(413)
  })

  it('requires JSON and rejects unknown event fields', async () => {
    const wrongType = await POST(
      new Request('https://links.linksetgo.example/api/public/link-events', {
        body: '{}',
        headers: { 'content-type': 'text/plain', host: 'links.linksetgo.example' },
        method: 'POST',
      }),
    )
    expect(wrongType.status).toBe(415)

    const extraField = await POST(
      new Request('https://links.linksetgo.example/api/public/link-events', {
        body: JSON.stringify({
          appSlug: 'app',
          eventToken: 'not-a-signed-token',
          eventType: 'fallback-viewed',
          extra: true,
          linkSlug: 'offer',
        }),
        headers: { 'content-type': 'application/json', host: 'links.linksetgo.example' },
        method: 'POST',
      }),
    )
    expect(extraField.status).toBe(400)
  })

  it('rejects non-canonical or overlong app and link slugs', async () => {
    const invalidBodies = [
      {
        appSlug: 'A-Bad-Slug',
        eventToken: 'not-a-signed-token',
        eventType: 'fallback-viewed',
        linkSlug: 'offer',
      },
      {
        appSlug: 'app',
        eventToken: 'not-a-signed-token',
        eventType: 'fallback-viewed',
        linkSlug: 'x'.repeat(81),
      },
    ]

    for (const body of invalidBodies) {
      const response = await POST(
        new Request('https://links.linksetgo.example/api/public/link-events', {
          body: JSON.stringify(body),
          headers: {
            'content-type': 'application/json',
            host: 'links.linksetgo.example',
          },
          method: 'POST',
        }),
      )
      expect(response.status).toBe(400)
    }
  })

  it('requires a server-minted token before caller session data has any authority', async () => {
    const response = await POST(
      new Request('https://links.linksetgo.example/api/public/link-events', {
        body: JSON.stringify({
          appSlug: 'app',
          eventType: 'app-opened',
          linkSlug: 'offer',
          sessionID: 'attacker-rotated-session',
        }),
        headers: {
          'content-type': 'application/json',
          host: 'links.linksetgo.example:99999',
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_EVENT' },
    })
  })
})
