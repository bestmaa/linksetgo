import 'server-only'

import type { App, DeepLink } from '@/payload-types'
import {
  evaluateLinkAvailability,
  isPublicSlug,
  projectPublicLink,
  publicLinkError,
  type PublicLinkError,
  type PublicLinkSuccess,
} from '@/lib/domain/public-link'
import type { PublicLinkPathStyle } from '@/lib/domain/runtime-link-config'
import { getPayloadClient } from './payload-client'
import { getLinksetGoEdition } from './deployment-edition'
import { findReadyFallbackURL } from './fallback-url-safety-service'
import { relationID } from './tenant-context'

export type PublicResolveResult =
  | {
      ok: true
      httpStatus: 200
      body: PublicLinkSuccess
      internal: {
        appID: number
        linkID: number
      }
    }
  | {
      ok: false
      httpStatus: 400 | 404 | 410
      body: PublicLinkError
    }

type ResolveInput = {
  appSlug: string
  baseURL: string
  linkSlug: string
  now?: Date
  pathStyle?: PublicLinkPathStyle
  workspaceID?: string
}

type AppWithSharedIdentity = App & {
  publicKey?: null | string
}

export function buildPublicAppLookupWhere(input: {
  appKey: string
  pathStyle: PublicLinkPathStyle
  workspaceID?: string
}) {
  if (input.workspaceID) {
    return {
      and: [
        { slug: { equals: input.appKey } },
        {
          workspace: {
            equals: /^\d+$/.test(input.workspaceID) ? Number(input.workspaceID) : input.workspaceID,
          },
        },
      ],
    }
  }
  return input.pathStyle === 'shared-clean'
    ? { publicKey: { equals: input.appKey } }
    : { slug: { equals: input.appKey } }
}

const missing = (
  code: 'APP_NOT_FOUND' | 'LINK_NOT_FOUND',
): Extract<PublicResolveResult, { ok: false }> => ({
  ok: false,
  httpStatus: 404,
  body: publicLinkError(code),
})

export const tenantIsRoutable = async (
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  workspaceValue: unknown,
  pathStyle: PublicLinkPathStyle,
): Promise<boolean> => {
  if (workspaceValue === null || workspaceValue === undefined) return pathStyle === 'host-scoped'
  const workspaceID = relationID(workspaceValue)
  if (!workspaceID) return false

  try {
    const workspace = await payload.findByID({
      collection: 'workspaces',
      id: /^\d+$/.test(workspaceID) ? Number(workspaceID) : workspaceID,
      depth: 0,
      overrideAccess: true,
    })
    if (workspace.status !== 'active' || workspace.platformSuspended) return false

    const organizationID = relationID(workspace.organization)
    if (!organizationID) return false
    const organization = await payload.findByID({
      collection: 'organizations',
      id: /^\d+$/.test(organizationID) ? Number(organizationID) : organizationID,
      depth: 0,
      overrideAccess: true,
    })
    return organization.status === 'active' && !organization.platformSuspended
  } catch {
    return false
  }
}

export const resolvePublicLink = async ({
  appSlug,
  baseURL,
  linkSlug,
  now = new Date(),
  pathStyle = 'host-scoped',
  workspaceID,
}: ResolveInput): Promise<PublicResolveResult> => {
  if (!isPublicSlug(appSlug) || !isPublicSlug(linkSlug)) {
    return {
      ok: false,
      httpStatus: 400,
      body: publicLinkError('INVALID_LINK'),
    }
  }

  const payload = await getPayloadClient()
  const appResult = await payload.find({
    collection: 'apps',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    where: buildPublicAppLookupWhere({
      appKey: appSlug,
      pathStyle,
      ...(workspaceID ? { workspaceID } : {}),
    }),
  })
  const app = appResult.docs.length === 1 ? (appResult.docs[0] as AppWithSharedIdentity) : undefined
  if (!app) return missing('APP_NOT_FOUND')
  if (pathStyle === 'shared-clean' && app.publicKey !== appSlug) return missing('APP_NOT_FOUND')
  if (!(await tenantIsRoutable(payload, app.workspace, pathStyle))) return missing('APP_NOT_FOUND')

  const linkResult = await payload.find({
    collection: 'deep-links',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [{ app: { equals: app.id } }, { slug: { equals: linkSlug } }],
    },
  })
  const link = linkResult.docs[0] as DeepLink | undefined
  if (!link) return missing('LINK_NOT_FOUND')

  const availability = evaluateLinkAvailability(app, link, now)
  if (availability.status === 'unavailable') {
    return {
      ok: false,
      httpStatus: 410,
      body: publicLinkError(availability.code),
    }
  }

  const workspaceId = relationID(app.workspace)
  const readyFallback = async (value: null | string | undefined): Promise<null | string> => {
    if (!value) return null
    if (getLinksetGoEdition() !== 'cloud') return value
    if (!workspaceId) return null
    const readiness = await findReadyFallbackURL({
      now,
      payload,
      url: value,
      workspaceId,
    })
    return readiness.ok ? readiness.canonicalUrl : null
  }
  const [appFallback, linkFallback] = await Promise.all([
    readyFallback(app.fallbackUrl),
    readyFallback(link.fallbackUrl),
  ])

  return {
    ok: true,
    httpStatus: 200,
    body: projectPublicLink(app, link, baseURL, {
      appKey: pathStyle === 'shared-clean' ? appSlug : app.slug,
      appFallbackUrl: appFallback,
      linkFallbackUrl: linkFallback,
      pathStyle,
    }),
    internal: {
      appID: app.id,
      linkID: link.id,
    },
  }
}
