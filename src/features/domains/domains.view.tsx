import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { ErrorState } from '@/components/ui/load-state'

import { DomainDetailView } from './domain-detail.view'
import { DomainListView } from './domain-list.view'
import { DomainRegistrationView } from './domain-registration.view'
import { DomainReleaseConfirmationView } from './domain-release-confirmation.view'
import type { DomainsViewProps } from './domains.types'

export function DomainsView(props: DomainsViewProps) {
  return (
    <main className="page domains-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Link infrastructure</p>
          <h1 className="page-title">Domains</h1>
          <p className="page-copy">
            Operate managed and custom hostnames for{' '}
            {props.workspaceName ?? 'the selected workspace'}.
          </p>
        </div>
        <div className="domain-header-actions">
          <Button disabled={props.isLoading} onClick={props.onRefresh} variant="secondary">
            <Icon name="refresh" /> Refresh status
          </Button>
          <Button disabled={!props.workspaceName} onClick={props.onCreate}>
            <Icon name="plus" /> Add custom domain
          </Button>
        </div>
      </header>

      {!props.workspaceName && !props.isLoading ? (
        <div className="card">
          <ErrorState
            message="Select a workspace before managing domains."
            onRetry={props.onRefresh}
          />
        </div>
      ) : null}
      {props.error ? (
        <div className="card">
          <ErrorState message={props.error} onRetry={props.onRefresh} />
        </div>
      ) : null}

      {props.workspaceName && !props.error ? (
        <div className="domains-layout">
          <DomainListView
            domains={props.domains}
            isLoading={props.isLoading}
            onCreate={props.onCreate}
          />
          {props.selectedDomain ? (
            <DomainDetailView domain={props.selectedDomain} />
          ) : !props.isLoading && props.domains.length > 0 ? (
            <section className="card domain-detail-placeholder">
              <p>Select a domain to inspect its setup.</p>
            </section>
          ) : null}
        </div>
      ) : null}

      {props.isCreateOpen ? <DomainRegistrationView {...props} /> : null}
      <DomainReleaseConfirmationView confirmation={props.releaseConfirmation} />
      {props.toast ? (
        <div aria-live="polite" className="toast-region">
          <div className="toast">
            <span aria-hidden="true">✓</span>
            {props.toast}
          </div>
        </div>
      ) : null}
    </main>
  )
}
