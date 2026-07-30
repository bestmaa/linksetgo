import type {
  AppDTO,
  CreateDeepLinkInput,
  DeepLinkDTO,
  Identifier,
} from '@/lib/client/payload-types'
import { buildPublicURL } from '@/lib/domain/public-link'
import type { PublicLinkPathStyle } from '@/lib/domain/runtime-link-config'

import type { LinkFormViewModel } from './links.types'
export { parseNativeDeepLink } from './native-link-parser'

export type ParameterDraft = { id: string; key: string; value: string }
export type FormDraft = Omit<LinkFormViewModel, 'parameters' | 'publicUrl'> & {
  parameters: ParameterDraft[]
}

export const emptyLinkForm: FormDraft = {
  appId: '',
  destinationPath: '',
  expiresAt: '',
  fallbackUrl: '',
  name: '',
  parameters: [],
  slug: '',
  status: 'active',
}

export function copyLinkToClipboard(value: string, onFeedback: (message: string) => void): void {
  if (!navigator.clipboard) {
    onFeedback('Clipboard access is unavailable. Select the URL and copy it manually.')
    return
  }
  void navigator.clipboard
    .writeText(value)
    .then(() => onFeedback('Link copied to clipboard.'))
    .catch(() => onFeedback('Copy failed. Select the URL and copy it manually.'))
}

export function slugifyLinkName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function linkStatusForApp(
  app: Pick<AppDTO, 'status'> | null | undefined,
  requested: FormDraft['status'],
): FormDraft['status'] {
  return app?.status === 'active' ? requested : 'draft'
}

export function formForAvailableApps(current: FormDraft, apps: readonly AppDTO[]): FormDraft {
  const app = apps.find((item) => String(item.id) === current.appId) ?? apps[0]
  return {
    ...current,
    appId: String(app?.id ?? ''),
    status: linkStatusForApp(app, current.status),
  }
}

export function approvedFallbackHosts(app: AppDTO | null | undefined): string[] {
  let defaultHostname: string | null = null
  try {
    defaultHostname = app?.fallbackUrl ? new URL(app.fallbackUrl).hostname.toLowerCase() : null
  } catch {
    defaultHostname = null
  }
  return [
    ...new Set(
      [defaultHostname, ...(app?.allowedFallbackHosts ?? [])]
        .filter((hostname): hostname is string => Boolean(hostname))
        .map((hostname) => hostname.toLowerCase()),
    ),
  ]
}

export function fallbackURLForAppError(
  value: string,
  app: AppDTO | null | undefined,
): string | null {
  if (!value.trim()) return null
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return 'Enter a complete HTTPS fallback URL.'
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return 'Use an HTTPS fallback without credentials or an explicit port.'
  }
  const approvedHosts = approvedFallbackHosts(app)
  if (!approvedHosts.includes(url.hostname.toLowerCase())) {
    return approvedHosts.length > 0
      ? `Use an approved fallback host: ${approvedHosts.join(', ')}.`
      : 'Add and verify this fallback host on the app before using it.'
  }
  return null
}

export function linkStatusTone(status: string) {
  if (status === 'active') return 'success' as const
  if (status === 'expired') return 'danger' as const
  if (status === 'paused') return 'warning' as const
  return 'neutral' as const
}

export function effectiveLinkStatus(link: DeepLinkDTO) {
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return 'expired'
  return link.status ?? 'draft'
}

export function relatedApp(link: DeepLinkDTO, apps: AppDTO[]) {
  if (typeof link.app === 'object') return link.app
  return apps.find((app) => String(app.id) === String(link.app))
}

export function buildPublicLinkUrl(
  linkOrigin: string | null,
  app: Pick<AppDTO, 'publicKey' | 'slug'> | null | undefined,
  linkSlug: string,
  pathStyle: PublicLinkPathStyle = 'host-scoped',
) {
  if (!linkOrigin) return null
  const appKey = pathStyle === 'shared-clean' ? app?.publicKey : app?.slug
  if (app && !appKey) return null
  return buildPublicURL(linkOrigin, appKey || 'app', linkSlug || 'your-link', pathStyle)
}

export function parseRelationIdentifier(value: string): Identifier {
  const numericValue = Number(value)
  return Number.isSafeInteger(numericValue) && numericValue > 0 && String(numericValue) === value
    ? numericValue
    : value
}

export function buildCreateLinkInput(form: FormDraft): CreateDeepLinkInput {
  const parameters = Object.fromEntries(
    form.parameters.filter((item) => item.key.trim()).map((item) => [item.key.trim(), item.value]),
  )
  return {
    app: parseRelationIdentifier(form.appId),
    destinationPath: form.destinationPath.trim(),
    name: form.name.trim(),
    slug: form.slug.trim(),
    status: form.status,
    ...(form.expiresAt ? { expiresAt: new Date(`${form.expiresAt}T23:59:59Z`).toISOString() } : {}),
    ...(form.fallbackUrl.trim() ? { fallbackUrl: form.fallbackUrl.trim() } : {}),
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
  }
}
