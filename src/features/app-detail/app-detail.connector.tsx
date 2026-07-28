'use client'

import { AppDetailView } from './app-detail.view'
import { useAppDetailController } from './use-app-detail-controller'

export function AppDetailConnector({ appId }: { appId: string }) {
  return <AppDetailView {...useAppDetailController(appId)} />
}
