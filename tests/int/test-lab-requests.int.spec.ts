import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkPublicLink } from '@/features/test-lab/test-lab-requests'

const activeProjection = {
  app: {
    fallbackUrl: 'https://brand.example/app',
    name: 'Mall',
    slug: 'mall',
  },
  link: {
    destinationPath: '/offer',
    name: 'Offer',
    slug: 'offer',
    status: 'active',
  },
  publicUrl: 'https://team.links.example/l/mall/offer',
  status: 'active',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Test Lab public resolver request', () => {
  it('checks the selected workspace origin without credentials', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(activeProjection, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      checkPublicLink('https://team.links.example', 'mall', 'offer'),
    ).resolves.toMatchObject({ data: activeProjection, error: null })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [endpoint, init] = fetchMock.mock.calls[0]!
    expect(String(endpoint)).toBe('https://team.links.example/api/public/links/mall/offer')
    expect(init).toMatchObject({ credentials: 'omit' })
  })

  it('rejects a malformed public projection at the client boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ...activeProjection, link: { status: 'active' } })),
    )

    await expect(
      checkPublicLink('https://team.links.example', 'mall', 'offer'),
    ).resolves.toMatchObject({
      data: null,
      error: 'Public resolver returned invalid data.',
    })
  })
})
