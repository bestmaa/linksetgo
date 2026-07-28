import type { Metadata } from 'next'

import { AppDetailConnector } from '@/features/app-detail/app-detail.connector'

export const metadata: Metadata = {
  title: 'App management',
}

export default async function AppDetailPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  return <AppDetailConnector appId={appId} />
}
