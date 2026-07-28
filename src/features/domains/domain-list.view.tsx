import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { TableSkeleton } from '@/components/ui/load-state'

import type { DomainRowViewModel } from './domains.types'

type DomainListProps = {
  domains: readonly DomainRowViewModel[]
  isLoading: boolean
  onCreate: () => void
}

export function DomainListView(props: DomainListProps) {
  if (props.isLoading) {
    return (
      <section aria-label="Loading workspace domains" className="card domain-list-panel">
        <TableSkeleton rows={5} />
      </section>
    )
  }

  if (props.domains.length === 0) {
    return (
      <section className="card domain-list-panel">
        <EmptyState
          actionLabel="Register custom domain"
          description="This workspace has no managed or custom hostnames yet."
          onAction={props.onCreate}
          symbol="↗"
          title="No domains configured"
        />
      </section>
    )
  }

  return (
    <section aria-label="Workspace domains" className="card domain-list-panel">
      <header className="domain-panel-header">
        <div>
          <h2>Hostnames</h2>
          <p>Select one to inspect its lifecycle and setup.</p>
        </div>
        <Badge tone="neutral">{props.domains.length}</Badge>
      </header>
      <div className="domain-list">
        {props.domains.map((domain) => (
          <button
            aria-pressed={domain.isSelected}
            className={`domain-list-item ${domain.isSelected ? 'domain-list-item-selected' : ''}`}
            key={domain.id}
            onClick={domain.onSelect}
            type="button"
          >
            <span className="domain-list-item-main">
              <strong>{domain.hostname}</strong>
              <span>{domain.typeLabel}</span>
            </span>
            <span className="domain-list-item-status">
              <Badge tone={domain.statusTone}>{domain.statusLabel}</Badge>
              <code>{domain.status}</code>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
