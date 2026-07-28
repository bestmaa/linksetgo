import type { Metadata } from 'next'

import { DomainsConnector } from '@/features/domains/domains.connector'

export const metadata: Metadata = {
  title: 'Domains',
}

export default function DomainsPage() {
  return <DomainsConnector />
}
