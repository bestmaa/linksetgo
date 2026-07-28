'use client'

import { FallbackOriginsView } from './fallback-origins.view'
import { useFallbackOriginsController } from './use-fallback-origins-controller'

export function FallbackOriginsConnector(props: { required: boolean }) {
  return <FallbackOriginsView {...useFallbackOriginsController(props)} />
}
