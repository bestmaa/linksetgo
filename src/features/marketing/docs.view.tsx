import Link from 'next/link'

const requirements = [
  ['Apple', 'Team ID, Bundle ID, App Store URL and an Associated Domains entitlement.'],
  [
    'Android',
    'Application ID, Play signing SHA-256 fingerprint and an auto-verified intent filter.',
  ],
  ['Routing', 'A list of app destinations such as /offers/:offerId and their required parameters.'],
  ['Fallback', 'An HTTPS website or store destination for users who cannot open the app.'],
] as const

const workflow = [
  [
    '1',
    'Configure the environment',
    'Connect PostgreSQL and set separate application, Payload and event-hashing secrets.',
  ],
  [
    '2',
    'Seed the first administrator',
    'Run the idempotent setup to create the local admin, sample app and sample link.',
  ],
  [
    '3',
    'Register an app',
    'Add only public mobile identifiers. Never upload signing keys, keystores or Apple credentials.',
  ],
  [
    '4',
    'Create and validate links',
    'Map a public slug to a native destination, run Test Lab and scan on a physical device.',
  ],
] as const

export function DocsView() {
  return (
    <main className="marketing-inner">
      <section className="marketing-inner-hero marketing-docs-hero">
        <div className="marketing-container">
          <div className="marketing-pill">LinksetGo documentation</div>
          <h1>Understand the contract before you publish the first link.</h1>
          <p>
            LinksetGo coordinates a public HTTPS domain with app-owned routing. Your mobile team
            keeps every private signing credential.
          </p>
        </div>
      </section>
      <div className="marketing-container marketing-docs-layout">
        <aside className="marketing-docs-nav">
          <a href="#concept">How LinksetGo works</a>
          <a href="#requirements">What teams provide</a>
          <a href="#self-host">Self-hosting</a>
          <a href="#production">Production checklist</a>
        </aside>
        <article className="marketing-docs-content">
          <section id="concept">
            <p className="marketing-docs-eyebrow">CONCEPT</p>
            <h2>Public link in. Typed destination out.</h2>
            <p>
              A shared LinksetGo URL identifies an app and saved link. The public resolver returns a
              safe projection containing the native destination, parameters, store URLs and web
              fallback. Draft, paused, expired or unknown links remain unavailable.
            </p>
            <pre>
              <code>https://example.linksetgo.com/l/sample-app/welcome-offer</code>
            </pre>
            <div className="marketing-doc-flow">
              <span>HTTPS link</span>
              <b>→</b>
              <span>LinksetGo resolver</span>
              <b>→</b>
              <span>App route or fallback</span>
            </div>
          </section>
          <section id="requirements">
            <p className="marketing-docs-eyebrow">ONBOARDING</p>
            <h2>What the mobile team provides</h2>
            <p>
              These are public app identifiers used for platform verification. LinksetGo never needs
              private keys, keystore files or account passwords.
            </p>
            <div className="marketing-requirements">
              {requirements.map(([title, copy]) => (
                <div key={title}>
                  <strong>{title}</strong>
                  <span>{copy}</span>
                </div>
              ))}
            </div>
          </section>
          <section id="self-host">
            <p className="marketing-docs-eyebrow">COMMUNITY EDITION</p>
            <h2>Self-host with PostgreSQL</h2>
            <p>
              LinksetGo runs as one Next.js and Payload deployment backed by a project-specific
              PostgreSQL role. Development can use the guided local setup; production should use
              committed migrations, HTTPS, backups and a reverse proxy or CDN.
            </p>
            <div className="marketing-workflow">
              {workflow.map(([number, title, copy]) => (
                <div key={number}>
                  <span>{number}</span>
                  <p>
                    <strong>{title}</strong>
                    <small>{copy}</small>
                  </p>
                </div>
              ))}
            </div>
            <Link className="marketing-cta" href="/docs/self-hosting">
              Open the self-hosting guide
            </Link>
          </section>
          <section id="production">
            <p className="marketing-docs-eyebrow">BEFORE LAUNCH</p>
            <h2>Verify on real devices</h2>
            <p>
              Platform records can validate configuration, but only installed production builds
              confirm the complete path. Test installed, not-installed, expired, paused and offline
              behavior on physical iOS and Android devices.
            </p>
            <Link className="marketing-cta" href="/docs/react-native">
              Read the React Native guide
            </Link>
            <Link className="marketing-secondary" href="/docs/custom-domains">
              Read the custom-domain guide
            </Link>
          </section>
        </article>
      </div>
    </main>
  )
}
