import 'server-only'

import { createLocalReq, type Payload, type PayloadRequest } from 'payload'

import type {
  FallbackOriginActionDTO,
  FallbackOriginConsoleDTO,
  FallbackOriginInstructionsDTO,
  FallbackOriginListDTO,
  Identifier,
} from '@/lib/client/payload-types'
import {
  buildFallbackOriginInstructions,
  normalizeFallbackOriginHostname,
} from '@/lib/domain/fallback-origin'
import type { FallbackOrigin, User } from '@/payload-types'

import { getRelayEdition } from './deployment-edition'
import type { FallbackOriginDNSProviderConfiguration } from './fallback-origin-dns-webhook'
import {
  beginFallbackOriginVerification,
  revokeFallbackOrigin,
  verifyFallbackOriginWithProvider,
} from './fallback-origin-lifecycle'
import { canAccessWorkspace } from './tenant-context'

type ConsoleResult<T> =
  | { ok: true; value: T }
  | {
      code:
        | 'FORBIDDEN'
        | 'INVALID_INPUT'
        | 'INVALID_STATE'
        | 'NOT_FOUND'
        | 'NOT_REQUIRED'
        | 'REGISTRATION_REJECTED'
        | 'UNAVAILABLE'
        | 'VERIFICATION_FAILED'
      message: string
      ok: false
      status: number
    }

const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/

const relationIdentifier = (value: string): Identifier => {
  const numberValue = Number(value)
  return Number.isSafeInteger(numberValue) && numberValue > 0 && String(numberValue) === value
    ? numberValue
    : value
}

export function normalizeFallbackOriginID(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return identifierPattern.test(id) ? id : null
}

export function projectConsoleFallbackOrigin(origin: FallbackOrigin): FallbackOriginConsoleDTO {
  return {
    hostname: origin.hostname,
    id: origin.id,
    status: origin.status,
    ...(origin.lastCheckedAt ? { lastCheckedAt: origin.lastCheckedAt } : {}),
    ...(origin.lastVerificationError
      ? { lastVerificationError: origin.lastVerificationError }
      : {}),
    ...(origin.revokedAt ? { revokedAt: origin.revokedAt } : {}),
    ...(origin.updatedAt ? { updatedAt: origin.updatedAt } : {}),
    ...(origin.verifiedAt ? { verifiedAt: origin.verifiedAt } : {}),
  }
}

export async function listConsoleFallbackOrigins(input: {
  payload: Payload
  provider: FallbackOriginDNSProviderConfiguration
  user: User
  workspaceID: string
}): Promise<ConsoleResult<FallbackOriginListDTO>> {
  if (getRelayEdition() !== 'cloud') {
    return {
      ok: true,
      value: {
        docs: [],
        required: false,
        verification: { available: false, message: null },
      },
    }
  }

  try {
    const req = await createLocalReq({ user: input.user }, input.payload)
    const result = await input.payload.find({
      collection: 'fallback-origins',
      depth: 0,
      limit: 100,
      overrideAccess: false,
      pagination: false,
      req,
      sort: 'hostname',
      user: input.user,
      where: {
        workspace: { equals: relationIdentifier(input.workspaceID) },
      },
    })
    return {
      ok: true,
      value: {
        docs: result.docs.map(projectConsoleFallbackOrigin),
        required: true,
        verification: {
          available: input.provider.available,
          message: input.provider.available ? null : input.provider.message,
        },
      },
    }
  } catch {
    return {
      code: 'UNAVAILABLE',
      message: 'Fallback origins are temporarily unavailable.',
      ok: false,
      status: 500,
    }
  }
}

export async function registerConsoleFallbackOrigin(input: {
  hostname: unknown
  payload: Payload
  user: User
  workspaceID: string
}): Promise<ConsoleResult<FallbackOriginConsoleDTO>> {
  if (getRelayEdition() !== 'cloud') {
    return {
      code: 'NOT_REQUIRED',
      message: 'Relay Community does not require fallback-origin verification.',
      ok: false,
      status: 404,
    }
  }
  const hostname = normalizeFallbackOriginHostname(input.hostname)
  if (!hostname) {
    return {
      code: 'INVALID_INPUT',
      message: 'Enter one public fallback hostname without a scheme, path, port, IP, or wildcard.',
      ok: false,
      status: 400,
    }
  }
  const workspaceID = Number(input.workspaceID)
  if (
    !Number.isSafeInteger(workspaceID) ||
    workspaceID <= 0 ||
    String(workspaceID) !== input.workspaceID
  ) {
    return {
      code: 'INVALID_INPUT',
      message: 'Select one valid workspace.',
      ok: false,
      status: 400,
    }
  }

  try {
    const req = await createLocalReq({ user: input.user }, input.payload)
    if (!(await canAccessWorkspace(req, String(workspaceID), 'manage'))) {
      return {
        code: 'FORBIDDEN',
        message:
          'Relay could not register this fallback hostname. It may already be in use or unavailable to this workspace.',
        ok: false,
        status: 403,
      }
    }
    const origin = await input.payload.create({
      collection: 'fallback-origins',
      data: {
        hostname,
        status: 'pending',
        verificationToken: 'generated-by-server',
        workspace: workspaceID,
      },
      depth: 0,
      overrideAccess: false,
      req,
      user: input.user,
    })
    return { ok: true, value: projectConsoleFallbackOrigin(origin) }
  } catch {
    return {
      code: 'REGISTRATION_REJECTED',
      message:
        'Relay could not register this fallback hostname. It may already be in use or unavailable to this workspace.',
      ok: false,
      status: 409,
    }
  }
}

