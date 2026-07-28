import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { LinkDetailViewModel, LinkDetailViewProps } from './link-detail.types'

type HeaderProps = Pick<LinkDetailViewProps, 'isSaving' | 'onActionRequest' | 'onOpenEdit'> & {
  detail: LinkDetailViewModel
}

export function LinkDetailHeaderView(props: HeaderProps) {
  const active = props.detail.effectiveStatus === 'active'
  return (
    <header className="page-header link-detail-header">
      <div>
        <Link className="app-detail-back-link" href="/admin/links">
          ← All links
        </Link>
        <p className="eyebrow">{props.detail.appName}</p>
        <div className="app-detail-title-row">
          <h1 className="page-title">{props.detail.name}</h1>
          <Badge tone={props.detail.statusTone}>{props.detail.effectiveStatus}</Badge>
        </div>
        <p className="page-copy">
          Permanent key <code>{props.detail.linkKey}</code>
        </p>
      </div>
      {props.detail.canManage ? (
        <div className="app-detail-header-actions">
          <Button disabled={props.isSaving} onClick={props.onOpenEdit} variant="secondary">
            Edit link
          </Button>
          <Button
            disabled={props.isSaving}
            onClick={() => props.onActionRequest(active ? 'pause' : 'activate')}
            variant={active ? 'danger' : 'primary'}
          >
            {active ? 'Pause link' : 'Activate link'}
          </Button>
        </div>
      ) : null}
    </header>
  )
}
