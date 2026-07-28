import { describe, expect, it, vi } from 'vitest'

import { collectAssociationAppPages } from '@/lib/server/load-association-apps'
import type { App } from '@/payload-types'

const app = (id: number): App =>
  ({
    id,
    name: `App ${id}`,
    slug: `app-${id}`,
  }) as App

describe('association app pagination', () => {
  it('loads every page instead of silently truncating active apps', async () => {
    const loadPage = vi.fn(async (page: number) => {
      if (page === 1) return { docs: [app(1), app(2)], hasNextPage: true }
      return { docs: [app(3)], hasNextPage: false }
    })

    await expect(collectAssociationAppPages(loadPage)).resolves.toHaveLength(3)
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('rejects an impossible empty page rather than returning partial data', async () => {
    await expect(
      collectAssociationAppPages(async () => ({ docs: [], hasNextPage: true })),
    ).rejects.toThrow(/empty intermediate page/)
  })
})
