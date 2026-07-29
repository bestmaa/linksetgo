import Link from 'next/link'

const appFields = [
  ['Native scheme', 'The scheme before ://, for example sampleapp.'],
  ['iOS Bundle ID', 'The Xcode target identifier, for example com.example.sampleapp.'],
  ['Apple Team ID', 'The 10-character public Apple Developer Team ID.'],
  ['Android package', 'The Android applicationId, for example com.example.sampleapp.'],
  ['SHA-256 fingerprint', 'The public Play App Signing certificate fingerprint.'],
  ['Web fallback', 'A customer-owned HTTPS page for users who cannot open the app.'],
] as const

export function ReactNativeGuideView() {
  return (
    <main className="marketing-inner">
      <section className="marketing-inner-hero marketing-docs-hero">
        <div className="marketing-container">
          <div className="marketing-pill">React Native guide</div>
          <h1>Turn the routes your mobile team already has into durable HTTPS links.</h1>
          <p>
            LinksetGo accepts a custom-scheme destination, stores its path and scalar parameters,
            then produces a shareable link for Universal Links and Android App Links.
          </p>
        </div>
      </section>
      <div className="marketing-container marketing-docs-layout">
        <aside className="marketing-docs-nav">
          <a href="#two-urls">Two URL roles</a>
          <a href="#import">Import a route</a>
          <a href="#resolve">Resolve in the app</a>
          <a href="#identifiers">App identifiers</a>
          <a href="#verify">Verify releases</a>
          <Link href="/docs">Documentation home</Link>
        </aside>
        <article className="marketing-docs-content">
          <section id="two-urls">
            <p className="marketing-docs-eyebrow">THE CONTRACT</p>
            <h2>Native destinations and public links are different.</h2>
            <p>
              A React Native URL names a screen inside an installed app. A LinksetGo HTTPS URL is
              the campaign-safe link a customer receives.
            </p>
            <div className="marketing-code-pair">
              <div>
                <small>MOBILE TEAM PROVIDES</small>
                <code>sampleapp://welcome</code>
              </div>
              <div>
                <small>LINKSETGO PUBLISHES</small>
                <code>https://example.linksetgo.com/l/sample-app/welcome-offer</code>
              </div>
            </div>
          </section>
          <section id="import">
            <p className="marketing-docs-eyebrow">ROUTE IMPORT</p>
            <h2>Paste the URL instead of translating it by hand.</h2>
            <pre>
              <code>sampleapp://membership-detail?level=gold&amp;promo=10OFF</code>
            </pre>
            <div className="marketing-import-result">
              <span>
                <small>Destination</small>
                <strong>/membership-detail</strong>
              </span>
              <span>
                <small>Parameter</small>
                <strong>level = gold</strong>
              </span>
              <span>
                <small>Parameter</small>
                <strong>promo = 10OFF</strong>
              </span>
            </div>
            <p>
              The app still validates parameters and owns navigation. LinksetGo rejects credentials,
              dangerous protocols, malformed paths and unsupported nested values.
            </p>
          </section>
          <section id="resolve">
            <p className="marketing-docs-eyebrow">MOBILE HANDOFF</p>
            <h2>Resolve the campaign slug, then navigate.</h2>
            <p>
              iOS and Android open the public <code>/l/app/campaign</code> path. Your app calls
              LinksetGo&apos;s host-scoped public resolver, validates the returned destination and
              scalar parameters, then passes that app-known route to React Navigation.
            </p>
            <pre>
              <code>
                GET /api/public/links/sample-app/welcome-offer{'\n'}→ /membership-detail?level=gold
              </code>
            </pre>
            <p>
              The operating system does not rewrite campaign slugs automatically. Offline, expired,
              or unknown results should open a safe unavailable-link screen.
            </p>
            <p>
              Once navigation accepts the validated route, the app can send a best-effort{' '}
              <code>app-opened</code> acknowledgement. It is approximate analytics and must never
              delay navigation or be treated as proof of a real open.
            </p>
          </section>
          <section id="identifiers">
            <p className="marketing-docs-eyebrow">APP REGISTRATION</p>
            <h2>Ask for public identifiers, never signing secrets.</h2>
            <div className="marketing-requirements">
              {appFields.map(([title, copy]) => (
                <div key={title}>
                  <strong>{title}</strong>
                  <span>{copy}</span>
                </div>
              ))}
            </div>
            <p>
              LinksetGo never needs an Apple private key, Android keystore, signing password or
              store account credential.
            </p>
          </section>
          <section id="verify">
            <p className="marketing-docs-eyebrow">BEFORE CAMPAIGN LAUNCH</p>
            <h2>Configuration checks are the start of testing.</h2>
            <p>
              Run LinksetGo Test Lab, inspect the host-specific AASA and Asset Links files, scan the
              QR code, then test release-signed builds on physical iOS and Android devices with the
              app installed and removed.
            </p>
            <Link className="marketing-cta" href="/admin/test-lab">
              Open Test Lab
            </Link>
          </section>
        </article>
      </div>
    </main>
  )
}
