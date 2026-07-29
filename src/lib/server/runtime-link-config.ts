import 'server-only'

import type { Payload } from 'payload'

import { selectRuntimeLinkConfig, type RuntimeLinkConfig } from '@/lib/domain/runtime-link-config'
import type { User } from '@/payload-types'
import { getLinksetGoEdition } from './deployment-edition'
import { getServerEnvironment } from './env'

type RuntimeConfigResult =
  | { ok: true; value: RuntimeLinkConfig }
  | {
      code: 'NOT_FOUND'
      message: string
      ok: false
      status: 404
    }
  | {
      code: 'DOMAIN_UNAVAILABLE'
      message: string
      ok: false
      status: 409
    }

const idPattern = /^[A-Za-z0-9_-]{1,128}$/

const relationIdentifier = (value: string): number | string => {
  const numberValue = Number(value)
  return Number.isSafeInteger(numberValue) && numberValue > 0 && String(numberValue) === value
    ? numberValue
    : value
}

export function normalizeRuntimeWorkspaceID(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return idPattern.test(id) ? id : null
}

export async function getRuntimeLinkConfig(
  payload: Payload,
  user: User,
  workspaceID: string,
): Promise<RuntimeConfigResult> {
  const workspaceIdentifier = relationIdentifier(workspaceID)
  const workspaces = await payload.find({
    collection: 'workspaces',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    user,
    where: {
      and: [
        { id: { equals: workspaceIdentifier } },
        { status: { equals: 'active' } },
        { platformSuspended: { equals: false } },
      ],
    },
  })
  if (!workspaces.docs[0]) {
    return {
      code: 'NOT_FOUND',
      message: 'This workspace is not available to your account.',
      ok: false,
      status: 404,
    }
  }

  const domains = await payload.find({
    collection: 'domains',
    depth: 0,
    limit: 100,
    overrideAccess: false,
    pagination: false,
    sort: 'hostname',
    user,
    where: {
      and: [
        { workspace: { equals: workspaceIdentifier } },
        { status: { equals: 'active' } },
        { platformSuspended: { equals: false } },
      ],
    },
  })

  const value = selectRuntimeLinkConfig({
    domains: domains.docs,
    edition: getLinksetGoEdition(),
    installationBaseURL: getServerEnvironment().publicLinkBaseURL,
    workspaceID,
  })
  if (!value) {
    return {
      code: 'DOMAIN_UNAVAILABLE',
      message:
        'No active link domain is available for this Cloud workspace. Verify or restore its domain in Domains.',
      ok: false,
      status: 409,
    }
  }
  return { ok: true, value }
}
