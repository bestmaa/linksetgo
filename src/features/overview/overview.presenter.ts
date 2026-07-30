import type { AppDTO, DeepLinkDTO } from '@/lib/client/payload-types'
import { buildPublicURL } from '@/lib/domain/public-link'
import type { RuntimeLinkConfig } from '@/lib/domain/runtime-link-config'

import type { HealthViewModel, RecentLinkViewModel } from './overview.types'

export function effectiveLinkStatus(link: DeepLinkDTO): string {
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return 'expired'
  return link.status ?? 'draft'
}

function linkURL(link: DeepLinkDTO, runtimeConfig: RuntimeLinkConfig | null): string {
  if (!runtimeConfig) return 'Workspace domain unavailable'
  if (typeof link.app !== 'object') return 'App identity unavailable'
  const appKey = runtimeConfig.pathStyle === 'shared-clean' ? link.app.publicKey : link.app.slug
  return appKey
    ? buildPublicURL(runtimeConfig.baseUrl, appKey, link.slug, runtimeConfig.pathStyle)
    : 'Shared public key unavailable'
}

export function presentOverviewRecentLink(
  link: DeepLinkDTO,
  runtimeConfig: RuntimeLinkConfig | null,
): RecentLinkViewModel {
  const status = effectiveLinkStatus(link)
  return {
    app: typeof link.app === 'object' ? link.app.name : 'App',
    href: '/admin/links',
    id: String(link.id),
    name: link.name,
    status,
    statusTone: status === 'active' ? 'success' : status === 'expired' ? 'danger' : 'neutral',
    url: linkURL(link, runtimeConfig),
  }
}

export function presentOverviewHealth(
  apps: readonly AppDTO[],
  runtimeConfig: RuntimeLinkConfig | null,
  runtimeError: string | null,
): HealthViewModel[] {
  const associationApps = apps.filter((app) => app.routingMode !== 'scheme-handoff')
  const schemeHandoffApps = apps.length - associationApps.length
  const iosReady = associationApps.filter((app) => app.iosBundleId && app.iosTeamId).length
  const androidReady = associationApps.filter(
    (app) => app.androidPackageName && app.androidSha256CertFingerprints?.length,
  ).length
  const associationDetail = (ready: number): string =>
    associationApps.length === 0 && apps.length > 0
      ? `Optional · ${schemeHandoffApps} ${schemeHandoffApps === 1 ? 'app uses' : 'apps use'} scheme handoff`
      : `${ready} of ${associationApps.length} association apps configured${
          schemeHandoffApps > 0 ? ` · ${schemeHandoffApps} scheme handoff` : ''
        }`
  const associationTone = (ready: number): HealthViewModel['tone'] =>
    apps.length > 0 && ready === associationApps.length ? 'success' : 'warning'

  return [
    {
      detail: runtimeConfig
        ? `${runtimeConfig.baseUrl}${
            runtimeConfig.pathStyle === 'shared-clean' ? ' · clean shared URLs ready' : ''
          }`
        : (runtimeError ?? 'Loading workspace domain'),
      label: 'Shared domain',
      tone: runtimeConfig ? 'success' : 'warning',
    },
    { detail: 'Payload API is responding', label: 'PostgreSQL', tone: 'success' },
    {
      detail: associationDetail(iosReady),
      label: 'Apple association',
      tone: associationTone(iosReady),
    },
    {
      detail: associationDetail(androidReady),
      label: 'Android association',
      tone: associationTone(androidReady),
    },
  ]
}
