import type { CollectionBeforeValidateHook } from 'payload'
import { APIError } from 'payload'

import {
  buildManagedWorkspaceHostname,
  canTransitionDomain,
  normalizeHostname,
  type DomainStatus,
} from '@/lib/domain/workspace-domain'
import { isPlatformSuperAdmin, relationID } from './tenant-context'
import { getServerEnvironment } from './env'
import { managedDomainProvisioningRoot } from './managed-domain-provisioning'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const selected = (
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
  field: string,
): unknown => (Object.hasOwn(next, field) ? next[field] : previous[field])

const isDomainStatus = (value: unknown): value is DomainStatus =>
  value === 'active' ||
  value === 'association-incomplete' ||
  value === 'certificate-ready' ||
  value === 'pending-dns' ||
  value === 'suspended' ||
  value === 'verifying'

const lifecycleFieldNames = [
  'activatedAt',
  'associationsVerifiedAt',
  'cnameVerifiedAt',
  'dnsVerifiedAt',
  'lastCheckedAt',
  'lastVerificationError',
  'status',
  'tlsCertificateRef',
  'tlsReadyAt',
  'tlsRenewsAt',
] as const

const requiresEvidence = (
  status: DomainStatus,
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
): void => {
  if (
    (status === 'certificate-ready' ||
      status === 'association-incomplete' ||
      status === 'active') &&
    (!selected(next, previous, 'dnsVerifiedAt') ||
      !selected(next, previous, 'cnameVerifiedAt') ||
      !selected(next, previous, 'tlsReadyAt'))
  ) {
    throw new APIError('DNS ownership, CNAME, and TLS evidence are required for this state.', 400)
  }

  if (
    status === 'active' &&
    (!selected(next, previous, 'associationsVerifiedAt') ||
      !selected(next, previous, 'activatedAt'))
  ) {
    throw new APIError('Association verification is required before domain activation.', 400)
  }
}

export const enforceDomainLifecycle: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const hostname = normalizeHostname(selected(next, previous, 'hostname'))
  if (!hostname) {
    throw new APIError('Enter a valid hostname without a scheme, path, port, or wildcard.', 400)
  }

  const type = selected(next, previous, 'type')
  if (type !== 'custom' && type !== 'managed') {
    throw new APIError('Select a managed or custom domain type.', 400)
  }

  if (
    operation === 'update' &&
    (hostname !== normalizeHostname(previous.hostname) || type !== previous.type)
  ) {
    throw new APIError('A domain hostname and type cannot be changed after registration.', 400)
  }
  if (
    operation === 'update' &&
    selected(next, previous, 'platformSuspended') === true &&
    lifecycleFieldNames.some(
      (field) => Object.hasOwn(next, field) && next[field] !== previous[field],
    )
  ) {
    throw new APIError('A platform-suspended domain cannot advance its lifecycle.', 403)
  }

  const environment = getServerEnvironment()
  const legacyHostname = normalizeHostname(new URL(environment.publicLinkBaseURL).hostname)
  if (hostname === legacyHostname) {
    throw new APIError('The installation legacy hostname is reserved.', 400)
  }

  const provisioningRoot = managedDomainProvisioningRoot(req)
  const managedRoot = environment.managedLinkRootDomain ?? provisioningRoot
  if (type === 'managed') {
    if (req.user && !isPlatformSuperAdmin(req)) {
      throw new APIError('Only the Relay platform can register a managed domain.', 403)
    }
    if (!managedRoot) {
      throw new APIError('MANAGED_LINK_ROOT_DOMAIN is required for managed domains.', 400)
    }
    if (
      environment.managedLinkRootDomain &&
      provisioningRoot &&
      provisioningRoot !== environment.managedLinkRootDomain
    ) {
      throw new APIError(
        'Managed domain provisioning root does not match Relay configuration.',
        400,
      )
    }

    const workspaceID = relationID(selected(next, previous, 'workspace'))
    if (!workspaceID) throw new APIError('A managed domain requires a workspace.', 400)

    const workspace = await req.payload.findByID({
      collection: 'workspaces',
      id: /^\d+$/.test(workspaceID) ? Number(workspaceID) : workspaceID,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const expectedHostname = buildManagedWorkspaceHostname(workspace.slug, managedRoot)
    if (hostname !== expectedHostname) {
      throw new APIError(`Managed hostname must be "${expectedHostname ?? 'unavailable'}".`, 400)
    }
  } else if (managedRoot && (hostname === managedRoot || hostname.endsWith(`.${managedRoot}`))) {
    throw new APIError('Managed Relay hostnames cannot be registered as custom domains.', 400)
  }

  const previousStatus = isDomainStatus(previous.status) ? previous.status : null
  const nextStatus = isDomainStatus(selected(next, previous, 'status'))
    ? (selected(next, previous, 'status') as DomainStatus)
    : 'pending-dns'
  const isManagedProvisioning = type === 'managed' && Boolean(provisioningRoot)
  if (
    operation === 'create' &&
    nextStatus !== 'pending-dns' &&
    !(isManagedProvisioning && nextStatus === 'active')
  ) {
    throw new APIError('A new domain must begin in pending-dns.', 400)
  }
  if (
    operation === 'update' &&
    previousStatus &&
    nextStatus !== previousStatus &&
    !canTransitionDomain(previousStatus, nextStatus)
  ) {
    throw new APIError(`Domain cannot move from ${previousStatus} to ${nextStatus}.`, 400)
  }

  requiresEvidence(nextStatus, next, previous)
  return { ...next, hostname, status: nextStatus }
}
