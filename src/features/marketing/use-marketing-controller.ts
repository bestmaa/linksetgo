'use client'

import { useEffect, useState } from 'react'

import type { MarketingPage, ServiceStatusViewModel } from './marketing.types'
import { presentPricingPlans } from './pricing.presenter'

export function useMarketingController(
  page: MarketingPage,
  sourceCodeURL: string | null,
  sponsorURL: string | null,
  signupAvailable: boolean,
  appBaseURL: string,
) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [serviceStatus, setServiceStatus] = useState<ServiceStatusViewModel>({
    componentLabel: 'Checking readiness',
    detail: 'Reading liveness and readiness now.',
    kind: 'checking',
    label: 'Checking current status',
  })

  useEffect(() => {
    if (page !== 'status') return

    const controller = new AbortController()
    const checkStatus = async () => {
      try {
        const [live, ready] = await Promise.all([
          fetch('/api/health/live', { cache: 'no-store', signal: controller.signal }),
          fetch('/api/health/ready', { cache: 'no-store', signal: controller.signal }),
        ])
        const checkedAt = new Date().toLocaleString()
        setServiceStatus(
          live.ok && ready.ok
            ? {
                componentLabel: 'Operational',
                detail: `Last checked ${checkedAt}.`,
                kind: 'operational',
                label: 'All systems operational',
              }
            : {
                componentLabel: 'Needs attention',
                detail: `Last checked ${checkedAt}.`,
                kind: 'degraded',
                label: 'Service needs attention',
              },
        )
      } catch {
        if (!controller.signal.aborted) {
          setServiceStatus({
            componentLabel: 'Needs attention',
            detail: `Last checked ${new Date().toLocaleString()}.`,
            kind: 'degraded',
            label: 'Service needs attention',
          })
        }
      }
    }

    void checkStatus()
    return () => controller.abort()
  }, [page])

  const withAppPath = (path: '/admin/login' | '/signup'): string =>
    appBaseURL ? `${appBaseURL.replace(/\/+$/, '')}${path}` : path
  const signInURL = withAppPath('/admin/login')

  return {
    headerPrimaryAction: signupAvailable
      ? { href: withAppPath('/signup'), label: 'Create workspace' }
      : { href: '/docs', label: 'Self-host free' },
    isMenuOpen,
    landingPrimaryAction: signupAvailable
      ? { href: withAppPath('/signup'), label: 'Create a free workspace' }
      : { href: signInURL, label: 'Open the console' },
    onCloseMenu: () => setIsMenuOpen(false),
    onToggleMenu: () => setIsMenuOpen((current) => !current),
    page,
    pricingPlans: presentPricingPlans(signupAvailable, appBaseURL),
    serviceStatus,
    signInURL,
    sourceCodeURL,
    sponsorURL,
  }
}
