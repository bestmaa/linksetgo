import 'server-only'

import type { Domain } from '@/payload-types'
import { hostnameFromBaseURL, requestHostname } from '@/lib/domain/request-host'
import type { PublicLinkPathStyle } from '@/lib/domain/runtime-link-config'
import { getLinksetGoEdition } from './deployment-edition'
import { relationID } from './tenant-context'
import { getPayloadClient } from './payload-client'
import { getServerEnvironment } from './env'

export type PublicHostPurpose = 'associations' | 'resolver'

export type PublicHostResolution =
  | {
      ok: true
      baseURL: string
      hostname: string
      kind: 'domain'
      pathStyle: PublicLinkPathStyle
      workspaceID: string
    }
  | {
      ok: true
      baseURL: string
      hostname: string
      kind: 'legacy'
      pathStyle: PublicLinkPathStyle
      workspaceID: null
    }
  | {
      ok: true
      baseURL: string
      hostname: string
      kind: 'shared'
      pathStyle: PublicLinkPathStyle
      workspaceID: null
    }
  | {
      ok: false
      code: 'INVALID_HOST' | 'UNRECOGNIZED_HOST'
      httpStatus: 400 | 404
    }

const routableStatuses = (purpose: PublicHostPurpose): Domain['status'][] =>
  purpose === 'resolver' ? ['active'] : ['active', 'association-incomplete', 'certificate-ready']

export const isLegacyPublicHostAllowed = (edition = getLinksetGoEdition()): boolean =>
  edition === 'community'

export async function resolvePublicHost(
  request: Request,
  purpose: PublicHostPurpose,
): Promise<PublicHostResolution> {
  const environment = getServerEnvironment()
  const requested = requestHostname(request.headers, environment.trustProxyHostHeader)
  if (!requested.ok) {
    return { ok: false, code: 'INVALID_HOST', httpStatus: 400 }
  }

  const legacyHostname = hostnameFromBaseURL(environment.publicLinkBaseURL)
  const sharedHostname = environment.sharedLinkBaseURL
    ? hostnameFromBaseURL(environment.sharedLinkBaseURL)
    : null
  if (
    purpose === 'resolver' &&
    getLinksetGoEdition() === 'cloud' &&
    environment.sharedLinkBaseURL &&
    sharedHostname &&
    requested.hostname === sharedHostname
  ) {
    return {
      ok: true,
      baseURL: environment.sharedLinkBaseURL,
      hostname: requested.hostname,
      kind: 'shared',
      pathStyle: 'shared-clean',
      workspaceID: null,
    }
  }
  if (legacyHostname && requested.hostname === legacyHostname) {
    if (!isLegacyPublicHostAllowed()) {
      return { ok: false, code: 'UNRECOGNIZED_HOST', httpStatus: 404 }
    }
    return {
      ok: true,
      baseURL: environment.publicLinkBaseURL,
      hostname: requested.hostname,
      kind: 'legacy',
      pathStyle: 'host-scoped',
      workspaceID: null,
    }
  }

  const payload = await getPayloadClient()
  const domains = await payload.find({
    collection: 'domains',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        { hostname: { equals: requested.hostname } },
        { status: { in: routableStatuses(purpose) } },
        { platformSuspended: { equals: false } },
      ],
    },
  })
  const domain = domains.docs[0]
  const workspaceID = domain ? relationID(domain.workspace) : null
  if (!domain || !workspaceID) {
    return { ok: false, code: 'UNRECOGNIZED_HOST', httpStatus: 404 }
  }

  const workspace = await payload.findByID({
    collection: 'workspaces',
    id: /^\d+$/.test(workspaceID) ? Number(workspaceID) : workspaceID,
    depth: 0,
    overrideAccess: true,
  })
  if (workspace.status !== 'active' || workspace.platformSuspended) {
    return { ok: false, code: 'UNRECOGNIZED_HOST', httpStatus: 404 }
  }

  const organizationID = relationID(workspace.organization)
  if (!organizationID) {
    return { ok: false, code: 'UNRECOGNIZED_HOST', httpStatus: 404 }
  }
  const organization = await payload.findByID({
    collection: 'organizations',
    id: /^\d+$/.test(organizationID) ? Number(organizationID) : organizationID,
    depth: 0,
    overrideAccess: true,
  })
  if (organization.status !== 'active' || organization.platformSuspended) {
    return { ok: false, code: 'UNRECOGNIZED_HOST', httpStatus: 404 }
  }

  return {
    ok: true,
    baseURL: `https://${requested.hostname}`,
    hostname: requested.hostname,
    kind: 'domain',
    pathStyle: 'host-scoped',
    workspaceID,
  }
}
