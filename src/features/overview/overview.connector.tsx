'use client'

import { OverviewView } from './overview.view'
import { useOverviewController } from './use-overview-controller'

export function OverviewConnector() {
  return <OverviewView {...useOverviewController()} />
}
