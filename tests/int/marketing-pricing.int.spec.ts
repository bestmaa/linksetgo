import { describe, expect, it } from 'vitest'

import { presentPricingPlans } from '@/features/marketing/pricing.presenter'

describe('edition-aware marketing plans', () => {
  it('routes managed plans to signup only when Cloud signup is ready', () => {
    const cloudPlans = presentPricingPlans(true)
    const closedPlans = presentPricingPlans(false)

    expect(cloudPlans.find((plan) => plan.slug === 'free')).toMatchObject({
      cta: 'Create a workspace',
      href: '/signup',
    })
    expect(cloudPlans.find((plan) => plan.slug === 'pro')?.price).toBe('$10')
    expect(closedPlans.find((plan) => plan.slug === 'free')).toMatchObject({
      cta: 'Sign in to Relay Cloud',
      href: '/admin/login',
    })
    expect(cloudPlans.find((plan) => plan.slug === 'community')?.href).toBe('/docs')
  })
})
