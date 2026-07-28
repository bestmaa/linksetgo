import Link from 'next/link'

import { Icon } from '@/components/ui/icon'

import type { PricingPlanViewModel } from './marketing.types'

export function PricingView({ plans }: { plans: readonly PricingPlanViewModel[] }) {
  return (
    <main className="marketing-inner">
      <section className="marketing-inner-hero">
        <div className="marketing-container">
          <div className="marketing-pill">Simple, sustainable pricing</div>
          <h1>Own the code. Pay only when you want the operations handled.</h1>
          <p>
            LinksetGo Community stays self-hostable. These Cloud beta limits are published for
            evaluation; paid service stays closed until its provider, operations and legal gates
            pass.
          </p>
        </div>
      </section>
      <section className="marketing-container marketing-pricing-grid">
        {plans.map((plan) => (
          <article className={`marketing-plan marketing-plan-${plan.slug}`} key={plan.name}>
            <span className="marketing-plan-badge">{plan.badge}</span>
            <h2>{plan.name}</h2>
            <div className="marketing-price">
              <strong>{plan.price}</strong>
              <span>{plan.period}</span>
            </div>
            <p>{plan.description}</p>
            <Link className="marketing-cta marketing-plan-cta" href={plan.href}>
              {plan.cta} <Icon name="arrow" size={15} />
            </Link>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Icon name="check" size={15} /> {feature}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <section className="marketing-container marketing-pricing-note">
        <strong>No link lock-in.</strong>
        <p>
          LinksetGo Community uses documented PostgreSQL storage and a published URL contract. A
          verified Cloud export-and-migration path is a launch gate. Usage limits protect the shared
          service from abuse; they never limit the Community edition you operate yourself.
        </p>
      </section>
    </main>
  )
}
