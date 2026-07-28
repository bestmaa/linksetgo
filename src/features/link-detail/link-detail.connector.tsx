'use client'

import { LinkDetailView } from './link-detail.view'
import { useLinkDetailController } from './use-link-detail-controller'

export function LinkDetailConnector({ linkID }: { linkID: string }) {
  return <LinkDetailView {...useLinkDetailController(linkID)} />
}
