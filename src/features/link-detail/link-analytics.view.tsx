import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/load-state'

import type { LinkDetailViewProps } from './link-detail.types'

type AnalyticsProps = Pick<
  LinkDetailViewProps,
  | 'analytics'
  | 'onAnalyticsEventChange'
  | 'onAnalyticsFromChange'
  | 'onAnalyticsPlatformChange'
  | 'onAnalyticsRetry'
  | 'onAnalyticsToChange'
>

function DimensionList({
  label,
  rows,
}: {
  label: string
  rows: LinkDetailViewProps['analytics']['events']
}) {
  return (
    <section className="link-analytics-dimension">
      <h3>{label}</h3>
      {rows.map((row) => (
        <div className="status-row" key={row.id}>
          <span className="status-title">{row.label}</span>
          <strong>{row.count.toLocaleString()}</strong>
        </div>
      ))}
    </section>
  )
}

export function LinkAnalyticsView(props: AnalyticsProps) {
  const analytics = props.analytics
  return (
    <section className="card link-analytics-card">
      <header className="card-header">
        <div>
          <h2 className="card-title">Analytics</h2>
          <p className="card-description">
            Aggregated events only. Session hashes, referrers and user agents are never exposed.
          </p>
        </div>
        {analytics.exportHref ? (
          <a className="button button-secondary" download href={analytics.exportHref}>
            Export CSV
          </a>
        ) : null}
      </header>
      <div className="card-body">
        <div className="link-analytics-filters">
          <label className="form-group">
            <span className="form-label">From</span>
            <input
              className="field"
              onChange={props.onAnalyticsFromChange}
              type="date"
              value={analytics.from}
            />
          </label>
          <label className="form-group">
            <span className="form-label">To</span>
            <input
              className="field"
              onChange={props.onAnalyticsToChange}
              type="date"
              value={analytics.to}
            />
          </label>
          <label className="form-group">
            <span className="form-label">Platform</span>
            <select
              className="field"
              onChange={props.onAnalyticsPlatformChange}
              value={analytics.platform}
            >
              <option value="">All platforms</option>
              <option value="ios">iOS</option>
              <option value="android">Android</option>
              <option value="web">Web</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">Event</span>
            <select
              className="field"
              onChange={props.onAnalyticsEventChange}
              value={analytics.eventType}
            >
              <option value="">All events</option>
              <option value="resolved">Resolved</option>
              <option value="fallback-viewed">Fallback viewed</option>
              <option value="open-app-clicked">Open app clicked</option>
              <option value="store-clicked">Store clicked</option>
              <option value="app-opened">App opened</option>
            </select>
          </label>
        </div>
        <p className="form-help">{analytics.retentionNote}</p>
        {analytics.isLoading ? <p>Loading analytics…</p> : null}
        {analytics.error ? (
          <ErrorState message={analytics.error} onRetry={props.onAnalyticsRetry} />
        ) : null}
        {!analytics.isLoading && !analytics.error && analytics.daily.length === 0 ? (
          <EmptyState
            description="Events will appear after this public link starts receiving traffic."
            title="No events in this range"
          />
        ) : null}
        {!analytics.isLoading && !analytics.error && analytics.daily.length > 0 ? (
          <>
            <div className="link-analytics-total">
              <span>Total events</span>
              <strong>{analytics.totalEvents}</strong>
            </div>
            <div aria-label="Daily link events" className="bar-chart" role="img">
              {analytics.daily.map((point) => (
                <div className="bar-column" key={point.date}>
                  <span className="bar-value">{point.count}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ height: point.height }} />
                  </span>
                  <span className="bar-label">{point.date.slice(5)}</span>
                </div>
              ))}
            </div>
            <div className="link-analytics-dimensions">
              <DimensionList label="Platforms" rows={analytics.platforms} />
              <DimensionList label="Events" rows={analytics.events} />
              <DimensionList label="Hosts" rows={analytics.hosts} />
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
