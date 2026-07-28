'use client'

import { LinksView } from './links.view'
import { useLinksController } from './use-links-controller'

export function LinksConnector() {
  return <LinksView {...useLinksController()} />
}
