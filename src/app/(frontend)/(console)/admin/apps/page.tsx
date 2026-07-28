import type { Metadata } from 'next'

import { AppsConnector } from '@/features/apps/apps.connector'

export const metadata: Metadata = {
  title: 'Apps',
}

export default function AppsPage() {
  return <AppsConnector />
}
