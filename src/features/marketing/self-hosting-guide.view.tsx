import Link from 'next/link'

const productionChecks = [
  'HTTPS reverse proxy or CDN in front of LinksetGo',
  'Private PostgreSQL network and project-specific role',
  'Daily encrypted off-host backups and a restore drill',
  'Readiness, disk, certificate-expiry and real-link monitoring',
  'Edge rate limits for login, resolver and public events',
  'Restricted emergency /cms access',
] as const

export function SelfHostingGuideView() {
  return (
    <main className="marketing-inner">
      <section className="marketing-inner-hero marketing-docs-hero">
        <div className="marketing-container">
          <div className="marketing-pill">Community self-hosting</div>
          <h1>Run LinksetGo and PostgreSQL with generated secrets and committed migrations.</h1>
          <p>
            The Community stack builds from source, migrates once, runs as a non-root read-only
            container and keeps PostgreSQL on an internal network.
          </p>
        </div>
      </section>
      <div className="marketing-container marketing-docs-layout">
        <aside className="marketing-docs-nav">
          <a href="#install">Install</a>
          <a href="#first-owner">First owner</a>
          <a href="#production">Production</a>
          <a href="#backup">Backup and upgrade</a>
          <Link href="/docs">Documentation home</Link>
        </aside>
        <article className="marketing-docs-content">
          <section id="install">
            <p className="marketing-docs-eyebrow">DOCKER COMPOSE</p>
            <h2>Start with one portable command.</h2>
            <pre>
              <code>RELAY_PUBLIC_URL=https://links.example.com ./scripts/setup-community.sh</code>
            </pre>
            <p>
              The helper requires Docker Compose v2 and OpenSSL. It creates a private
              <code> .env.community</code>, generates independent database, Payload and event HMAC
              secrets, validates Compose, applies migrations and starts LinksetGo.
            </p>
            <p>
              For local evaluation, omit <code>RELAY_PUBLIC_URL</code> and use
              <code> http://127.0.0.1:3100</code>.
            </p>
          </section>
          <section id="first-owner">
            <p className="marketing-docs-eyebrow">ONE-TIME BOOTSTRAP</p>
            <h2>Create the first operator only on a fresh database.</h2>
            <p>
              Visit <code>/cms/create-first-user</code> once, then sign in through
              <code> /admin/login</code>. Cloud public signup is disabled in
              <code> RELAY_EDITION=community</code>.
            </p>
          </section>
          <section id="production">
            <p className="marketing-docs-eyebrow">OPERATIONS</p>
            <h2>The container is only one part of production.</h2>
            <ul className="marketing-production-checks">
              {productionChecks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
            <p>
              Preserve the original Host header. Trust a forwarded host only when a known ingress
              overwrites it and the LinksetGo setting is explicitly enabled.
            </p>
          </section>
          <section id="backup">
            <p className="marketing-docs-eyebrow">DATA LIFECYCLE</p>
            <h2>Back up before every upgrade.</h2>
            <pre>
              <code>./scripts/community-backup.sh</code>
            </pre>
            <p>
              Copy the completed dump off-host, encrypt it and test restoration into a disposable
              database. Never run an unreconciled migration against a schema-pushed production
              database.
            </p>
            <Link className="marketing-cta" href="/open-source">
              Review Community Edition
            </Link>
          </section>
        </article>
      </div>
    </main>
  )
}
