'use client'

import { FallbackView } from './fallback.view'
import { useFallbackController } from './use-fallback-controller'
import type { PublicLinkPathStyle } from '@/lib/domain/runtime-link-config'

export function FallbackConnector({
  appSlug,
  linkSlug,
  marketingURL,
  pathStyle,
  publicBaseURL,
}: {
  appSlug: string
  linkSlug: string
  marketingURL: string
  pathStyle: PublicLinkPathStyle
  publicBaseURL: string
}) {
  return (
    <FallbackView
      {...useFallbackController(appSlug, linkSlug, marketingURL, publicBaseURL, pathStyle)}
    />
  )
}
