import { createElement } from 'react'
import { cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MarketingView } from '@/features/marketing/marketing.view'
import { useMarketingController } from '@/features/marketing/use-marketing-controller'

afterEach(cleanup)

const appOrigin = 'https://app.linksetgo.com'

function controller(signupAvailable: boolean) {
  return renderHook(() => useMarketingController('home', null, null, signupAvailable, appOrigin))
    .result.current
}

describe('marketing application navigation', () => {
  it('presents absolute application actions when Cloud signup is open', () => {
    const viewModel = controller(true)

    expect(viewModel.signInURL).toBe(`${appOrigin}/admin/login`)
    expect(viewModel.headerPrimaryAction).toEqual({
      href: `${appOrigin}/signup`,
      label: 'Create workspace',
    })
    expect(viewModel.landingPrimaryAction).toEqual({
      href: `${appOrigin}/signup`,
      label: 'Create a free workspace',
    })
    expect(viewModel.pricingPlans.find((plan) => plan.slug === 'free')?.href).toBe(
      `${appOrigin}/signup`,
    )
  })

  it('keeps self-hosting relative while routing managed entry to the app origin', () => {
    const viewModel = controller(false)

    expect(viewModel.headerPrimaryAction).toEqual({
      href: '/docs',
      label: 'Self-host free',
    })
    expect(viewModel.landingPrimaryAction).toEqual({
      href: `${appOrigin}/admin/login`,
      label: 'Open the console',
    })
    expect(viewModel.pricingPlans.find((plan) => plan.slug === 'starter')?.href).toBe(
      `${appOrigin}/admin/login`,
    )
  })

  it('renders header, landing, and footer application links from typed view props', () => {
    render(createElement(MarketingView, controller(true)))

    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
      `${appOrigin}/admin/login`,
    )
    expect(screen.getByRole('link', { name: /Create workspace/ }).getAttribute('href')).toBe(
      `${appOrigin}/signup`,
    )
    expect(screen.getByRole('link', { name: /Create a free workspace/ }).getAttribute('href')).toBe(
      `${appOrigin}/signup`,
    )
    expect(screen.getByRole('link', { name: 'Console' }).getAttribute('href')).toBe(
      `${appOrigin}/admin/login`,
    )
  })
})
