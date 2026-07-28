import 'server-only'

import type { App } from '@/payload-types'
import { getPayloadClient } from './payload-client'

type AssociationAppPage = {
  docs: App[]
  hasNextPage: boolean
}

export async function collectAssociationAppPages(
  loadPage: (page: number) => Promise<AssociationAppPage>,
): Promise<App[]> {
  const apps: App[] = []
  let page = 1

  while (true) {
    const result = await loadPage(page)
    apps.push(...result.docs)
    if (!result.hasNextPage) return apps
    if (result.docs.length === 0) {
      throw new Error('Association pagination returned an empty intermediate page.')
    }
    page += 1
  }
}

export const loadAssociationApps = async (workspaceID?: string): Promise<App[]> => {
  const payload = await getPayloadClient()
  return collectAssociationAppPages(async (page) => {
    const result = await payload.find({
      collection: 'apps',
      depth: 0,
      limit: 100,
      overrideAccess: true,
      page,
      pagination: true,
      sort: 'id',
      where: {
        and: [
          { status: { equals: 'active' } },
          { platformSuspended: { equals: false } },
          ...(workspaceID
            ? [
                {
                  workspace: {
                    equals: /^\d+$/.test(workspaceID) ? Number(workspaceID) : workspaceID,
                  },
                },
              ]
            : []),
        ],
      },
    })

    return { docs: result.docs as App[], hasNextPage: result.hasNextPage }
  })
}
