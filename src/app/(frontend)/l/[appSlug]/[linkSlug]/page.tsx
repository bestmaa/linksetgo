import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { FallbackConnector } from '@/features/fallback/fallback.connector'
import { resolvePublicHost } from '@/lib/server/resolve-public-host'
import { getMarketingSiteURL } from '@/lib/server/site-url'

export const metadata: Metadata = {
  description: 'Continue to the right destination in the mobile app or on the web.',
  robots: { follow: false, index: false, noarchive: true },
  title: 'Open link',
}

export default async function FallbackPage({
  params,
}: {
  params: Promise<{ appSlug: string; linkSlug: string }>
}) {
  const { appSlug, linkSlug } = await params
  const requestHeaders = new Headers()
  ;(await headers()).forEach((value, key) => requestHeaders.set(key, value))
  const host = await resolvePublicHost(
    new Request('http://localhost/public-link-page', { headers: requestHeaders }),
    'resolver',
  )
  if (!host.ok) notFound()

  return (
    <FallbackConnector
      appSlug={appSlug}
      linkSlug={linkSlug}
      marketingURL={getMarketingSiteURL().origin}
      pathStyle={host.pathStyle}
      publicBaseURL={host.baseURL}
    />
  )
}
