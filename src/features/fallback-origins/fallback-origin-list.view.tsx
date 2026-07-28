import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { TableSkeleton } from '@/components/ui/load-state'

import type { FallbackOriginRowViewModel } from './fallback-origins.types'

export function FallbackOriginListView(props: {
  isLoading: boolean
  onCreate: () => void
  origins: readonly FallbackOriginRowViewModel[]
}) {
  if (props.isLoading) {
    return (
      <section aria-label="Loading fallback origins" className="card domain-list-panel">
        <TableSkeleton rows={5} />
      </section>
    )
  }
  if (props.origins.length === 0) {
    return (
      <section className="card domain-list-panel">
        <EmptyState
          actionLabel="Register fallback origin"
          description="Register the hostname used by your app's HTTPS fallback URL."
          onAction={props.onCreate}
          symbol="↗"
          title="No fallback origins"
        />
      </section>
    )
  }
  return (
    <section aria-label="Workspace fallback origins" className="card domain-list-panel">
      <header className="domain-panel-header">
        <div>
          <h2>Allowed origins</h2>
          <p>Cloud apps can activate only after every fallback hostname is verified.</p>
        </div>
        <Badge tone="neutral">{props.origins.length}</Badge>
      </header>
      <div className="domain-list">
        {props.origins.map((origin) => (
          <button
            aria-pressed={origin.isSelected}
            className={`domain-list-item ${origin.isSelected ? 'domain-list-item-selected' : ''}`}
            key={origin.id}
            onClick={origin.onSelect}
            type="button"
          >
            <span className="domain-list-item-main">
              <strong>{origin.hostname}</strong>
              <span>Last checked: {origin.lastCheckedLabel}</span>
            </span>
            <span className="domain-list-item-status">
              <Badge tone={origin.statusTone}>{origin.statusLabel}</Badge>
              <code>{origin.status}</code>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
