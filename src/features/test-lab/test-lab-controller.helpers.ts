import type { AppDTO, DeepLinkDTO } from '@/lib/client/payload-types'

import type { CheckViewModel, SavedLinkOptionViewModel, TestPlatform } from './test-lab.types'

export type ParsedRelayUrl = {
  appSlug: string
  linkSlug: string
  origin: string
  url: string
}

export type CheckResult = Omit<CheckViewModel, 'copyAction'> & {
  copyLabel?: string
  copyValue?: string
}

export function parseRelayUrl(value: string, configuredOrigin: string): ParsedRelayUrl {
  const parsed = new URL(value)
  if (parsed.origin !== configuredOrigin) {
    throw new Error(`Use the configured link domain: ${configuredOrigin}.`)
  }
  const match = /^\/l\/([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)\/?$/.exec(parsed.pathname)
  if (!match?.[1] || !match[2] || parsed.search || parsed.hash) {
    throw new Error('Expected exactly /l/{app}/{link} without query parameters or a fragment.')
  }
  return {
    appSlug: match[1],
    linkSlug: match[2],
    origin: parsed.origin,
    url: `${parsed.origin}/l/${match[1]}/${match[2]}`,
  }
}

export function safeRelayUrl(value: string, configuredOrigin: string): string | null {
  try {
    return parseRelayUrl(value.trim(), configuredOrigin).url
  } catch {
    return null
  }
}

export function platformsFor(platform: TestPlatform): readonly ('ios' | 'android')[] {
  return platform === 'both' ? ['ios', 'android'] : [platform]
}

export function pendingChecks(platform: TestPlatform): CheckResult[] {
  return [
    { detail: 'Checking the public URL format', label: 'Valid Relay URL', status: 'pending' },
    { detail: 'Looking up the saved record', label: 'Link record resolves', status: 'pending' },
    { detail: 'Inspecting the in-app route', label: 'Destination is valid', status: 'pending' },
    ...platformsFor(platform).map((target): CheckResult => ({
      detail: `Checking ${target === 'ios' ? 'Apple' : 'Android'} domain association`,
      label: `${target === 'ios' ? 'iOS' : 'Android'} association`,
      status: 'pending',
    })),
    {
      detail: 'Inspecting the configured web destination',
      label: 'Fallback is configured',
      status: 'pending',
    },
  ]
}

export function checkResult(
  label: string,
  detail: string,
  passed: boolean,
  options: Pick<CheckResult, 'copyLabel' | 'copyValue' | 'remediation'> = {},
): CheckResult {
  return { detail, label, status: passed ? 'passed' : 'failed', ...options }
}

function relatedApp(link: DeepLinkDTO, apps: readonly AppDTO[]): AppDTO | null {
  if (typeof link.app === 'object') return link.app
  return apps.find((app) => String(app.id) === String(link.app)) ?? null
}

export function buildSavedLinkOptions(
  links: readonly DeepLinkDTO[],
  apps: readonly AppDTO[],
  configuredOrigin: string,
): SavedLinkOptionViewModel[] {
  return links.flatMap((link) => {
    const app = relatedApp(link, apps)
    if (!app) return []
    return [
      {
        id: String(link.id),
        label: `${app.name} / ${link.name}`,
        url: `${configuredOrigin}/l/${app.slug}/${link.slug}`,
      },
    ]
  })
}

export function selectedSavedLinkId(
  url: string,
  options: readonly SavedLinkOptionViewModel[],
): string {
  return options.find((option) => option.url === url.trim())?.id ?? ''
}

export function qrDownloadBaseName(url: string): string {
  try {
    const path = new URL(url).pathname
      .split('/')
      .filter(Boolean)
      .slice(-2)
      .join('-')
      .replace(/[^a-z0-9-]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
    return `relay-${path || 'deep-link'}`.slice(0, 96)
  } catch {
    return 'relay-deep-link'
  }
}
