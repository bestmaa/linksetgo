import 'server-only'

import { randomBytes } from 'node:crypto'

import type { Payload } from 'payload'

import { normalizeHostname } from '@/lib/domain/workspace-domain'
import type {
  DomainConsoleDTO,
  DomainInstructionsDTO,
  Identifier,
} from '@/lib/client/payload-types'
import type { Domain, User } from '@/payload-types'
import { domainVerificationInstructions } from './domain-lifecycle'

type ConsoleResult<T> =
  | { ok: true; value: T }
  | {
      code: 'INVALID_INPUT' | 'NOT_FOUND' | 'NOT_READY' | 'REGISTRATION_REJECTED' | 'UNAVAILABLE'
      message: string
      ok: false
      status: number
    }

const idPattern = /^[A-Za-z0-9_-]{1,128}$/

const relationIdentifier = (value: string): Identifier => {
  const numberValue = Number(value)
  return Number.isSafeInteger(numberValue) && numberValue > 0 && String(numberValue) === value
    ? numberValue
    : value
}

export function normalizeConsoleWorkspaceID(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return idPattern.test(id) ? id : null
}

export function normalizeCustomDomainHostname(value: unknown): string | null {
  const hostname = normalizeHostname(value)
  if (!hostname || !hostname.includes('.') || hostname === 'localhost') return null
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return null
  return hostname
}

export function isActiveConsoleUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false
  return (
    'id' in value &&
    (typeof value.id === 'string' || typeof value.id === 'number') &&
    'status' in value &&
    value.status === 'active'
  )
}

export function projectConsoleDomain(domain: Domain): DomainConsoleDTO {
  return {
    hostname: domain.hostname,
    id: domain.id,
    status: domain.platformSuspended ? 'suspended' : domain.status,
    type: domain.type,
    ...(domain.lastCheckedAt ? { lastCheckedAt: domain.lastCheckedAt } : {}),
    ...(domain.lastVerificationError
      ? { lastVerificationError: domain.lastVerificationError }
      : {}),
    ...(domain.updatedAt ? { updatedAt: domain.updatedAt } : {}),
  }
}

export async function listConsoleDomains(
  payload: Payload,
  user: User,
  workspaceID: string,
): Promise<ConsoleResult<{ docs: DomainConsoleDTO[] }>> {
  try {
    const result = await payload.find({
      collection: 'domains',
      depth: 0,
      limit: 100,
      overrideAccess: false,
      pagination: false,
      sort: 'hostname',
      user,
      where: { workspace: { equals: relationIdentifier(workspaceID) } },
    })
    return { ok: true, value: { docs: result.docs.map(projectConsoleDomain) } }
  } catch {
    return {
      code: 'UNAVAILABLE',
      message: 'Workspace domains are temporarily unavailable.',
      ok: false,
      status: 500,
    }
  }
}

export async function registerConsoleCustomDomain(
  payload: Payload,
  user: User,
  input: { hostname: unknown; workspaceID: unknown },
): Promise<ConsoleResult<DomainConsoleDTO>> {
  const hostname = normalizeCustomDomainHostname(input.hostname)
  const workspaceID = normalizeConsoleWorkspaceID(input.workspaceID)
  const workspaceIdentifier = workspaceID ? relationIdentifier(workspaceID) : null
  if (!hostname || typeof workspaceIdentifier !== 'number') {
    return {
      code: 'INVALID_INPUT',
      message: 'Enter one public hostname and select a workspace.',
      ok: false,
      status: 400,
    }
  }

  try {
    const domain = await payload.create({
      collection: 'domains',
      depth: 0,
      overrideAccess: false,
      user,
      data: {
        hostname,
        status: 'pending-dns',
        type: 'custom',
        verificationToken: randomBytes(32).toString('base64url'),
        workspace: workspaceIdentifier,
      },
    })
    return { ok: true, value: projectConsoleDomain(domain) }
  } catch {
    return {
      code: 'REGISTRATION_REJECTED',
      message:
        'LinksetGo could not register this hostname. It may already be in use or unavailable to this workspace.',
      ok: false,
      status: 409,
    }
  }
}

export async function getConsoleDomainInstructions(
  payload: Payload,
  user: User,
  domainID: string,
  workspaceID: string,
): Promise<ConsoleResult<DomainInstructionsDTO>> {
  const result = await payload
    .find({
      collection: 'domains',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      user,
      where: {
        and: [
          { id: { equals: relationIdentifier(domainID) } },
          { workspace: { equals: relationIdentifier(workspaceID) } },
          { type: { equals: 'custom' } },
        ],
      },
    })
    .catch(() => null)
  if (!result) {
    return {
      code: 'UNAVAILABLE',
      message: 'Domain instructions are temporarily unavailable.',
      ok: false,
      status: 500,
    }
  }
  const domain = result.docs[0]
  if (!domain) {
    return {
      code: 'NOT_FOUND',
      message: 'This custom domain is not available in the selected workspace.',
      ok: false,
      status: 404,
    }
  }

  const instructions = domainVerificationInstructions(domain)
  if (!instructions) {
    return {
      code: 'NOT_READY',
      message: 'Custom-domain ingress is not configured for this LinksetGo installation.',
      ok: false,
      status: 503,
    }
  }

  return {
    ok: true,
    value: {
      domain: projectConsoleDomain(domain),
      records: instructions,
    },
  }
}
