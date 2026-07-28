import Link from 'next/link'

export function SponsorView({ sponsorURL }: { sponsorURL: string | null }) {
  return (
    <main className="marketing-inner">
      <section className="marketing-inner-hero">
        <div className="marketing-container">
          <div className="marketing-pill">Support LinksetGo</div>
          <h1>Help keep open deep-link infrastructure maintained.</h1>
          <p>
            Sponsorship supports security updates, documentation, release engineering and the
            Community edition. It never unlocks hidden self-hosting limits.
          </p>
          <div className="marketing-actions marketing-actions-centered">
            {sponsorURL ? (
              <a
                className="marketing-cta marketing-cta-large"
                href={sponsorURL}
                rel="noreferrer"
                target="_blank"
              >
                Sponsor LinksetGo
              </a>
            ) : (
              <span className="marketing-sponsor-pending">
                Sponsorship is not configured for this installation yet.
              </span>
            )}
            <Link className="marketing-secondary" href="/open-source">
              Explore Community Edition
            </Link>
          </div>
        </div>
      </section>
      <section className="marketing-container marketing-sponsor-principles">
        <article>
          <strong>Transparent purpose</strong>
          <p>Funding is for maintenance, infrastructure and community support.</p>
        </article>
        <article>
          <strong>No feature hostage-taking</strong>
          <p>Core self-hosted link operations remain part of Community Edition.</p>
        </article>
        <article>
          <strong>Optional by design</strong>
          <p>Self-hosted operators can remove the sponsor URL by leaving configuration empty.</p>
        </article>
      </section>
    </main>
  )
}
