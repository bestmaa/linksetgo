import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { SettingsViewProps } from './settings.types'

export function SettingsView(props: SettingsViewProps) {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace preferences</p>
          <h1 className="page-title">Settings</h1>
          <p className="page-copy">Review shared infrastructure, access and routing defaults.</p>
        </div>
      </header>
      <section className="settings-grid">
        <nav aria-label="Settings sections" className="card settings-nav">
          {props.tabs.map((tab) => (
            <button
              aria-current={tab.active ? 'page' : undefined}
              className={`settings-tab ${tab.active ? 'settings-tab-active' : ''}`}
              key={tab.id}
              onClick={tab.onSelect}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="card">
          {props.activeTab === 'general' ? (
            <>
              <section className="setting-section">
                <h3>Workspace</h3>
                <p>Defaults applied when your team creates new links.</p>
                <div className="settings-list">
                  <div className="status-row">
                    <span className="status-copy">
                      <span className="status-title">Environment</span>
                      <span className="status-detail">Current runtime workspace</span>
                    </span>
                    <Badge tone="blue">{props.environment}</Badge>
                  </div>
                  <div className="status-row">
                    <span className="status-copy">
                      <span className="status-title">New link status</span>
                      <span className="status-detail">Links are immediately ready to resolve</span>
                    </span>
                    <Badge tone="success">Active</Badge>
                  </div>
                  <div className="status-row">
                    <span className="status-copy">
                      <span className="status-title">Fallback policy</span>
                      <span className="status-detail">Use link fallback, then the app default</span>
                    </span>
                    <Badge tone="neutral">Inherited</Badge>
                  </div>
                </div>
              </section>
              <section className="setting-section">
                <h3>Plan and usage</h3>
                <p>Server-enforced limits for the selected workspace organization.</p>
                {props.isBillingLoading ? <p>Loading plan usage…</p> : null}
                {props.billingError ? <p role="alert">{props.billingError}</p> : null}
                {props.billingSummary ? (
                  <div className="settings-list">
                    <div className="status-row">
                      <span className="status-copy">
                        <span className="status-title">{props.billingSummary.plan.name}</span>
                        <span className="status-detail">
                          {props.billingSummary.edition === 'community'
                            ? 'Self-hosted resources are unlimited'
                            : `Subscription ${props.billingSummary.subscription?.status ?? 'free'}`}
                        </span>
                      </span>
                      <Badge tone={props.billingSummary.access.canCreate ? 'success' : 'warning'}>
                        {props.billingSummary.access.canCreate ? 'Active' : 'Restricted'}
                      </Badge>
                    </div>
                    <div className="status-row">
                      <span className="status-copy">
                        <span className="status-title">Monthly tracked resolutions</span>
                        <span className="status-detail">
                          Detailed analytics stop at the plan threshold; links keep resolving
                        </span>
                      </span>
                      <Badge
                        tone={
                          props.billingSummary.usage.monthlyResolutions.kind === 'blocked' ||
                          props.billingSummary.usage.monthlyResolutions.kind === 'warning'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {props.billingSummary.usage.monthlyResolutions.used} /{' '}
                        {props.billingSummary.usage.monthlyResolutions.limit}
                      </Badge>
                    </div>
                    {props.billingSummary.edition === 'cloud' ? (
                      <div className="status-row">
                        <span className="status-copy">
                          <span className="status-title">Upgrade capacity</span>
                          <span className="status-detail">
                            Checkout is external; entitlement changes only after a verified webhook.
                          </span>
                        </span>
                        <span className="field-row">
                          <Button
                            disabled={!props.canCheckout || props.isCheckoutLoading}
                            onClick={() => props.onCheckout('starter')}
                            variant="secondary"
                          >
                            Starter · $5
                          </Button>
                          <Button
                            disabled={!props.canCheckout || props.isCheckoutLoading}
                            onClick={() => props.onCheckout('pro')}
                          >
                            Pro · $10
                          </Button>
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {props.checkoutError ? <p role="alert">{props.checkoutError}</p> : null}
                {props.billingSummary?.edition === 'cloud' && !props.canCheckout ? (
                  <p className="form-help">Only an organization owner or admin can change plans.</p>
                ) : null}
              </section>
            </>
          ) : null}

          {props.activeTab === 'domain' ? (
            <>
              <section className="setting-section">
                <h3>Shared link domain</h3>
                <p>All public links and platform association files are served from this origin.</p>
                <div className="setting-value">{props.domain}</div>
                <div className="field-row" style={{ gap: 8, marginTop: 12 }}>
                  <Button onClick={props.onCopyDomain} variant="secondary">
                    <Icon name="copy" /> Copy domain
                  </Button>
                  <Button
                    disabled={props.verificationStatus === 'checking'}
                    onClick={props.onVerify}
                  >
                    <Icon name="refresh" />
                    {props.verificationStatus === 'checking' ? 'Checking…' : 'Verify again'}
                  </Button>
                </div>
              </section>
              <section className="setting-section">
                <h3>Association status</h3>
                <p>{props.verificationDetail}</p>
                <div className="status-row">
                  <span className="status-title">Apple + Android</span>
                  <Badge
                    tone={
                      props.verificationStatus === 'verified'
                        ? 'success'
                        : props.verificationStatus === 'attention'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {props.verificationStatus}
                  </Badge>
                </div>
              </section>
            </>
          ) : null}

          {props.activeTab === 'team' ? (
            <section className="setting-section">
              <h3>Team & access</h3>
              <p>
                Invite teammates, assign organization roles, and revoke access from the LinksetGo
                team console.
              </p>
              <div className="status-row">
                <span className="status-copy">
                  <span className="status-title">{props.userEmail}</span>
                  <span className="status-detail">Current signed-in user</span>
                </span>
                <Badge tone="blue">{props.userRole}</Badge>
              </div>
              <div style={{ marginTop: 18 }}>
                <Button onClick={props.onOpenTeam}>
                  Manage team access <Icon name="arrow" />
                </Button>
              </div>
            </section>
          ) : null}

          {props.activeTab === 'system' ? (
            <section className="setting-section">
              <h3>System connection</h3>
              <p>Read-only status for the shared development infrastructure.</p>
              <div className="settings-list">
                <div className="status-row">
                  <span className="status-copy">
                    <span className="status-title">Payload REST API</span>
                    <span className="status-detail">Apps, links and authentication</span>
                  </span>
                  <Badge tone={props.apiStatus === 'Connected' ? 'success' : 'warning'}>
                    {props.apiStatus}
                  </Badge>
                </div>
                <div className="status-row">
                  <span className="status-copy">
                    <span className="status-title">PostgreSQL</span>
                    <span className="status-detail">{props.databaseLabel}</span>
                  </span>
                  <Badge tone={props.apiStatus === 'Connected' ? 'success' : 'warning'}>
                    {props.apiStatus}
                  </Badge>
                </div>
                <div className="status-row">
                  <span className="status-copy">
                    <span className="status-title">Configured apps</span>
                    <span className="status-detail">Records using this database</span>
                  </span>
                  <Badge tone="neutral">{props.appCount}</Badge>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </section>
      {props.toast ? (
        <div aria-live="polite" className="toast-region">
          <div className="toast">
            <Icon name="check" />
            {props.toast}
          </div>
        </div>
      ) : null}
    </main>
  )
}
