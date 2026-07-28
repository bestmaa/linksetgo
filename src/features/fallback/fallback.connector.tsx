'use client'

import { FallbackView } from './fallback.view'
import { useFallbackController } from './use-fallback-controller'

export function FallbackConnector({
  appSlug,
  linkSlug,
  marketingURL,
}: {
  appSlug: string
  linkSlug: string
  marketingURL: string
}) {
  return <FallbackView {...useFallbackController(appSlug, linkSlug, marketingURL)} />
}
