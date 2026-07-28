import 'server-only'

import type { Payload } from 'payload'

import type { BillingProvider } from '@/lib/application/billing-provider'
import type { CloudPlanKey } from '@/lib/domain/plan-catalog'
import type { User } from '@/payload-types'
import { relationID } from './tenant-context'

export type BillingCheckoutOutcome =
  | { kind: 'success'; expiresAt: string | null; url: string }
  | { kind: 'disabled' | 'forbidden' | 'invalid'; message: string }
  | { kind: 'error'; message: string; retryable: boolean }

const numericID = (value: string): number | null => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function createOrganizationCheckout(input: {
  appBaseURL: string
  payload: Payload
  plan: Exclude<CloudPlanKey, 'free'>
  provider: BillingProvider
  user: User
  workspaceID: string
}): Promise<BillingCheckoutOutcome> {
  const workspaceID = numericID(input.workspaceID)
  if (!workspaceID || input.user.status !== 'active') {
    return { kind: 'invalid', message: 'Select a valid workspace.' }
  }

  const workspaces = await input.payload.find({
    collection: 'workspaces',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    user: input.user,
    where: { id: { equals: workspaceID } },
  })
  const organizationID = relationID(workspaces.docs[0]?.organization)
  const organizationIdentifier = organizationID ? numericID(organizationID) : null
  if (!organizationIdentifier) {
    return { kind: 'forbidden', message: 'This workspace is not available.' }
  }

  if (input.user.role !== 'super-admin') {
    const membership = await input.payload.find({
      collection: 'organization-memberships',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { organization: { equals: organizationIdentifier } },
          { user: { equals: input.user.id } },
          { role: { in: ['owner', 'admin'] } },
          { status: { equals: 'active' } },
        ],
      },
    })
    if (!membership.docs[0]) {
      return { kind: 'forbidden', message: 'Only an owner or admin can change plans.' }
    }
  }

  const baseURL = new URL(input.appBaseURL)
  const result = await input.provider.createCheckoutSession({
    cancelURL: new URL('/admin/settings?checkout=canceled', baseURL).toString(),
    customerEmail: input.user.email,
    organizationID: String(organizationIdentifier),
    plan: input.plan,
    successURL: new URL('/admin/settings?checkout=return', baseURL).toString(),
  })
  if (result.kind !== 'success') return result

  let sessionURL: URL
  try {
    sessionURL = new URL(result.value.url)
  } catch {
    return { kind: 'error', message: 'Billing returned an invalid session.', retryable: false }
  }
  if (sessionURL.protocol !== 'https:') {
    return { kind: 'error', message: 'Billing returned an insecure session.', retryable: false }
  }

  return {
    kind: 'success',
    expiresAt: result.value.expiresAt,
    url: sessionURL.toString(),
  }
}
