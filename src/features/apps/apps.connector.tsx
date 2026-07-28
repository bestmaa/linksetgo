'use client'

import { AppsView } from './apps.view'
import { useAppsController } from './use-apps-controller'

export function AppsConnector() {
  return <AppsView {...useAppsController()} />
}
