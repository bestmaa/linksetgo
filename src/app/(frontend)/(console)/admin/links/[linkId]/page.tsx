import type { Metadata } from 'next'

import { LinkDetailConnector } from '@/features/link-detail/link-detail.connector'

export const metadata: Metadata = {
  title: 'Link details',
}

export default async function LinkDetailPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params
  return <LinkDetailConnector linkID={linkId} />
}
