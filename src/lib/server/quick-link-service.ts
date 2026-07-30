import 'server-only'

import { createHash } from 'node:crypto'

import {
  APIError,
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import { buildPublicURL } from '@/lib/domain/public-link'
import { parseNativeDeepLink } from '@/lib/domain/native-deep-link'
import type { QuickLinkInput } from '@/lib/domain/quick-link'
import type { App, DeepLink, User } from '@/payload-types'
import { canAccessWorkspace } from './tenant-context'
import { getServerEnvironment } from './env'
import { findReadyFallbackURL } from './fallback-url-safety-service'
import { acquireTransactionLock } from './postgres-lock'
import { quickLinkPublicKeyCandidates } from './quick-link-public-key'

export type QuickLinkResult =
  | {
      ok: true
      value: {
        appId: string
        appKey: string
        fallbackStatus: 'not-requested' | 'pending-verification' | 'ready'
        linkId: string
        linkSlug: string
        name: string
        publicUrl: string
      }
    }
  | {
      code:
        | 'APP_CONFLICT'
        | 'CREATE_FAILED'
        | 'CONFLICT'
        | 'FORBIDDEN'
        | 'INVALID_INPUT'
        | 'NOT_FOUND'
        | 'PLAN_LIMIT'
        | 'SETUP_UNAVAILABLE'
      message: string
      ok: false
      status: 400 | 402 | 403 | 404 | 409 | 422 | 503
    }

type QuickLinkFailure = Extract<QuickLinkResult, { ok: false }>
type QuickLinkFailureCode = QuickLinkFailure['code']
type QuickLinkFailureStatus = QuickLinkFailure['status']

class QuickLinkServiceError extends Error {
  constructor(
    readonly code: QuickLinkFailureCode,
    message: string,
    readonly status: QuickLinkFailureStatus,
  ) {
    super(message)
    this.name = 'QuickLinkServiceError'
  }
}

const genericCreateFailure = (): QuickLinkFailure => ({
  code: 'CREATE_FAILED',
  message: 'The link could not be created. Check the URL and try again.',
  ok: false,
  status: 503,
})

function failureFromError(error: unknown): QuickLinkFailure {
  if (error instanceof QuickLinkServiceError) {
    return {
      code: error.code,
      message: error.message,
      ok: false,
      status: error.status,
    }
  }
  if (!(error instanceof APIError)) return genericCreateFailure()

  const status = error.status
  if (![400, 402, 403, 404, 409, 422, 503].includes(status)) return genericCreateFailure()
  const safeStatus = status as QuickLinkFailureStatus
  const code: QuickLinkFailureCode =
    safeStatus === 402
      ? 'PLAN_LIMIT'
      : safeStatus === 403
        ? 'FORBIDDEN'
        : safeStatus === 404
          ? 'NOT_FOUND'
          : safeStatus === 409
            ? 'CONFLICT'
            : safeStatus === 503
              ? 'SETUP_UNAVAILABLE'
              : 'INVALID_INPUT'
  return {
    code,
    message:
      safeStatus === 503
        ? 'Link creation is temporarily unavailable.'
        : error.message || 'The link request was rejected.',
    ok: false,
    status: safeStatus,
  }
}

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)
const numericRelationshipInput = (id: string): number => {
  const value = Number(id)
  if (!Number.isSafeInteger(value) || value <= 0 || String(value) !== id) {
    throw new QuickLinkServiceError('INVALID_INPUT', 'Select one valid workspace.', 400)
  }
  return value
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const displayName = (value: string): string =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')

const stableSuffix = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 6)

const sameParameters = (left: unknown, right: Record<string, string>): boolean => {
  if ((left === null || left === undefined) && Object.keys(right).length === 0) return true
  if (typeof left !== 'object' || Array.isArray(left)) return false
  const entries = Object.entries(left as Record<string, unknown>)
  return (
    entries.length === Object.keys(right).length &&
    entries.every(([key, value]) => typeof value === 'string' && right[key] === value)
  )
}

