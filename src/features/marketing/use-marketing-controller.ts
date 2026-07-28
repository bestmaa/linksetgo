'use client'

import { useEffect, useState } from 'react'

import type { MarketingPage, ServiceStatusViewModel } from './marketing.types'
import { presentPricingPlans } from './pricing.presenter'

export function useMarketingController(
  page: MarketingPage,
  sourceCodeURL: string | null,
  sponsorURL: string | null,
  signupAvailable: boolean,
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

  return {
    isMenuOpen,
    onCloseMenu: () => setIsMenuOpen(false),
    onToggleMenu: () => setIsMenuOpen((current) => !current),
    page,
    pricingPlans: presentPricingPlans(signupAvailable),
    serviceStatus,
    signupAvailable,
    sourceCodeURL,
    sponsorURL,
  }
}
