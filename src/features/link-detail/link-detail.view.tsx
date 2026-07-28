import { ErrorState, TableSkeleton } from '@/components/ui/load-state'

import { LinkAnalyticsView } from './link-analytics.view'
import { LinkDetailConfirmView } from './link-detail-confirm.view'
import { LinkDetailEditView } from './link-detail-edit.view'
import { LinkDetailHeaderView } from './link-detail-header.view'
import { LinkDetailRoutingView } from './link-detail-routing.view'
import type { LinkDetailViewProps } from './link-detail.types'

export function LinkDetailView(props: LinkDetailViewProps) {
  if (props.isLoading) {
    return (
      <main className="page">
        <TableSkeleton />
      </main>
    )
  }
  if (props.error || !props.detail) {
    return (
      <main className="page">
        <ErrorState message={props.error ?? 'Link not found.'} onRetry={props.onRetry} />
      </main>
    )
  }

  return (
    <main className="page">
      <LinkDetailHeaderView
        detail={props.detail}
        isSaving={props.isSaving}
        onActionRequest={props.onActionRequest}
        onOpenEdit={props.onOpenEdit}
      />
      {props.mutationError && !props.isEditing && !props.action ? (
        <p className="app-detail-inline-error" role="alert">
          {props.mutationError}
        </p>
      ) : null}
      <LinkDetailRoutingView
        detail={props.detail}
        onCopyPublicURL={props.onCopyPublicURL}
        onDownloadQR={props.onDownloadQR}
      />
      <LinkAnalyticsView
        analytics={props.analytics}
        onAnalyticsEventChange={props.onAnalyticsEventChange}
        onAnalyticsFromChange={props.onAnalyticsFromChange}
        onAnalyticsPlatformChange={props.onAnalyticsPlatformChange}
        onAnalyticsRetry={props.onAnalyticsRetry}
        onAnalyticsToChange={props.onAnalyticsToChange}
      />
      {props.isEditing ? <LinkDetailEditView {...props} /> : null}
      {props.action ? <LinkDetailConfirmView {...props} action={props.action} /> : null}
      {props.toast ? (
        <div aria-live="polite" className="toast-region">
          <div className="toast">{props.toast}</div>
        </div>
      ) : null}
    </main>
  )
}
