import type { ServiceStatusViewModel } from './marketing.types'

export function StatusView({ status }: { status: ServiceStatusViewModel }) {
  return (
    <main className="marketing-inner">
      <section className="marketing-inner-hero">
        <div className="marketing-container">
          <div className="marketing-pill">Current service status</div>
          <h1>LinksetGo health without invented uptime claims.</h1>
          <p>
            This page checks the current process and database readiness. Historical uptime will
            appear only after an independent monitor is connected.
          </p>
        </div>
      </section>
      <section className="marketing-container marketing-status-panel">
        <div className={`marketing-status-indicator marketing-status-${status.kind}`}>
          <span aria-hidden="true" />
          <div>
            <h2>{status.label}</h2>
            <p>{status.detail}</p>
          </div>
        </div>
        <div className="marketing-status-components">
          <article>
            <strong>Public resolver and dashboard</strong>
            <span>{status.componentLabel}</span>
          </article>
          <article>
            <strong>PostgreSQL connection</strong>
            <span>{status.componentLabel}</span>
          </article>
        </div>
      </section>
    </main>
  )
}
