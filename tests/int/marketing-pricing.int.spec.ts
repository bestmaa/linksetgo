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
      cta: 'Sign in to LinksetGo Cloud',
      href: '/admin/login',
    })
    expect(cloudPlans.find((plan) => plan.slug === 'community')?.href).toBe('/docs')
  })

  it('routes managed calls to action to the configured app origin', () => {
    const signupPlans = presentPricingPlans(true, 'https://app.linksetgo.com/')
    const closedPlans = presentPricingPlans(false, 'https://app.linksetgo.com')

    expect(signupPlans.find((plan) => plan.slug === 'free')?.href).toBe(
      'https://app.linksetgo.com/signup',
    )
    expect(closedPlans.find((plan) => plan.slug === 'starter')?.href).toBe(
      'https://app.linksetgo.com/admin/login',
    )
    expect(signupPlans.find((plan) => plan.slug === 'community')?.href).toBe('/docs')
  })

  it('presents the catalog limits without duplicating quota values', () => {
    const plans = presentPricingPlans(true)

    expect(plans.find((plan) => plan.slug === 'free')?.features).toEqual([
      '1 app',
      '250 active links',
      '15,000 monthly resolves',
      '14-day analytics',
      'Managed shared domain · 1 member',
    ])
    expect(plans.find((plan) => plan.slug === 'starter')?.features).toEqual([
      '5 apps',
      '2,500 active links',
      '150,000 monthly resolves',
      '90-day analytics',
      '1 custom domain · 3 members',
    ])
    expect(plans.find((plan) => plan.slug === 'pro')?.features).toEqual([
      '20 apps',
      '10,000 active links',
      '1,000,000 monthly resolves',
      '365-day analytics',
      '5 custom domains · 10 members',
    ])
  })
})