async function availablePublicKey(input: {
  payload: Payload
  currentAppId?: string
  nativeScheme: string
  req: Awaited<ReturnType<typeof createLocalReq>>
  workspaceId: string
}): Promise<string> {
  // A global allocator lock keeps the availability check and later unique
  // insert atomic, including the unlikely case of a digest collision or an
  // explicitly managed alias occupying a tenant-scoped candidate.
  await acquireTransactionLock(input.req, 'quick-link-public-key-allocation', 'global')
  const candidates = quickLinkPublicKeyCandidates({
    eventHashSecret: getServerEnvironment().eventHashSecret,
    nativeScheme: input.nativeScheme,
    workspaceId: input.workspaceId,
  })
  for (const candidate of candidates) {
    const existing = await input.payload.find({
      collection: 'apps',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req: input.req,
      where: { publicKey: { equals: candidate } },
    })
    const existingApp = existing.docs[0]
    if (!existingApp || (input.currentAppId && String(existingApp.id) === input.currentAppId)) {
      return candidate
    }
  }
  throw new QuickLinkServiceError(
    'APP_CONFLICT',
    'No shared public app key is available for this mobile app.',
    409,
  )
}

async function findOrCreateQuickApp(input: {
  appStoreUrl: null | string
  fallbackUrl: null | string
  parsedScheme: string
  payload: Payload
  playStoreUrl: null | string
  req: Awaited<ReturnType<typeof createLocalReq>>
  user: User
  workspaceId: string
}): Promise<App> {
  const apps = await input.payload.find({
    collection: 'apps',
    depth: 0,
    limit: 10,
    overrideAccess: true,
    pagination: false,
    req: input.req,
    where: { workspace: { equals: relationshipInput(input.workspaceId) } },
  })
  const matching = apps.docs.find((app) => app.nativeScheme === input.parsedScheme)
  if (matching) {
    const publicKey =
      matching.publicKey ??
      (await availablePublicKey({
        currentAppId: String(matching.id),
        payload: input.payload,
        nativeScheme: input.parsedScheme,
        req: input.req,
        workspaceId: input.workspaceId,
      }))
    const needsUpdate =
      !matching.publicKey ||
      matching.status !== 'active' ||
      (input.appStoreUrl && input.appStoreUrl !== matching.appStoreUrl) ||
      (input.playStoreUrl && input.playStoreUrl !== matching.playStoreUrl) ||
      (input.fallbackUrl && input.fallbackUrl !== matching.fallbackUrl)
    if (!needsUpdate) return matching
    return input.payload.update({
      collection: 'apps',
      id: matching.id,
      data: {
        publicKey,
        status: 'active',
        ...(matching.status === 'active' ? {} : { routingMode: 'scheme-handoff' }),
        ...(input.appStoreUrl ? { appStoreUrl: input.appStoreUrl } : {}),
        ...(input.playStoreUrl ? { playStoreUrl: input.playStoreUrl } : {}),
        ...(input.fallbackUrl ? { fallbackUrl: input.fallbackUrl } : {}),
      },
      depth: 0,
      overrideAccess: true,
      req: input.req,
      user: input.user,
    })
  }
  if (apps.docs.length > 0) {
    throw new QuickLinkServiceError(
      'APP_CONFLICT',
      'This workspace is already connected to another mobile app.',
      409,
    )
  }

  const publicKey = await availablePublicKey({
    payload: input.payload,
    nativeScheme: input.parsedScheme,
    req: input.req,
    workspaceId: input.workspaceId,
  })
  return input.payload.create({
    collection: 'apps',
    data: {
      name: 'Mobile app',
      nativeScheme: input.parsedScheme,
      publicKey,
      routingMode: 'scheme-handoff',
      slug: input.parsedScheme,
      status: 'active',
      workspace: numericRelationshipInput(input.workspaceId),
      ...(input.appStoreUrl ? { appStoreUrl: input.appStoreUrl } : {}),
      ...(input.playStoreUrl ? { playStoreUrl: input.playStoreUrl } : {}),
      ...(input.fallbackUrl ? { fallbackUrl: input.fallbackUrl } : {}),
    },
    depth: 0,
    overrideAccess: true,
    req: input.req,
    user: input.user,
  })
}

