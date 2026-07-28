'use client'

import { FallbackView } from './fallback.view'
import { useFallbackController } from './use-fallback-controller'

export function FallbackConnector({ appSlug, linkSlug }: { appSlug: string; linkSlug: string }) {
  return <FallbackView {...useFallbackController(appSlug, linkSlug)} />
}
