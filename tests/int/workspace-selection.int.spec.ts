import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildWorkspaceSummaries,
  chooseSelectedWorkspaceId,
  readStoredWorkspaceId,
  storeWorkspaceId,
  WORKSPACE_STORAGE_KEY,
} from '@/features/workspaces/workspace-selection'
import { payloadClient } from '@/lib/client/payload-client'

const emptyList = {
  docs: [],
  hasNextPage: false,
  hasPrevPage: false,
  limit: 100,
  page: 1,
  pagingCounter: 1,
  totalDocs: 0,
  totalPages: 1,
}

describe('workspace selection', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('keeps only workspaces backed by the current users active memberships', () => {
    const summaries = buildWorkspaceSummaries(
      [
        {
          id: 11,
          name: 'Retail',
          organization: { id: 1, name: 'Example', slug: 'example' },
          slug: 'retail',
          status: 'active',
        },
        {
          id: 12,
          name: 'Private',
          organization: { id: 2, name: 'Other', slug: 'other' },
          slug: 'private',
          status: 'active',
        },
      ],
      [
        {
          id: 21,
          organization: 1,
          role: 'admin',
          status: 'active',
          user: 9,
        },
      ],
      false,
    )

    expect(summaries).toEqual([
      {
        id: '11',
        name: 'Retail',
        organizationId: '1',
        organizationName: 'Example',
        role: 'admin',
        slug: 'retail',
      },
    ])
  })

  it('uses a stored id only when it is in the safe workspace list', () => {
    const workspaces = [{ id: 'first' }, { id: 'second' }]
    expect(chooseSelectedWorkspaceId(workspaces, 'second')).toBe('second')
    expect(chooseSelectedWorkspaceId(workspaces, 'not-allowed')).toBe('first')
    expect(chooseSelectedWorkspaceId([], 'second')).toBeNull()
  })

  it('persists and clears the selected workspace id', () => {
    storeWorkspaceId('workspace-7')
    expect(readStoredWorkspaceId()).toBe('workspace-7')
    expect(window.localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe('workspace-7')

    storeWorkspaceId(null)
    expect(readStoredWorkspaceId()).toBeNull()
  })
})

describe('workspace-scoped Payload client queries', () => {
  it('adds workspace and app boundaries to collection requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify(emptyList), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await payloadClient.listApps({ workspaceId: 'workspace-7' })
    await payloadClient.listDeepLinks({ appIds: [12, 'app-13'] })
    await payloadClient.listLinkEvents({ appIds: [12, 'app-13'] })

    const urls = fetchMock.mock.calls.map(
      ([input]) => new URL(String(input), 'https://linksetgo.test'),
    )
    expect(urls[0]?.searchParams.get('where[workspace][equals]')).toBe('workspace-7')
    expect(urls[1]?.searchParams.get('where[app][in]')).toBe('12,app-13')
    expect(urls[2]?.searchParams.get('where[app][in]')).toBe('12,app-13')
  })

  it('includes the selected workspace in app creation payloads', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ id: 1, name: 'Mall', slug: 'mall' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await payloadClient.createApp({
      fallbackUrl: 'https://example.com',
      name: 'Mall',
      nativeScheme: 'mall',
      slug: 'mall',
      status: 'active',
      workspace: 'workspace-7',
    })

    const requestInit = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({ workspace: 'workspace-7' })
  })
})
