import { Badge } from '@/components/ui/badge'

import type { AppDetailViewModel } from './app-detail.types'

function ExternalValue({ href, label }: { href: string | null; label: string }) {
  return href ? (
    <a className="app-detail-external-value" href={href} rel="noreferrer" target="_blank">
      {label} <span aria-hidden="true">↗</span>
    </a>
  ) : (
    <span className="app-detail-empty-value">Not configured</span>
  )
}

export function AppDetailOverviewView({ app }: { app: AppDetailViewModel }) {
  return (
    <section className="app-detail-summary-grid">
      <article className="card app-detail-summary-card">
        <header className="card-header">
          <div>
            <h2 className="card-title">Routing identity</h2>
            <p className="card-description">Permanent values used by public links.</p>
          </div>
          <Badge tone="neutral">Immutable</Badge>
        </header>
        <dl className="app-detail-definition-list">
          <div>
            <dt>App key</dt>
            <dd>
              <code>{app.appKey}</code>
            </dd>
          </div>
          <div>
            <dt>Workspace</dt>
            <dd>{app.workspaceName}</dd>
          </div>
          <div>
            <dt>Native URL scheme</dt>
            <dd>
              {app.nativeScheme ? (
                <code>{app.nativeScheme}://</code>
              ) : (
                <span className="app-detail-empty-value">Backfill required</span>
              )}
            </dd>
          </div>
        </dl>
      </article>

      <article className="card app-detail-summary-card">
        <header className="card-header">
          <div>
            <h2 className="card-title">Safe destinations</h2>
            <p className="card-description">Web and store handoff preview.</p>
          </div>
        </header>
        <dl className="app-detail-definition-list">
          <div>
            <dt>Default web fallback</dt>
            <dd>
              <ExternalValue href={app.fallbackUrl} label={app.fallbackUrl} />
            </dd>
          </div>
          <div>
            <dt>Apple App Store</dt>
            <dd>
              <ExternalValue href={app.appStoreUrl} label="Open listing" />
            </dd>
          </div>
          <div>
            <dt>Google Play</dt>
            <dd>
              <ExternalValue href={app.playStoreUrl} label="Open listing" />
            </dd>
          </div>
        </dl>
      </article>
    </section>
  )
}
