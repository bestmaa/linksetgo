import Link from 'next/link'

import { BrandMark } from '@/components/ui/brand-mark'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { ErrorState, TableSkeleton } from '@/components/ui/load-state'

import type { ShellViewProps } from './shell.types'

export function ShellView(props: ShellViewProps) {
  if (props.authError) {
    return (
      <main className="fallback-page">
        <div className="card">
          <ErrorState message={props.authError} onRetry={props.onRetryAuth} />
        </div>
      </main>
    )
  }

  if (!props.isReady) {
    return (
      <main className="fallback-page">
        <div aria-label="Checking your session" className="card" style={{ width: 420 }}>
          <TableSkeleton rows={4} />
        </div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <div
        aria-hidden="true"
        className={`overlay ${props.isMobileMenuOpen ? 'overlay-visible' : ''}`}
        onClick={props.onCloseMobileMenu}
      />
      <aside className={`sidebar ${props.isMobileMenuOpen ? 'sidebar-open' : ''}`}>
        <Link className="brand" href="/admin">
          <BrandMark />
          <span className="brand-copy">
            <span className="brand-name">LinksetGo</span>
            <span className="brand-caption">DEEP LINKS, DONE RIGHT</span>
          </span>
        </Link>
        <p className="nav-label">Workspace</p>
        <nav aria-label="Primary navigation" className="primary-nav">
          {props.navigation.map((item) => (
            <Link
              aria-current={item.active ? 'page' : undefined}
              className={`nav-link ${item.active ? 'nav-link-active' : ''}`}
              href={item.href}
              key={item.href}
              onClick={item.onNavigate}
              title={item.label}
            >
              <span aria-hidden="true" className="nav-icon">
                <Icon name={item.icon} />
              </span>
              <span className="nav-text">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment-card">
            <div className="environment-row">
              <span>PostgreSQL</span>
              <span className="health-dot" />
            </div>
            <div className="environment-name">{props.environment}</div>
          </div>
          <div className="user-card">
            <span className="avatar">{props.userInitials}</span>
            <span className="user-copy">
              <span className="user-name">{props.userName}</span>
              <span className="user-email">{props.userEmail}</span>
            </span>
            <button
              aria-label="Sign out"
              className="button button-quiet"
              onClick={props.onLogout}
              title="Sign out"
              type="button"
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button
            aria-label="Open navigation"
            className="icon-button mobile-menu-button"
            onClick={props.onToggleMobileMenu}
            type="button"
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            LinksetGo&nbsp; / &nbsp;<strong>{props.currentPage}</strong>
          </div>
          <div className="workspace-picker">
            <label className="sr-only" htmlFor="workspace-selector">
              Active workspace
            </label>
            <select
              aria-label="Active workspace"
              className="workspace-select"
              disabled={props.workspaceOptions.length < 2}
              id="workspace-selector"
              onChange={props.onWorkspaceChange}
              value={props.selectedWorkspaceId}
            >
              {props.workspaceOptions.length === 0 ? (
                <option value="">No workspace available</option>
              ) : null}
              {props.workspaceOptions.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.label}
                </option>
              ))}
            </select>
            {props.workspaceSlug ? (
              <span className="workspace-picker-meta">
                {props.workspaceSlug} · {props.workspaceRole}
              </span>
            ) : null}
          </div>
          <span className="topbar-spacer" />
          <form className="search-shell" onSubmit={props.onSearchSubmit} role="search">
            <label className="sr-only" htmlFor="global-search">
              Search apps or links
            </label>
            <input
              className="search-input"
              id="global-search"
              onChange={props.onSearchChange}
              placeholder="Search apps or links…"
              value={props.search}
            />
          </form>
          <Button aria-label="Create link" onClick={props.onCreateLink}>
            <Icon name="plus" />
            <span className="topbar-create-label">Create link</span>
          </Button>
        </header>
        {props.children}
      </div>
    </div>
  )
}
