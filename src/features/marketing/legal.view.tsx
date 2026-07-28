import type { MarketingPage } from './marketing.types'

type LegalPage = Extract<MarketingPage, 'privacy' | 'terms'>

const legalContent = {
  privacy: {
    intro:
      'This pre-launch notice documents what the current code stores. A Cloud operator must add its legal entity, contact, subprocessors, regions and exact retention schedule before public registration.',
    sections: [
      {
        body: 'LinksetGo stores account name and email, organization and app configuration, saved destinations, verification results and authenticated audit-relevant timestamps in the operator’s PostgreSQL database.',
        title: 'Account and configuration data',
      },
      {
        body: 'Link events can store platform, referrer origin and a secret-keyed HMAC session identifier. New events do not persist raw client IP addresses or raw user-agent strings in LinksetGo application data.',
        title: 'Resolution analytics',
      },
      {
        body: 'Community operators control their database, logs, backups, retention, access requests and deletion process. Cloud retention follows the selected plan and applicable legal obligations.',
        title: 'Operator responsibility and retention',
      },
      {
        body: 'LinksetGo does not include third-party advertising trackers. Infrastructure providers may process network metadata; a hosted operator must disclose those subprocessors before launch.',
        title: 'External processing',
      },
    ],
    title: 'Privacy, described from the data model outward.',
  },
  terms: {
    intro:
      'These are product principles and launch requirements, not final hosted-service terms. Counsel and the project owner must approve jurisdiction-specific terms before paid or public Cloud access.',
    sections: [
      {
        body: 'Community source is offered under AGPL-3.0-or-later. The software license, NOTICE and trademark policy govern self-hosted use and redistribution.',
        title: 'Community software',
      },
      {
        body: 'Customers must control the apps, domains, store listings and fallback destinations they configure. LinksetGo may suspend phishing, malware, impersonation or unlawful use.',
        title: 'Acceptable use',
      },
      {
        body: 'Beta prices, quotas, billing periods, cancellation, refunds, taxes and grace behavior must be presented before checkout and reconciled from signed provider events.',
        title: 'Hosted billing',
      },
      {
        body: 'No uptime promise or service-level agreement is advertised during beta. Backup, incident, liability and support commitments require final service terms.',
        title: 'Service commitments',
      },
    ],
    title: 'Clear operating rules before accepting public customers.',
  },
} satisfies Record<
  LegalPage,
  {
    intro: string
    sections: readonly { body: string; title: string }[]
    title: string
  }
>

export function LegalView({ page }: { page: LegalPage }) {
  const content = legalContent[page]

  return (
    <main className="marketing-inner">
      <section className="marketing-inner-hero marketing-resource-hero">
        <div className="marketing-container">
          <div className="marketing-pill">Pre-launch policy draft</div>
          <h1>{content.title}</h1>
          <p>{content.intro}</p>
        </div>
      </section>
      <section className="marketing-container marketing-legal-content">
        <div className="marketing-legal-warning">
          This draft is a release gate, not final legal advice or a customer agreement.
        </div>
        {content.sections.map((section) => (
          <article key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
