import type { PayloadRequest } from 'payload'

import { normalizeHostname } from '@/lib/domain/workspace-domain'

export const MANAGED_DOMAIN_PROVISIONING_CONTEXT_KEY = 'relayManagedDomainProvisioning'

export function managedDomainProvisioningRoot(
  req: Pick<PayloadRequest, 'context' | 'user'>,
): string | null {
  if (req.user) return null
  return normalizeHostname(req.context[MANAGED_DOMAIN_PROVISIONING_CONTEXT_KEY])
}
