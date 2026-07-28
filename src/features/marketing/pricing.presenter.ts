import { getPlanDefinition, type PlanKey } from '@/lib/domain/plan-catalog'

import type { PricingPlanViewModel } from './marketing.types'

const planPresentation = {
  community: {
    badge: 'Always free',
    cta: 'Read self-hosting guide',
    description: 'For teams that want full ownership of their data and infrastructure.',
    features: [
      'Unlimited self-hosted apps',
      'PostgreSQL storage',
      'AASA and Asset Links',
      'QR and Test Lab',
    ],
    href: '/docs',
    period: 'self-hosted',
  },
  free: {
    badge: 'Try managed Relay',
    cta: 'Join the cloud beta',
    description: 'For one small app that needs a managed shared-domain link service.',
    features: ['1 app', '25 active links', '5k monthly resolves', '7-day analytics'],
    href: '/admin/login',
    period: 'forever',
  },
  pro: {
    badge: 'For growing teams',
    cta: 'Join the cloud beta',
    description: 'For teams ready for their own domain and collaborative operations.',
    features: [
      '10 apps',
      '2,000 active links',
      '100k monthly resolves',
      '1 custom domain and 5 members',
    ],
    href: '/admin/login',
    period: '/ month',
  },
  starter: {
    badge: 'Managed beta',
    cta: 'Join the cloud beta',
    description: 'For small teams that want Relay managed, monitored and kept current.',
    features: ['3 apps', '250 active links', '25k monthly resolves', '2 members'],
    href: '/admin/login',
    period: '/ month',
  },
} as const satisfies Record<PlanKey, Omit<PricingPlanViewModel, 'name' | 'price' | 'slug'>>

const planOrder: readonly PlanKey[] = ['community', 'free', 'starter', 'pro']

export function presentPricingPlans(signupAvailable = false): readonly PricingPlanViewModel[] {
  return planOrder.map((key) => {
    const plan = getPlanDefinition(key)
    const presentation = planPresentation[key]

    return {
      ...presentation,
      ...(key !== 'community'
        ? {
            cta: signupAvailable ? 'Create a workspace' : 'Sign in to Relay Cloud',
            href: signupAvailable ? '/signup' : '/admin/login',
          }
        : {}),
      name: plan.name,
      price:
        plan.priceMonthlyMinor === null
          ? '$0'
          : `$${(plan.priceMonthlyMinor / 100).toLocaleString('en-US')}`,
      slug: key,
    }
  })
}
