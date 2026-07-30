import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkPublicLink, loadAppConfiguration } from '@/features/test-lab/test-lab-requests'
import { payloadClient } from '@/lib/client/payload-client'

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
  eventToken: 'signed-test-event-token',
  publicUrl: 'https://team.links.example/l/mall/offer',
  status: 'active',
}

afterEach(() => {
  vi.restoreAllMocks()
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

  it('loads a shared-clean app by its permanent public key', async () => {
    vi.spyOn(payloadClient, 'listApps').mockResolvedValue({
      docs: [
        {
          id: 7,
          name: 'Mall',
          publicKey: 'mall-global',
          slug: 'mall',
        },
      ],
      hasNextPage: false,
      hasPrevPage: false,
      limit: 100,
      page: 1,
      pagingCounter: 1,
      totalDocs: 1,
      totalPages: 1,
    })

    await expect(
      loadAppConfiguration('mall-global', 'workspace-1', 'shared-clean'),
    ).resolves.toMatchObject({
      data: { name: 'Mall', publicKey: 'mall-global', slug: 'mall' },
      error: null,
    })
    expect(payloadClient.listApps).toHaveBeenCalledWith({
      limit: 100,
      workspaceId: 'workspace-1',
    })
  })
})
