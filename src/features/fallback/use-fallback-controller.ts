'use client'

import { useCallback, useEffect, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { PublicLinkResponse } from '@/lib/client/payload-types'
import { buildPublicURL } from '@/lib/domain/public-link'
import type { PublicLinkPathStyle } from '@/lib/domain/runtime-link-config'
import { storeURLForUserAgent } from './fallback.helpers'

export function useFallbackController(
  appSlug: string,
  linkSlug: string,
  marketingURL: string,
  publicBaseURL: string,
  pathStyle: PublicLinkPathStyle,
) {
  const [resolvedLink, setResolvedLink] = useState<PublicLinkResponse | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [message, setMessage] = useState('Finding the right destination…')
  const [toast, setToast] = useState<string | null>(null)
  const recordEvent = useCallback(
    (eventType: 'app-opened' | 'fallback-viewed' | 'open-app-clicked' | 'store-clicked') => {
      if (!resolvedLink?.eventToken) return
      void payloadClient
        .recordPublicEvent({ appSlug, eventToken: resolvedLink.eventToken, eventType, linkSlug })
        .catch(() => undefined)
    },
    [appSlug, linkSlug, resolvedLink],
  )

  const load = useCallback(async () => {
    setState('loading')
    try {
      const response = await payloadClient.getPublicLink(appSlug, linkSlug)
      setResolvedLink(response)
      setState('ready')
      setMessage('The app did not open automatically. Choose another way to continue.')
      void payloadClient
        .recordPublicEvent({
          appSlug,
          eventToken: response.eventToken,
          eventType: 'fallback-viewed',
          linkSlug,
        })
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
    const nativeUrl = resolvedLink?.link.nativeUrl
    if (state !== 'ready' || !nativeUrl) return

    const fallbackUrl = resolvedLink.link.fallbackUrl || resolvedLink.app.fallbackUrl
    const automaticStoreUrl = fallbackUrl
      ? null
      : storeURLForUserAgent(window.navigator.userAgent, resolvedLink.app)
    let pageHidden = document.visibilityState === 'hidden'
    const markHidden = () => {
      pageHidden = true
    }
    document.addEventListener('visibilitychange', markHidden)
    window.addEventListener('pagehide', markHidden)
    recordEvent('open-app-clicked')
    window.location.assign(nativeUrl)
    const timeout = window.setTimeout(() => {
      if (!pageHidden && automaticStoreUrl) {
        setMessage('The app is not installed. Taking you to the official app store…')
        window.location.assign(automaticStoreUrl)
      } else if (!pageHidden) {
        setMessage('The app did not open automatically. Choose another way to continue.')
      }
    }, 1_200)

    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', markHidden)
      window.removeEventListener('pagehide', markHidden)
    }
  }, [recordEvent, resolvedLink, state])
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
            onClick: () => recordEvent('store-clicked'),
          },
        ]
      : []),
    ...(app?.playStoreUrl
      ? [
          {
            href: app.playStoreUrl,
            label: 'Get it on Google Play',
            onClick: () => recordEvent('store-clicked'),
          },
        ]
      : []),
  ]
  const currentUrl =
    resolvedLink?.publicUrl ?? buildPublicURL(publicBaseURL, appSlug, linkSlug, pathStyle)
  const fallbackHref = resolvedLink?.link.fallbackUrl || app?.fallbackUrl || null

  return {
    appName: app?.name ?? 'LinksetGo',
    destination: resolvedLink?.link.destinationPath ?? '',
    fallbackHref,
    fallbackLabel: fallbackHostname(fallbackHref),
    isLoading: state === 'loading',
    message,
    openAppAction: resolvedLink?.link.nativeUrl
      ? {
          href: resolvedLink.link.nativeUrl,
          onClick: () => recordEvent('open-app-clicked'),
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

function fallbackHostname(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}
