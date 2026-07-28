import type { AppDTO, DeepLinkDTO } from '@/lib/client/payload-types'

import {
  buildPublicLinkUrl,
  effectiveLinkStatus,
  linkStatusTone,
  relatedApp,
} from './links-controller.helpers'
import type { LinkRowViewModel } from './links.types'

export function createLinkRows(input: {
  appFilter: string
  apps: readonly AppDTO[]
  links: readonly DeepLinkDTO[]
  linkOrigin: string | null
  onCopy: (url: string | null) => void
  search: string
  statusFilter: string
}): LinkRowViewModel[] {
  const query = input.search.toLowerCase().trim()
  return input.links.flatMap((link) => {
    const app = relatedApp(link, [...input.apps])
    const status = effectiveLinkStatus(link)
    const matchesSearch =
      !query ||
      link.name.toLowerCase().includes(query) ||
      link.slug.toLowerCase().includes(query) ||
      link.destinationPath.toLowerCase().includes(query)
    if (
      !matchesSearch ||
      (input.appFilter && String(app?.id) !== input.appFilter) ||
      (input.statusFilter && status !== input.statusFilter)
    ) {
      return []
    }

    const url = buildPublicLinkUrl(input.linkOrigin, app?.slug ?? 'app', link.slug)
    return [
      {
        appName: app?.name ?? 'Unknown app',
        destination: link.destinationPath,
        detailsHref: `/admin/links/${encodeURIComponent(String(link.id))}`,
        id: String(link.id),
        name: link.name,
        onCopy: () => input.onCopy(url),
        publicUrl: url ?? 'Workspace domain unavailable',
        status,
        statusTone: linkStatusTone(status),
        testHref: url ? `/admin/test-lab?url=${encodeURIComponent(url)}` : '/admin/domains',
      },
    ]
  })
}
