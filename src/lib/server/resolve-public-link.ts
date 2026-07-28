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
import { getPayloadClient } from './payload-client'
import { areCloudFallbackOriginsReady } from './fallback-origin-policy'

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
  workspaceID?: string
}

const missing = (
  code: 'APP_NOT_FOUND' | 'LINK_NOT_FOUND',
): Extract<PublicResolveResult, { ok: false }> => ({
  ok: false,
  httpStatus: 404,
  body: publicLinkError(code),
})

const tenantIsRoutable = async (
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  workspaceValue: unknown,
): Promise<boolean> => {
  if (workspaceValue === null || workspaceValue === undefined) return true
  const workspaceID =
    typeof workspaceValue === 'number' || typeof workspaceValue === 'string'
      ? String(workspaceValue)
      : null
  if (!workspaceID) return false

  const workspace = await payload.findByID({
    collection: 'workspaces',
    id: /^\d+$/.test(workspaceID) ? Number(workspaceID) : workspaceID,
    depth: 0,
    overrideAccess: true,
  })
  if (workspace.status !== 'active' || workspace.platformSuspended) return false

  const organizationID =
    typeof workspace.organization === 'number' || typeof workspace.organization === 'string'
      ? String(workspace.organization)
      : null
  if (!organizationID) return false
  const organization = await payload.findByID({
    collection: 'organizations',
    id: /^\d+$/.test(organizationID) ? Number(organizationID) : organizationID,
    depth: 0,
    overrideAccess: true,
  })
  return organization.status === 'active' && !organization.platformSuspended
}

export const resolvePublicLink = async ({
  appSlug,
  baseURL,
  linkSlug,
  now = new Date(),
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
    where: {
      ...(workspaceID
        ? {
            and: [
              { slug: { equals: appSlug } },
              {
                workspace: {
                  equals: /^\d+$/.test(workspaceID) ? Number(workspaceID) : workspaceID,
                },
              },
            ],
          }
        : { slug: { equals: appSlug } }),
    },
  })
  const app = appResult.docs.length === 1 ? (appResult.docs[0] as App) : undefined
  if (!app) return missing('APP_NOT_FOUND')
  if (!(await tenantIsRoutable(payload, app.workspace))) return missing('APP_NOT_FOUND')

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

  if (
    !(await areCloudFallbackOriginsReady({
      fallbackURLs: [app.fallbackUrl, link.fallbackUrl],
      payload,
      workspace: app.workspace,
    }))
  ) {
    return {
      ok: false,
      httpStatus: 410,
      body: publicLinkError('FALLBACK_UNAVAILABLE'),
    }
  }

  return {
    ok: true,
    httpStatus: 200,
    body: projectPublicLink(app, link, baseURL),
    internal: {
      appID: app.id,
      linkID: link.id,
    },
  }
}
