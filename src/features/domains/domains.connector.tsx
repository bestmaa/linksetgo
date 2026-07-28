'use client'

import { DomainsView } from './domains.view'
import { useDomainsController } from './use-domains-controller'

export function DomainsConnector() {
  return <DomainsView {...useDomainsController()} />
}
