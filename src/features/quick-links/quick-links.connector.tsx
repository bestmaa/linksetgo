'use client'

import { QuickLinksView } from './quick-links.view'
import { useQuickLinksController } from './use-quick-links-controller'

export function QuickLinksConnector() {
  return <QuickLinksView {...useQuickLinksController()} />
}