async function findConsoleOrigin(input: {
  id: string
  payload: Payload
  req: PayloadRequest
  workspaceID: string
}): Promise<FallbackOrigin | null> {
  const result = await input.payload
    .find({
      collection: 'fallback-origins',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      req: input.req,
      user: input.req.user,
      where: {
        and: [
          { id: { equals: relationIdentifier(input.id) } },
          { workspace: { equals: relationIdentifier(input.workspaceID) } },
        ],
      },
    })
    .catch(() => null)
  return result?.docs[0] ?? null
}

export async function getConsoleFallbackOriginInstructions(input: {
  id: string
  payload: Payload
  user: User
  workspaceID: string
}): Promise<ConsoleResult<FallbackOriginInstructionsDTO>> {
  if (getRelayEdition() !== 'cloud') {
    return {
      code: 'NOT_REQUIRED',
      message: 'Relay Community does not require fallback-origin verification.',
      ok: false,
      status: 404,
    }
  }
  const req = await createLocalReq({ user: input.user }, input.payload).catch(() => null)
  if (!req) {
    return {
      code: 'UNAVAILABLE',
      message: 'Fallback-origin instructions are temporarily unavailable.',
      ok: false,
      status: 500,
    }
  }
  const origin = await findConsoleOrigin({
    id: input.id,
    payload: input.payload,
    req,
    workspaceID: input.workspaceID,
  })
  if (!origin) {
    return {
      code: 'NOT_FOUND',
      message: 'This fallback origin is not available in the selected workspace.',
      ok: false,
      status: 404,
    }
  }
  const instructions = buildFallbackOriginInstructions(origin)
  if (!instructions) {
    return {
      code: 'UNAVAILABLE',
      message: 'Fallback-origin instructions are temporarily unavailable.',
      ok: false,
      status: 500,
    }
  }
  return {
    ok: true,
    value: {
      origin: projectConsoleFallbackOrigin(origin),
      record: instructions,
    },
  }
}

export async function runConsoleFallbackOriginAction(input: {
  action: 'revoke' | 'verify'
  id: string
  payload: Payload
  provider: FallbackOriginDNSProviderConfiguration
  user: User
  workspaceID: string
}): Promise<ConsoleResult<FallbackOriginActionDTO>> {
  if (getRelayEdition() !== 'cloud') {
    return {
      code: 'NOT_REQUIRED',
      message: 'Relay Community does not require fallback-origin verification.',
      ok: false,
      status: 404,
    }
  }
  const req = await createLocalReq({ user: input.user }, input.payload).catch(() => null)
  if (!req) {
    return {
      code: 'UNAVAILABLE',
      message: 'The fallback-origin action could not be completed.',
      ok: false,
      status: 500,
    }
  }
  const origin = await findConsoleOrigin({
    id: input.id,
    payload: input.payload,
    req,
    workspaceID: input.workspaceID,
  })
  if (!origin) {
    return {
      code: 'NOT_FOUND',
      message: 'This fallback origin is not available in the selected workspace.',
      ok: false,
      status: 404,
    }
  }
  try {
    if (input.action === 'revoke') {
      const result = await revokeFallbackOrigin({ id: origin.id, payload: input.payload, req })
      return result.ok
        ? {
            ok: true,
            value: {
              message: 'Fallback origin revoked. Cloud fallback routing now fails closed.',
              origin: projectConsoleFallbackOrigin(result.origin as FallbackOrigin),
            },
          }
        : {
            code: 'INVALID_STATE',
            message: result.message,
            ok: false,
            status: 409,
          }
    }

    if (!input.provider.available) {
      return {
        code: 'UNAVAILABLE',
        message: input.provider.message,
        ok: false,
        status: 503,
      }
    }
    const begun = await beginFallbackOriginVerification({
      id: origin.id,
      payload: input.payload,
      req,
    })
    if (!begun.ok) {
      return {
        code: 'INVALID_STATE',
        message: begun.message,
        ok: false,
        status: 409,
      }
    }
    const result = await verifyFallbackOriginWithProvider({
      id: origin.id,
      payload: input.payload,
      provider: input.provider.provider,
      req,
    })
    return result.ok
      ? {
          ok: true,
          value: {
            message: 'Fallback origin ownership verified.',
            origin: projectConsoleFallbackOrigin(result.origin as FallbackOrigin),
          },
        }
      : {
          code: 'VERIFICATION_FAILED',
          message: result.message,
          ok: false,
          status: result.code === 'DNS_PROVIDER_UNAVAILABLE' ? 503 : 422,
        }
  } catch {
    return {
      code: 'UNAVAILABLE',
      message: 'The fallback-origin action could not be completed.',
      ok: false,
      status: 500,
    }
  }
}
