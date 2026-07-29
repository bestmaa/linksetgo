import { getPlanDefinition, type PlanDefinition, type PlanKey } from '@/lib/domain/plan-catalog'

import type { PricingPlanViewModel } from './marketing.types'

const planPresentation = {
  community: {
    badge: 'Always free',
    cta: 'Read self-hosting guide',
    description: 'For teams that want full ownership of their data and infrastructure.',
    href: '/docs',
    period: 'self-hosted',
  },
  free: {
    badge: 'Try LinksetGo Cloud',
    cta: 'Join the cloud beta',
    description: 'For one small app that needs a managed shared-domain link service.',
    href: '/admin/login',
    period: 'forever',
  },
  pro: {
    badge: 'For growing teams',
    cta: 'Join the cloud beta',
    description: 'For teams ready for their own domain and collaborative operations.',
    href: '/admin/login',
    period: '/ month',
  },
  starter: {
    badge: 'Managed beta',
    cta: 'Join the cloud beta',
    description: 'For small teams that want LinksetGo managed, monitored and kept current.',
    href: '/admin/login',
    period: '/ month',
  },
} as const satisfies Record<
  PlanKey,
  Omit<PricingPlanViewModel, 'features' | 'name' | 'price' | 'slug'>
>

const planOrder: readonly PlanKey[] = ['community', 'free', 'starter', 'pro']

const communityFeatures = [
  'Unlimited self-hosted apps',
  'PostgreSQL storage',
  'AASA and Asset Links',
  'QR and Test Lab',
] as const

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value.toLocaleString('en-US')} ${value === 1 ? singular : plural}`
}

function presentCloudFeatures(plan: PlanDefinition): readonly string[] {
  const limits = plan.limits

  if (
    limits.apps === 'unlimited' ||
    limits.activeLinks === 'unlimited' ||
    limits.monthlyResolutions === 'unlimited' ||
    limits.analyticsRetentionDays === 'unlimited' ||
    limits.customDomains === 'unlimited' ||
    limits.members === 'unlimited'
  ) {
    throw new Error(`Cloud plan ${plan.key} must define finite limits.`)
  }

  const access =
    limits.customDomains === 0
      ? `Managed shared domain · ${formatCount(limits.members, 'member')}`
      : `${formatCount(limits.customDomains, 'custom domain')} · ${formatCount(
          limits.members,
          'member',
        )}`

  return [
    formatCount(limits.apps, 'app'),
    formatCount(limits.activeLinks, 'active link'),
    `${limits.monthlyResolutions.toLocaleString('en-US')} monthly resolves`,
    `${limits.analyticsRetentionDays}-day analytics`,
    access,
  ]
}

function appHref(path: '/admin/login' | '/signup', appBaseURL: string): string {
  return appBaseURL ? `${appBaseURL.replace(/\/+$/, '')}${path}` : path
}

export function presentPricingPlans(
  signupAvailable = false,
  appBaseURL = '',
): readonly PricingPlanViewModel[] {
  return planOrder.map((key) => {
    const plan = getPlanDefinition(key)
    const presentation = planPresentation[key]

    return {
      ...presentation,
      features: key === 'community' ? communityFeatures : presentCloudFeatures(plan),
      ...(key !== 'community'
        ? {
            cta: signupAvailable ? 'Create a workspace' : 'Sign in to LinksetGo Cloud',
            href: appHref(signupAvailable ? '/signup' : '/admin/login', appBaseURL),
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
