import { Badge } from '@/components/ui/badge'

import type { PlatformReadinessViewModel } from './app-detail.types'

function PlatformCard({ platform }: { platform: PlatformReadinessViewModel }) {
  return (
    <article className="card app-detail-readiness-card">
      <header>
        <div>
          <h2>{platform.label}</h2>
          <p>{platform.description}</p>
        </div>
        <Badge tone={platform.complete ? 'success' : 'warning'}>
          {platform.complete ? 'Ready' : 'Needs setup'}
        </Badge>
      </header>
      <dl>
        {platform.values.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>
              <span
                aria-hidden="true"
                className={`app-detail-value-dot app-detail-value-${item.state}`}
              />
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {platform.remediation.length > 0 ? (
        <div className="app-detail-remediation">
          <strong>Complete this platform</strong>
          <ul>
            {platform.remediation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

export function AppDetailReadinessView({
  android,
  ios,
}: {
  android: PlatformReadinessViewModel
  ios: PlatformReadinessViewModel
}) {
  return (
    <section aria-label="Platform readiness" className="app-detail-readiness-grid">
      <PlatformCard platform={ios} />
      <PlatformCard platform={android} />
    </section>
  )
}
