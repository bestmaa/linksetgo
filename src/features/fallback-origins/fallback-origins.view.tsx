import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { ErrorState } from '@/components/ui/load-state'

import { FallbackOriginDetailView } from './fallback-origin-detail.view'
import { FallbackOriginListView } from './fallback-origin-list.view'
import { FallbackOriginRegistrationView } from './fallback-origin-registration.view'
import { FallbackOriginRevocationView } from './fallback-origin-revocation.view'
import type { FallbackOriginsViewProps } from './fallback-origins.types'

export function FallbackOriginsView(props: FallbackOriginsViewProps) {
  return (
    <main className="page fallback-origins-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cloud fallback security</p>
          <h1 className="page-title">Fallback origins</h1>
          <p className="page-copy">
            Prove which HTTPS fallback hostnames are controlled by{' '}
            {props.workspaceName ?? 'the selected workspace'}. DNS ownership and exact-URL safety
            scans must both pass before Cloud redirects.
          </p>
        </div>
        {props.required ? (
          <div className="domain-header-actions">
            <Button disabled={props.isLoading} onClick={props.onRefresh} variant="secondary">
              <Icon name="refresh" /> Refresh
            </Button>
            <Button disabled={!props.workspaceName} onClick={props.onCreate}>
              <Icon name="plus" /> Register origin
            </Button>
          </div>
        ) : null}
      </header>

      {!props.required ? (
        <section className="card fallback-origin-community">
          <span aria-hidden="true">✓</span>
          <div>
            <h2>Not required in LinksetGo Community</h2>
            <p>
              Community installations trust the operator&apos;s app fallback allowlist directly. DNS
              ownership verification is a LinksetGo Cloud activation gate.
            </p>
          </div>
        </section>
      ) : !props.workspaceName && !props.isLoading ? (
        <div className="card">
          <ErrorState
            message="Select a workspace before managing fallback origins."
            onRetry={props.onRefresh}
          />
        </div>
      ) : props.error ? (
        <div className="card">
          <ErrorState message={props.error} onRetry={props.onRefresh} />
        </div>
      ) : props.workspaceName ? (
        <div className="domains-layout">
          <FallbackOriginListView
            isLoading={props.isLoading}
            onCreate={props.onCreate}
            origins={props.origins}
          />
          {props.selectedOrigin ? (
            <FallbackOriginDetailView
              origin={props.selectedOrigin}
              verificationAvailable={props.verificationAvailable}
              verificationMessage={props.verificationMessage}
            />
          ) : null}
        </div>
      ) : null}

      {props.workspaceName ? (
        <FallbackOriginRegistrationView
          registration={props.registration}
          workspaceName={props.workspaceName}
        />
      ) : null}
      <FallbackOriginRevocationView revocation={props.revocation} />
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
