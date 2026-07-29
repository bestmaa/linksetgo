import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { ErrorState, TableSkeleton } from '@/components/ui/load-state'

import type { AppsViewProps } from './apps.types'

export function AppsView(props: AppsViewProps) {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Mobile products</p>
          <h1 className="page-title">Apps</h1>
          <p className="page-copy">Configure the mobile apps that receive your deep links.</p>
        </div>
        <Button onClick={props.onCreate}>
          <Icon name="plus" /> Add app
        </Button>
      </header>
      <div className="toolbar">
        <input
          aria-label="Search apps"
          className="search-field"
          onChange={props.onSearchChange}
          placeholder="Search by app name or key…"
          value={props.search}
        />
        <Badge tone="neutral">{props.apps.length} apps</Badge>
      </div>

      {props.isLoading ? (
        <div className="card">
          <TableSkeleton rows={5} />
        </div>
      ) : null}
      {props.error ? (
        <div className="card">
          <ErrorState message={props.error} onRetry={props.onRetry} />
        </div>
      ) : null}
      {!props.isLoading && !props.error && props.apps.length === 0 ? (
        <div className="card">
          <EmptyState
            actionLabel="Add your first app"
            description="Connect an iOS app, Android app, or both. LinksetGo will generate the association configuration."
            onAction={props.onCreate}
            symbol="▦"
            title={props.search ? 'No matching apps' : 'No apps connected'}
          />
        </div>
      ) : null}
      {!props.isLoading && !props.error && props.apps.length > 0 ? (
        <section aria-label="Connected apps" className="apps-grid">
          {props.apps.map((app) => (
            <article className="card app-card" key={app.id}>
              <div className="app-title-row">
                <span className="app-avatar">{app.initials}</span>
                <div style={{ minWidth: 0 }}>
                  <h3>{app.name}</h3>
                  <span className="app-slug">{app.slug}</span>
                </div>
                <span style={{ marginLeft: 'auto' }}>
                  <Badge tone={app.statusTone}>{app.status}</Badge>
                </span>
              </div>
              <p className="app-description">{app.description}</p>
              <div className="app-card-footer">
                <span className="platforms">
                  {app.platforms.length > 0
                    ? app.platforms.map((platform) => (
                        <Badge key={platform} tone="blue">
                          {platform}
                        </Badge>
                      ))
                    : 'Platforms not configured'}
                </span>
                <Link href={app.href}>{app.linkCountLabel} →</Link>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  )
}
