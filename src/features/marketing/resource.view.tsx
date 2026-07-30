import Link from 'next/link'

import type { MarketingPage } from './marketing.types'

type ResourcePage = Extract<MarketingPage, 'changelog' | 'open-source' | 'security'>

const resourceContent = {
  changelog: {
    eyebrow: 'CHANGELOG',
    intro:
      'LinksetGo is preparing its first Community release. Until versioned releases begin, this page records the product contract without pretending unfinished work has shipped.',
    sections: [
      {
        body: 'Portable self-hosting, health checks, committed migrations, release automation and community policy are implemented. The first tag remains gated on clean migration, container and browser verification plus owner legal approval.',
        title: 'v0.1.0 Community — release candidate',
      },
      {
        body: 'Organizations, isolated workspaces, managed workspace domains, invitations, abuse controls and enforced plan limits are implemented as a provider-neutral foundation. Operations and launch gates still keep registration closed by default.',
        title: 'Cloud foundation — implemented, gated',
      },
      {
        body: 'Billing and verified custom-domain workflows have adapter boundaries, but no payment or certificate provider ships enabled. Paid hosting remains gated on provider integration, final legal terms, ingress automation and restore drills.',
        title: 'Paid hosting — not yet launched',
      },
    ],
    title: 'A release record that separates shipped work from the roadmap.',
  },
  'open-source': {
    eyebrow: 'COMMUNITY EDITION',
    intro:
      'LinksetGo Community is designed to keep the resolver, dashboard and mobile association logic inspectable and portable. You bring PostgreSQL and an HTTPS domain; LinksetGo provides the control plane.',
    sections: [
      {
        body: 'The Community code is distributed under AGPL-3.0-or-later, subject to final project-owner legal approval before the first public release.',
        title: 'Open code with network-use reciprocity',
      },
      {
        body: 'Community installations do not inherit Cloud app, link, member or analytics quotas. Operators control infrastructure capacity and retention.',
        title: 'No artificial self-hosting limits',
      },
      {
        body: 'Issues, pull requests, security reports and documentation improvements follow the policies shipped in the repository.',
        title: 'A contribution path, not a source dump',
      },
    ],
    title: 'Run the same deep-link foundation on infrastructure you control.',
  },
  security: {
    eyebrow: 'SECURITY',
    intro:
      'Deep links sit on a public trust boundary. LinksetGo keeps private configuration authenticated, exposes narrow public projections and refuses arbitrary redirect targets.',
    sections: [
      {
        body: 'Fallback destinations must match app-owned allowlists. Cloud activation also requires exact hostname ownership verification; revocation removes the web fallback without disabling an otherwise active native link.',
        title: 'No open redirects',
      },
      {
        body: 'Apple and Android association files expose only public app identifiers. Signing keys, keystores, passwords and store credentials do not belong in LinksetGo.',
        title: 'Public identifiers only',
      },
      {
        body: 'Report suspected vulnerabilities privately through the repository security policy. Do not include customer secrets or production personal data.',
        title: 'Coordinated disclosure',
      },
    ],
    title: 'Small public responses, explicit trust boundaries.',
  },
} satisfies Record<
  ResourcePage,
  {
    eyebrow: string
    intro: string
    sections: readonly { body: string; title: string }[]
    title: string
  }
>

export function ResourceView({
  page,
  sourceCodeURL,
}: {
  page: ResourcePage
  sourceCodeURL: string | null
}) {
  const content = resourceContent[page]

  return (
    <main className="marketing-inner">
      <section className="marketing-inner-hero marketing-resource-hero">
        <div className="marketing-container">
          <div className="marketing-pill">{content.eyebrow}</div>
          <h1>{content.title}</h1>
          <p>{content.intro}</p>
        </div>
      </section>
      <section className="marketing-container marketing-resource-grid">
        {content.sections.map((section) => (
          <article key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
      <section className="marketing-container marketing-resource-cta">
        <div>
          <strong>Build from the documented contract.</strong>
          <p>Start with the self-hosting guide or inspect the plan and domain model.</p>
        </div>
        <div>
          <Link className="marketing-secondary" href="/docs">
            Read documentation
          </Link>
          {page === 'open-source' && sourceCodeURL ? (
            <a className="marketing-cta" href={sourceCodeURL} rel="noreferrer" target="_blank">
              View source
            </a>
          ) : (
            <Link className="marketing-cta" href="/pricing">
              Compare editions
            </Link>
          )}
        </div>
      </section>
      {page === 'open-source' && !sourceCodeURL ? (
        <p className="marketing-container marketing-resource-source-notice">
          This installation has not configured its public Corresponding Source URL yet.
        </p>
      ) : null}
    </main>
  )
}
