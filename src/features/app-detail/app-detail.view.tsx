import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState, TableSkeleton } from '@/components/ui/load-state'

import { AppDetailConfirmView } from './app-detail-confirm.view'
import { AppDetailEditView } from './app-detail-edit.view'
import { AppDetailLinksView } from './app-detail-links.view'
import { AppDetailOverviewView } from './app-detail-overview.view'
import { AppDetailReadinessView } from './app-detail-readiness.view'
import type { AppDetailViewProps } from './app-detail.types'

function Header(props: AppDetailViewProps & { app: NonNullable<AppDetailViewProps['app']> }) {
  return (
    <header className="app-detail-header">
      <div>
        <p className="app-detail-breadcrumb">
          <Link href="/admin/apps">Apps</Link>
          <span aria-hidden="true">/</span>
          {props.app.name}
        </p>
        <div className="app-detail-title-row">
          <h1 className="page-title">{props.app.name}</h1>
          <Badge tone={props.app.statusTone}>{props.app.status}</Badge>
        </div>
        <p className="page-copy">{props.app.description}</p>
        <span className="app-detail-updated">{props.app.updatedLabel}</span>
      </div>
      {props.app.canManage ? (
        <div className="app-detail-header-actions">
          <Button onClick={props.onOpenEdit} variant="secondary">
            Edit configuration
          </Button>
          {props.app.status === 'active' ? (
            <Button onClick={() => props.onRequestAction('pause')} variant="danger">
              Pause app
            </Button>
          ) : (
            <Button
              disabled={!props.app.canActivate}
              onClick={() => props.onRequestAction('activate')}
            >
              Activate app
            </Button>
          )}
        </div>
      ) : (
        <Badge tone="neutral">Read only</Badge>
      )}
    </header>
  )
}

export function AppDetailView(props: AppDetailViewProps) {
  if (props.isLoading) {
    return (
      <main className="page app-detail-page">
        <section aria-label="Loading app management" className="card">
          <TableSkeleton rows={7} />
        </section>
      </main>
    )
  }

  if (props.error || !props.app) {
    return (
      <main className="page app-detail-page">
        <section className="card">
          <ErrorState
            message={props.error ?? 'This app is unavailable.'}
            onRetry={props.onRetry}
            title="App unavailable"
          />
        </section>
      </main>
    )
  }

  return (
    <main className="page app-detail-page">
      <Header {...props} app={props.app} />
      <section
        className={`app-detail-activation app-detail-activation-${props.app.canActivate ? 'ready' : 'blocked'}`}
      >
        <strong>
          {props.app.canActivate ? 'Platform requirement met' : 'Activation is blocked'}
        </strong>
        <span>{props.app.activationHelp}</span>
      </section>
      <AppDetailReadinessView android={props.app.android} ios={props.app.ios} />
      <AppDetailOverviewView app={props.app} />
      <AppDetailLinksView
        app={props.app}
        isRuntimeDomainLoading={props.isRuntimeDomainLoading}
        onCreateLink={props.onCreateLink}
        onRetryRuntimeDomain={props.onRetryRuntimeDomain}
        runtimeDomainError={props.runtimeDomainError}
      />

      {props.isEditing ? <AppDetailEditView {...props} app={props.app} /> : null}
      {props.confirmation ? <AppDetailConfirmView action={props.confirmation} {...props} /> : null}
      {props.toast ? (
        <div aria-live="polite" className="toast-region">
          <div className="toast">{props.toast}</div>
        </div>
      ) : null}
    </main>
  )
}