async function findOrCreateQuickLink(input: {
  app: App
  name: null | string
  nativeUrl: string
  payload: Payload
  req: Awaited<ReturnType<typeof createLocalReq>>
  user: User
}): Promise<DeepLink> {
  const parsed = parseNativeDeepLink(input.nativeUrl, input.app.nativeScheme)
  if (!parsed.ok) throw new QuickLinkServiceError('INVALID_INPUT', parsed.message, 400)
  const parameters = Object.fromEntries(parsed.parameters.map(({ key, value }) => [key, value]))
  const preferredSlug = slugify(parsed.destinationPath) || 'home'
  const matches = await input.payload.find({
    collection: 'deep-links',
    depth: 0,
    limit: 10,
    overrideAccess: false,
    pagination: false,
    req: input.req,
    user: input.user,
    where: {
      and: [
        { app: { equals: input.app.id } },
        { slug: { in: [preferredSlug, `${preferredSlug}-${stableSuffix(input.nativeUrl)}`] } },
      ],
    },
  })
  const duplicate = matches.docs.find(
    (link) =>
      link.destinationPath === parsed.destinationPath &&
      sameParameters(link.parameters, parameters),
  )
  if (duplicate) return duplicate

  const slug = matches.docs.some((link) => link.slug === preferredSlug)
    ? `${preferredSlug}-${stableSuffix(input.nativeUrl)}`
    : preferredSlug
  return input.payload.create({
    collection: 'deep-links',
    data: {
      app: input.app.id,
      destinationPath: parsed.destinationPath,
      name: input.name ?? displayName(preferredSlug) ?? 'App link',
      ...(parsed.parameters.length > 0 ? { parameters } : {}),
      slug,
      status: 'active',
    },
    depth: 0,
    overrideAccess: false,
    req: input.req,
    user: input.user,
  })
}

export async function createQuickLink(input: {
  data: QuickLinkInput
  payload: Payload
  user: User
}): Promise<QuickLinkResult> {
  const parsed = parseNativeDeepLink(input.data.nativeUrl)
  if (!parsed.ok) {
    return { code: 'INVALID_INPUT', message: parsed.message, ok: false, status: 400 }
  }
  const req = await createLocalReq({ user: input.user }, input.payload)
  if (!(await canAccessWorkspace(req, input.data.workspaceId, 'manage'))) {
    return {
      code: 'FORBIDDEN',
      message: 'Select a workspace you are allowed to manage.',
      ok: false,
      status: 403,
    }
  }
  if (!(await initTransaction(req))) {
    return {
      code: 'SETUP_UNAVAILABLE',
      message: 'Link creation is temporarily unavailable.',
      ok: false,
      status: 503,
    }
  }

  try {
    // One workspace-scoped lock makes the find-or-create sequence idempotent,
    // including concurrent first-app and same-link submissions. Public-key
    // allocation takes its own global lock only when an app needs a new key.
    await acquireTransactionLock(req, 'quick-link-workspace', input.data.workspaceId)
    const app = await findOrCreateQuickApp({
      appStoreUrl: input.data.appStoreUrl,
      fallbackUrl: input.data.fallbackUrl,
      parsedScheme: parsed.scheme,
      payload: input.payload,
      playStoreUrl: input.data.playStoreUrl,
      req,
      user: input.user,
      workspaceId: input.data.workspaceId,
    })
    const link = await findOrCreateQuickLink({
      app,
      name: input.data.name,
      nativeUrl: input.data.nativeUrl,
      payload: input.payload,
      req,
      user: input.user,
    })
    const publicKey = app.publicKey
    const sharedBaseURL = getServerEnvironment().sharedLinkBaseURL
    if (!publicKey || !sharedBaseURL) {
      throw new QuickLinkServiceError(
        'SETUP_UNAVAILABLE',
        'Shared link delivery is not configured.',
        503,
      )
    }
    const fallbackReadiness =
      input.data.fallbackUrl && app.fallbackUrl
        ? await findReadyFallbackURL({
            payload: input.payload,
            req,
            url: app.fallbackUrl,
            workspaceId: input.data.workspaceId,
          })
        : null
    await commitTransaction(req)
    return {
      ok: true,
      value: {
        appId: String(app.id),
        appKey: publicKey,
        fallbackStatus: fallbackReadiness
          ? fallbackReadiness.ok
            ? 'ready'
            : 'pending-verification'
          : 'not-requested',
        linkId: String(link.id),
        linkSlug: link.slug,
        name: link.name,
        publicUrl: buildPublicURL(sharedBaseURL, publicKey, link.slug, 'shared-clean'),
      },
    }
  } catch (error) {
    await killTransaction(req)
    return failureFromError(error)
  }
}
