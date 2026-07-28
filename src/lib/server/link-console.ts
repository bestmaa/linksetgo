import 'server-only'

import type { Payload } from 'payload'

import type {
  Identifier,
  LinkConsoleDetailDTO,
  LinkConsoleMutationInput,
} from '@/lib/client/payload-types'
import type { App, DeepLink, User } from '@/payload-types'

export type LinkConsoleResult<T> =
  | { ok: true; value: T }
  | {
      code: 'INVALID_TRANSITION' | 'NOT_FOUND' | 'NOT_READY' | 'UPDATE_REJECTED'
      message: string
      ok: false
      status: number
    }

const relationIdentifier = (value: string): Identifier => {
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) && numeric > 0 && String(numeric) === value ? numeric : value
}

const relationID = (value: App | App['id']): string =>
  typeof value === 'object' ? String(value.id) : String(value)

function scalarParameters(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      item === null ||
      typeof item === 'boolean' ||
      typeof item === 'number' ||
      typeof item === 'string'
        ? [[key, String(item ?? '')]]
        : [],
    ),
  )
}

function effectiveStatus(link: DeepLink): LinkConsoleDetailDTO['effectiveStatus'] {
  if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) return 'expired'
  return link.status
}

function project(link: DeepLink, app: App): LinkConsoleDetailDTO {
  return {
    app: {
      id: app.id,
      name: app.name,
      nativeScheme: app.nativeScheme ?? null,
      slug: app.slug,
      status: app.status,
    },
    effectiveStatus: effectiveStatus(link),
    link: {
      destinationPath: link.destinationPath,
      expiresAt: link.expiresAt ?? null,
      fallbackUrl: link.fallbackUrl ?? null,
      id: link.id,
      name: link.name,
      parameters: scalarParameters(link.parameters),
      slug: link.slug,
      status: link.status,
      ...(link.updatedAt ? { updatedAt: link.updatedAt } : {}),
    },
  }
}

async function scopedLink(
  payload: Payload,
  user: User,
  linkID: string,
  workspaceID: string,
): Promise<{ app: App; link: DeepLink } | null> {
  const workspace = await payload.find({
    collection: 'workspaces',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    user,
    where: { id: { equals: relationIdentifier(workspaceID) } },
  })
  if (!workspace.docs[0]) return null

  const apps = await payload.find({
    collection: 'apps',
    depth: 0,
    limit: 1000,
    overrideAccess: false,
    pagination: false,
    user,
    where: { workspace: { equals: relationIdentifier(workspaceID) } },
  })
  if (apps.docs.length === 0) return null
  const appByID = new Map(apps.docs.map((app) => [String(app.id), app]))
  const links = await payload.find({
    collection: 'deep-links',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    user,
    where: {
      and: [{ id: { equals: relationIdentifier(linkID) } }, { app: { in: [...appByID.keys()] } }],
    },
  })
  const link = links.docs[0]
  const app = link ? appByID.get(relationID(link.app)) : null
  return link && app ? { app, link } : null
}

export async function getConsoleLinkDetail(
  payload: Payload,
  user: User,
  linkID: string,
  workspaceID: string,
): Promise<LinkConsoleResult<LinkConsoleDetailDTO>> {
  const scoped = await scopedLink(payload, user, linkID, workspaceID)
  return scoped
    ? { ok: true, value: project(scoped.link, scoped.app) }
    : {
        code: 'NOT_FOUND',
        message: 'This link is not available in the selected workspace.',
        ok: false,
        status: 404,
      }
}

function transitionError(
  link: DeepLink,
  app: App,
  input: LinkConsoleMutationInput,
): LinkConsoleResult<never> | null {
  if (input.action === 'activate') {
    if (effectiveStatus(link) === 'active') {
      return {
        code: 'INVALID_TRANSITION',
        message: 'This link is already active.',
        ok: false,
        status: 409,
      }
    }
    if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) {
      return {
        code: 'NOT_READY',
        message: 'Choose a future expiry date or clear it before activating this link.',
        ok: false,
        status: 422,
      }
    }
    if (app.status !== 'active' || app.platformSuspended) {
      return {
        code: 'NOT_READY',
        message: 'Activate the owning app before activating this link.',
        ok: false,
        status: 422,
      }
    }
  }
  if (input.action === 'pause' && link.status !== 'active') {
    return {
      code: 'INVALID_TRANSITION',
      message: 'Only an active link can be paused.',
      ok: false,
      status: 409,
    }
  }
  return null
}

function rejected(error: unknown): LinkConsoleResult<never> {
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
      ? error.status
      : 409
  const safeStatus = [400, 402, 403, 409, 422].includes(status) ? status : 409
  return {
    code: 'UPDATE_REJECTED',
    message:
      error instanceof Error && safeStatus !== 409
        ? error.message
        : 'Relay could not save this link in the selected workspace.',
    ok: false,
    status: safeStatus,
  }
}

export async function mutateConsoleLink(
  payload: Payload,
  user: User,
  linkID: string,
  input: LinkConsoleMutationInput,
): Promise<LinkConsoleResult<LinkConsoleDetailDTO>> {
  const scoped = await scopedLink(payload, user, linkID, input.workspaceId)
  if (!scoped) {
    return {
      code: 'NOT_FOUND',
      message: 'This link is not available in the selected workspace.',
      ok: false,
      status: 404,
    }
  }
  const blocked = transitionError(scoped.link, scoped.app, input)
  if (blocked) return blocked

  try {
    await payload.update({
      collection: 'deep-links',
      id: scoped.link.id,
      depth: 0,
      overrideAccess: false,
      user,
      data:
        input.action === 'save'
          ? {
              destinationPath: input.configuration.destinationPath.trim(),
              expiresAt: input.configuration.expiresAt,
              fallbackUrl: input.configuration.fallbackUrl?.trim() || null,
              name: input.configuration.name.trim(),
              parameters: input.configuration.parameters,
            }
          : { status: input.action === 'activate' ? 'active' : 'paused' },
    })
  } catch (error) {
    return rejected(error)
  }
  return getConsoleLinkDetail(payload, user, linkID, input.workspaceId)
}
