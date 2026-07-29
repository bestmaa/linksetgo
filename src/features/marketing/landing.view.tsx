import Link from 'next/link'

import { Icon } from '@/components/ui/icon'

import type { MarketingActionViewModel } from './marketing.types'

const capabilities = [
  {
    eyebrow: 'Own the route',
    title: 'One HTTPS link, every destination',
    copy: 'Resolve users into iOS, Android, the right store or a safe web fallback without rebuilding a landing site.',
  },
  {
    eyebrow: 'Ship with confidence',
    title: 'Association files generated for you',
    copy: 'Publish scoped Apple AASA and Android Asset Links records from the app identities your team controls.',
  },
  {
    eyebrow: 'Debug before launch',
    title: 'A Test Lab built into operations',
    copy: 'Validate the public URL, saved destination, platform association and fallback before a campaign goes live.',
  },
  {
    eyebrow: 'Hand off anywhere',
    title: 'QR codes and copy-ready URLs',
    copy: 'Move a link from campaign planning to a real device in seconds, with no special dashboard knowledge.',
  },
  {
    eyebrow: 'Stay safe',
    title: 'Private records, public projections',
    copy: 'Keep app configuration behind authentication while public resolvers expose only the fields a device needs.',
  },
  {
    eyebrow: 'Choose your operation',
    title: 'Self-host or let LinksetGo run it',
    copy: 'Use the open Community product on your infrastructure. Managed hosting stays gated until the Cloud beta is operationally ready.',
  },
] as const

const steps = [
  ['01', 'Register the app', 'Add the identifiers your iOS and Android teams already own.'],
  ['02', 'Create a destination', 'Map a memorable public slug to a precise route and parameters.'],
  ['03', 'Validate and share', 'Run checks, scan the QR code and publish with confidence.'],
] as const

export function LandingView({ primaryAction }: { primaryAction: MarketingActionViewModel }) {
  return (
    <main>
      <section className="marketing-hero">
        <div className="marketing-container marketing-hero-grid">
          <div className="marketing-hero-copy">
            <div className="marketing-pill">
              <span className="marketing-live-dot" />
              Open-source deep-link infrastructure
            </div>
            <h1>Every mobile link, under your control.</h1>
            <p>
              LinksetGo gives product and mobile teams one clear place to create, validate and
              operate Universal Links and Android App Links.
            </p>
            <div className="marketing-actions">
              <Link className="marketing-cta marketing-cta-large" href={primaryAction.href}>
                {primaryAction.label} <Icon name="arrow" />
              </Link>
              <Link className="marketing-secondary" href="/docs">
                Read the self-hosting guide
              </Link>
            </div>
            <div className="marketing-proof">
              <span>
                <Icon name="check" size={15} /> AASA
              </span>
              <span>
                <Icon name="check" size={15} /> Asset Links
              </span>
              <span>
                <Icon name="check" size={15} /> Safe fallback
              </span>
              <span>
                <Icon name="check" size={15} /> QR handoff
              </span>
            </div>
          </div>
          <div aria-label="LinksetGo link resolution preview" className="marketing-product-visual">
            <div className="visual-glow" />
            <div className="visual-window">
              <div className="visual-window-bar">
                <span className="visual-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>LinksetGo resolver</span>
                <span className="visual-status">Live</span>
              </div>
              <div className="visual-url">example.linksetgo.com/l/sample-app/welcome-offer</div>
              <div className="visual-flow">
                <div className="visual-source">
                  <small>INCOMING</small>
                  <strong>Summer offer</strong>
                  <span>campaign=monsoon</span>
                </div>
                <span className="visual-arrow">→</span>
                <div className="visual-destinations">
                  <div>
                    <span className="visual-icon">iOS</span>
                    <p>
                      <strong>/offers/summer</strong>
                      <small>Universal Link verified</small>
                    </p>
                    <span className="visual-check">✓</span>
                  </div>
                  <div>
                    <span className="visual-icon visual-icon-android">A</span>
                    <p>
                      <strong>/offers/summer</strong>
                      <small>App Link verified</small>
                    </p>
                    <span className="visual-check">✓</span>
                  </div>
                  <div>
                    <span className="visual-icon visual-icon-web">W</span>
                    <p>
                      <strong>Safe web fallback</strong>
                      <small>Allowlisted destination</small>
                    </p>
                    <span className="visual-check">✓</span>
                  </div>
                </div>
              </div>
              <div className="visual-footer">
                <span>5 checks passed</span>
                <strong>Ready to share</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-strip">
        <div className="marketing-container">
          <span>Built for</span>
          <strong>React Native</strong>
          <strong>iOS</strong>
          <strong>Android</strong>
          <strong>Product teams</strong>
          <strong>Agencies</strong>
        </div>
      </section>

      <section className="marketing-section" id="product">
        <div className="marketing-container">
          <header className="marketing-section-heading">
            <p>THE CONTROL PLANE</p>
            <h2>Everything required to operate links. Nothing hidden in a black box.</h2>
            <span>
              Keep the infrastructure inspectable, the public response small and every destination
              easy to test.
            </span>
          </header>
          <div className="marketing-feature-grid">
            {capabilities.map((capability, index) => (
              <article className="marketing-feature-card" key={capability.title}>
                <span className="marketing-feature-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p>{capability.eyebrow}</p>
                <h3>{capability.title}</h3>
                <span>{capability.copy}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-how">
        <div className="marketing-container marketing-how-grid">
          <header className="marketing-section-heading marketing-section-heading-left">
            <p>FROM CONFIG TO CAMPAIGN</p>
            <h2>Go from mobile routes to a tested public link in three steps.</h2>
            <Link className="marketing-text-link" href="/docs">
              See the integration contract <Icon name="arrow" size={15} />
            </Link>
          </header>
          <div className="marketing-step-list">
            {steps.map(([number, title, copy]) => (
              <article key={number}>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-open">
        <div className="marketing-container marketing-open-card">
          <div>
            <p>OPEN BY DESIGN</p>
            <h2>Your links should outlive any vendor.</h2>
            <span>
              Run LinksetGo Community on your own PostgreSQL infrastructure. LinksetGo Cloud is the
              managed path once its operational and legal launch gates are complete.
            </span>
          </div>
          <div className="marketing-open-actions">
            <Link className="marketing-cta marketing-cta-light" href="/docs">
              Self-host LinksetGo <Icon name="arrow" />
            </Link>
            <Link className="marketing-secondary marketing-secondary-dark" href="/pricing">
              Compare plans
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
