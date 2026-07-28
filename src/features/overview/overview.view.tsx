import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState, TableSkeleton } from '@/components/ui/load-state'
import { Icon } from '@/components/ui/icon'

import type { OverviewViewProps } from './overview.types'

export function OverviewView(props: OverviewViewProps) {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Command center</p>
          <h1 className="page-title">{props.greeting}</h1>
          <p className="page-copy">Here’s how your deep-link workspace is performing today.</p>
        </div>
        <Button onClick={props.onCreateLink}>
          <span aria-hidden="true">＋</span> Create link
        </Button>
      </header>

      <section aria-label="Workspace metrics" className="metrics-grid">
        {props.metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <div className="metric-head">
              <span>{metric.label}</span>
              <span aria-hidden="true" className="metric-icon">
                <Icon name={metric.icon} />
              </span>
            </div>
            <div className="metric-value">{props.isLoading ? '—' : metric.value}</div>
            <div className="metric-note">{metric.note}</div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="card">
          <header className="card-header">
            <div>
              <h2 className="card-title">Links created</h2>
              <p className="card-description">New link records created over the last 7 days</p>
            </div>
            <Badge tone="blue">Last 7 days</Badge>
          </header>
          <div className="card-body">
            <div
              aria-label="Links created during the last seven days"
              className="bar-chart"
              role="img"
            >
              {props.activity.map((point) => (
                <div className="bar-column" key={point.label}>
                  <span className="bar-value">{point.value}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ height: point.height }} />
                  </span>
                  <span className="bar-label">{point.label}</span>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h2 className="card-title">System health</h2>
              <p className="card-description">Configuration checks</p>
            </div>
          </header>
          <div className="card-body health-list">
            {props.health.map((item) => (
              <div className="status-row" key={item.label}>
                <div className="status-copy">
                  <div className="status-title">{item.label}</div>
                  <div className="status-detail">{item.detail}</div>
                </div>
                <span className={`status-dot status-dot-${item.tone}`} />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <header className="card-header">
          <div>
            <h2 className="card-title">Recent links</h2>
            <p className="card-description">The latest destinations created by your team</p>
          </div>
          <Link className="button button-quiet" href="/admin/links">
            View all →
          </Link>
        </header>
        {props.isLoading ? <TableSkeleton /> : null}
        {props.error ? <ErrorState message={props.error} onRetry={props.onRetry} /> : null}
        {!props.isLoading && !props.error && props.recentLinks.length === 0 ? (
          <EmptyState
            actionLabel="Create your first link"
            description="Create a destination, then test it on a real device from Test Lab."
            onAction={props.onCreateLink}
            title="No links yet"
          />
        ) : null}
        {!props.isLoading && !props.error && props.recentLinks.length > 0 ? (
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Link</th>
                  <th>App</th>
                  <th>Public URL</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {props.recentLinks.map((link) => (
                  <tr key={link.id}>
                    <td className="name-cell">{link.name}</td>
                    <td>{link.app}</td>
                    <td>
                      <a className="link-url truncate" href={link.href}>
                        {link.url}
                      </a>
                    </td>
                    <td>
                      <Badge tone={link.statusTone}>{link.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  )
}
