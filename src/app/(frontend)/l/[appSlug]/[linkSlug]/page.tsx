import type { Metadata } from 'next'

import { FallbackConnector } from '@/features/fallback/fallback.connector'

export const metadata: Metadata = {
  description: 'Continue to the right destination in the mobile app or on the web.',
  title: 'Open link',
}

export default async function FallbackPage({
  params,
}: {
  params: Promise<{ appSlug: string; linkSlug: string }>
}) {
  const { appSlug, linkSlug } = await params
  return <FallbackConnector appSlug={appSlug} linkSlug={linkSlug} />
}
