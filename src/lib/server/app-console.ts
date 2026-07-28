import 'server-only'

import type { Payload } from 'payload'

import { hasCompleteAppPlatform } from '@/lib/domain/app-readiness'
import type {
  AppConsoleConfigurationInput,
  AppConsoleDetailDTO,
  AppConsoleLinkDTO,
  AppConsoleMutationInput,
  AppDTO,
  Identifier,
} from '@/lib/client/payload-types'
import type { App, DeepLink, User } from '@/payload-types'

type ConsoleResult<T> =
  | { ok: true; value: T }
  | {
      code: 'INVALID_TRANSITION' | 'NOT_FOUND' | 'NOT_READY' | 'UPDATE_REJECTED'
      message: string
      ok: false
      status: number
    }

const relationIdentifier = (value: string): Identifier => {
  const numberValue = Number(value)
  return Number.isSafeInteger(numberValue) && numberValue > 0 && String(numberValue) === value
    ? numberValue
    : value
}

function projectApp(app: App): AppDTO {
  return {
    id: app.id,
    name: app.name,
    ...(app.nativeScheme ? { nativeScheme: app.nativeScheme } : {}),
    slug: app.slug,
    status: app.status,
    ...(app.workspace !== undefined
      ? {
          workspace:
            typeof app.workspace === 'object' && app.workspace ? app.workspace.id : app.workspace,
        }
      : {}),
    ...(app.androidPackageName ? { androidPackageName: app.androidPackageName } : {}),
    ...(app.androidSha256CertFingerprints
      ? { androidSha256CertFingerprints: app.androidSha256CertFingerprints }
      : {}),
    ...(app.appStoreUrl ? { appStoreUrl: app.appStoreUrl } : {}),
    ...(app.createdAt ? { createdAt: app.createdAt } : {}),
    ...(app.description ? { description: app.description } : {}),
    ...(app.fallbackUrl ? { fallbackUrl: app.fallbackUrl } : {}),
    ...(app.iosBundleId ? { iosBundleId: app.iosBundleId } : {}),
    ...(app.iosTeamId ? { iosTeamId: app.iosTeamId } : {}),
    ...(app.playStoreUrl ? { playStoreUrl: app.playStoreUrl } : {}),
    ...(app.updatedAt ? { updatedAt: app.updatedAt } : {}),
  }
}

function projectLink(link: DeepLink): AppConsoleLinkDTO {
  return {
    destinationPath: link.destinationPath,
    id: link.id,
    name: link.name,
    slug: link.slug,
    status: link.status,
    ...(link.expiresAt ? { expiresAt: link.expiresAt } : {}),
    ...(link.updatedAt ? { updatedAt: link.updatedAt } : {}),
  }
}

async function findScopedApp(
  payload: Payload,
  user: User,
  appID: string,
  workspaceID: string,
): Promise<App | null> {
  const result = await payload.find({
    collection: 'apps',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    user,
    where: {
      and: [
        { id: { equals: relationIdentifier(appID) } },
        { workspace: { equals: relationIdentifier(workspaceID) } },
      ],
    },
  })
  return result.docs[0] ?? null
}

export async function getConsoleAppDetail(
  payload: Payload,
  user: User,
  appID: string,
  workspaceID: string,
): Promise<ConsoleResult<AppConsoleDetailDTO>> {
  const app = await findScopedApp(payload, user, appID, workspaceID)
  if (!app) {
    return {
      code: 'NOT_FOUND',
      message: 'This app is not available in the selected workspace.',
      ok: false,
      status: 404,
    }
  }

  const links = await payload.find({
    collection: 'deep-links',
    depth: 0,
    limit: 5,
    overrideAccess: false,
    sort: '-updatedAt',
    user,
    where: { app: { equals: app.id } },
  })
  return {
    ok: true,
    value: {
      app: projectApp(app),
      links: links.docs.map(projectLink),
      totalLinks: links.totalDocs,
    },
  }
}

function configurationData(configuration: AppConsoleConfigurationInput) {
  const optional = (value: string): null | string => value.trim() || null
  return {
    androidPackageName: optional(configuration.androidPackageName),
    androidSha256CertFingerprints: configuration.androidSha256CertFingerprints,
    appStoreUrl: optional(configuration.appStoreUrl),
    description: optional(configuration.description),
    fallbackUrl: configuration.fallbackUrl.trim(),
    iosBundleId: optional(configuration.iosBundleId),
    iosTeamId: optional(configuration.iosTeamId),
    name: configuration.name.trim(),
    nativeScheme: configuration.nativeScheme.trim(),
    playStoreUrl: optional(configuration.playStoreUrl),
  }
}

function transitionError(app: App, input: AppConsoleMutationInput): ConsoleResult<never> | null {
  if (input.action === 'activate') {
    if (app.status === 'active') {
      return {
        code: 'INVALID_TRANSITION',
        message: 'This app is already active.',
        ok: false,
        status: 409,
      }
    }
    if (!hasCompleteAppPlatform(app)) {
      return {
        code: 'NOT_READY',
        message: 'Complete either the iOS or Android configuration before activation.',
        ok: false,
        status: 422,
      }
    }
  }
  if (input.action === 'pause' && app.status !== 'active') {
    return {
      code: 'INVALID_TRANSITION',
      message: 'Only an active app can be paused.',
      ok: false,
      status: 409,
    }
  }
  if (
    input.action === 'save' &&
    app.status === 'active' &&
    !hasCompleteAppPlatform(input.configuration)
  ) {
    return {
      code: 'NOT_READY',
      message: 'An active app must keep at least one complete platform configuration.',
      ok: false,
      status: 422,
    }
  }
  return null
}

export async function mutateConsoleApp(
  payload: Payload,
  user: User,
  appID: string,
  input: AppConsoleMutationInput,
): Promise<ConsoleResult<AppConsoleDetailDTO>> {
  const app = await findScopedApp(payload, user, appID, input.workspaceId)
  if (!app) {
    return {
      code: 'NOT_FOUND',
      message: 'This app is not available in the selected workspace.',
      ok: false,
      status: 404,
    }
  }
  const blocked = transitionError(app, input)
  if (blocked) return blocked

  try {
    const update = await payload.update({
      collection: 'apps',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      user,
      where: {
        and: [
          { id: { equals: relationIdentifier(appID) } },
          { workspace: { equals: relationIdentifier(input.workspaceId) } },
        ],
      },
      data:
        input.action === 'save'
          ? configurationData(input.configuration)
          : { status: input.action === 'activate' ? 'active' : 'paused' },
    })
    if (update.docs.length === 0 || update.errors.length > 0) throw new Error('Update rejected')
  } catch (error) {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number' &&
      [400, 402, 403, 409, 422].includes(error.status)
        ? error.status
        : 409
    return {
      code: 'UPDATE_REJECTED',
      message:
        error instanceof Error && status !== 409
          ? error.message
          : 'Relay could not save this app in the selected workspace.',
      ok: false,
      status,
    }
  }

  return getConsoleAppDetail(payload, user, appID, input.workspaceId)
}
