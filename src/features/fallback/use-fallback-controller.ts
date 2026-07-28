'use client'

import { useCallback, useEffect, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { PublicLinkResponse } from '@/lib/client/payload-types'

export function useFallbackController(appSlug: string, linkSlug: string, marketingURL: string) {
  const [resolvedLink, setResolvedLink] = useState<PublicLinkResponse | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [message, setMessage] = useState('Finding the right destination…')
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const response = await payloadClient.getPublicLink(appSlug, linkSlug)
      setResolvedLink(response)
      setState('ready')
      setMessage('The app did not open automatically. Choose another way to continue.')
      void payloadClient
        .recordPublicEvent({ appSlug, eventType: 'fallback-viewed', linkSlug })
        .catch(() => undefined)
    } catch (requestError) {
      setState('unavailable')
      setMessage(errorMessage(requestError))
    }
  }, [appSlug, linkSlug])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const app = resolvedLink?.app
  const storeLinks = [
    ...(app?.appStoreUrl
      ? [
          {
            href: app.appStoreUrl,
            label: 'View on the App Store',
            onClick: () =>
              void payloadClient
                .recordPublicEvent({ appSlug, eventType: 'store-clicked', linkSlug })
                .catch(() => undefined),
          },
        ]
      : []),
    ...(app?.playStoreUrl
      ? [
          {
            href: app.playStoreUrl,
            label: 'Get it on Google Play',
            onClick: () =>
              void payloadClient
                .recordPublicEvent({ appSlug, eventType: 'store-clicked', linkSlug })
                .catch(() => undefined),
          },
        ]
      : []),
  ]
  const currentUrl =
    typeof window === 'undefined'
      ? `/l/${encodeURIComponent(appSlug)}/${encodeURIComponent(linkSlug)}`
      : window.location.href

  return {
    appName: app?.name ?? 'LinksetGo',
    destination: resolvedLink?.link.destinationPath ?? '',
    fallbackHref: resolvedLink?.link.fallbackUrl || app?.fallbackUrl || null,
    isLoading: state === 'loading',
    message,
    openAppAction: resolvedLink?.link.nativeUrl
      ? {
          href: resolvedLink.link.nativeUrl,
          onClick: () =>
            void payloadClient
              .recordPublicEvent({ appSlug, eventType: 'open-app-clicked', linkSlug })
              .catch(() => undefined),
        }
      : null,
    onCopy: () =>
      void navigator.clipboard
        .writeText(currentUrl)
        .then(() => setToast('Link copied to clipboard.')),
    reportHref: `/report-abuse?target=${encodeURIComponent(currentUrl)}`,
    sourceHref: new URL('/open-source', marketingURL).toString(),
    state,
    storeLinks,
    toast,
  }
}
