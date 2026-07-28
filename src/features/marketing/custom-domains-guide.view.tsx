import Link from 'next/link'

const lifecycle = [
  ['Pending DNS', 'Relay has issued exact CNAME and TXT records.'],
  ['Verifying', 'Trusted infrastructure is evaluating DNS evidence.'],
  ['Certificate ready', 'The managed ingress confirms HTTPS certificate readiness.'],
  ['Association incomplete', 'AASA and Asset Links are published for mobile validation.'],
  ['Active', 'New links may use the custom hostname.'],
] as const

export function CustomDomainsGuideView() {
  return (
    <main className="marketing-inner">
      <section className="marketing-inner-hero marketing-docs-hero">
        <div className="marketing-container">
          <div className="marketing-pill">Custom-domain guide</div>
          <h1>Verify ownership, TLS and mobile trust before changing a public hostname.</h1>
          <p>
            Relay keeps the managed workspace URL alive while a Pro workspace proves control of its
            own subdomain and ships the required mobile configuration.
          </p>
        </div>
      </section>
      <div className="marketing-container marketing-docs-layout">
        <aside className="marketing-docs-nav">
          <a href="#records">DNS records</a>
          <a href="#lifecycle">Lifecycle</a>
          <a href="#mobile">Mobile release</a>
          <a href="#safety">Safety model</a>
          <Link href="/docs">Documentation home</Link>
        </aside>
        <article className="marketing-docs-content">
          <section id="records">
            <p className="marketing-docs-eyebrow">DOMAIN OWNERSHIP</p>
            <h2>Relay issues exact records for one hostname.</h2>
            <p>
              A custom hostname such as <code>links.oberoimall.com</code> receives a unique TXT
              ownership challenge and a CNAME target configured by the Relay Cloud ingress.
            </p>
            <pre>
              <code>_relay-verification.links.oberoimall.com TXT relay-domain-verification=…</code>
            </pre>
            <pre>
              <code>links.oberoimall.com CNAME ingress.relay.example</code>
            </pre>
            <p>
              After publishing both records, use <strong>Check DNS &amp; TLS</strong> in the Domains
              console. Relay sends only the normalized hostname to its trusted operator adapter,
              validates returned evidence against the server-issued challenge, and never fetches a
              customer-supplied URL.
            </p>
          </section>
          <section id="lifecycle">
            <p className="marketing-docs-eyebrow">ACTIVATION</p>
            <h2>Every trust boundary has an explicit state.</h2>
            <div className="marketing-domain-lifecycle">
              {lifecycle.map(([status, explanation], index) => (
                <div key={status}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <p>
                    <strong>{status}</strong>
                    <small>{explanation}</small>
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section id="mobile">
            <p className="marketing-docs-eyebrow">APP RELEASE REQUIRED</p>
            <h2>A DNS change cannot update an installed app.</h2>
            <p>
              The iOS team adds <code>applinks:links.oberoimall.com</code> to Associated Domains.
              The Android team adds the same exact host to an auto-verified intent filter. Test
              release-signed builds before Relay activates the domain.
            </p>
            <p>
              Existing app versions that do not trust the custom hostname will use the safe web
              fallback. The managed workspace URL remains available throughout onboarding.
            </p>
            <p>
              The final console action is owner-only and requires typing the exact hostname plus an
              explicit released-build acknowledgement.
            </p>
          </section>
          <section id="safety">
            <p className="marketing-docs-eyebrow">FAIL CLOSED</p>
            <h2>Unknown hosts never inherit another workspace.</h2>
            <p>
              Relay exact-matches an active domain to one workspace. Host-scoped AASA and Asset
              Links responses contain only that workspace’s apps. Forwarded hosts are ignored unless
              the deployment explicitly trusts a sanitizing ingress.
            </p>
            <Link className="marketing-cta" href="/pricing">
              Compare domain plans
            </Link>
          </section>
        </article>
      </div>
    </main>
  )
}
