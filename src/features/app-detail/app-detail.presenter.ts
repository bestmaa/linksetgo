import { appPlatformReadiness } from '@/lib/domain/app-readiness'
import type { AppConsoleDetailDTO, AppDTO } from '@/lib/client/payload-types'

import type {
  AppDetailForm,
  AppDetailLinkViewModel,
  AppDetailViewModel,
  PlatformReadinessViewModel,
} from './app-detail.types'

const display = (value: string | null | undefined): string => value?.trim() || 'Not configured'

export function appDetailFormFromDTO(app: AppDTO): AppDetailForm {
  return {
    androidPackageName: app.androidPackageName ?? '',
    androidSha256CertFingerprints: app.androidSha256CertFingerprints?.join('\n') ?? '',
    appStoreUrl: app.appStoreUrl ?? '',
    description: app.description ?? '',
    fallbackUrl: app.fallbackUrl ?? '',
    iosBundleId: app.iosBundleId ?? '',
    iosTeamId: app.iosTeamId ?? '',
    name: app.name,
    nativeScheme: app.nativeScheme ?? '',
    playStoreUrl: app.playStoreUrl ?? '',
  }
}

function iosReadiness(app: AppDTO): PlatformReadinessViewModel {
  const readiness = appPlatformReadiness(app).ios
  const remediation: string[] = []
  if (readiness.missing.includes('iosBundleId')) {
    remediation.push('Ask the iOS team for the Bundle ID from Xcode Signing & Capabilities.')
  }
  if (readiness.missing.includes('iosTeamId')) {
    remediation.push('Copy the 10-character Team ID from Apple Developer Membership.')
  }
  return {
    complete: readiness.complete,
    description: readiness.complete
      ? 'Ready for the Apple App Site Association file.'
      : 'Complete both identity fields before publishing iOS association records.',
    label: 'iOS Universal Links',
    remediation,
    values: [
      {
        label: 'Bundle ID',
        state: app.iosBundleId ? 'complete' : 'missing',
        value: display(app.iosBundleId),
      },
      {
        label: 'Apple Team ID',
        state: app.iosTeamId ? 'complete' : 'missing',
        value: display(app.iosTeamId),
      },
      {
        label: 'App Store',
        state: 'optional',
        value: app.appStoreUrl ? 'Listing connected' : 'Optional listing not added',
      },
    ],
  }
}

function androidReadiness(app: AppDTO): PlatformReadinessViewModel {
  const readiness = appPlatformReadiness(app).android
  const remediation: string[] = []
  if (readiness.missing.includes('androidPackageName')) {
    remediation.push('Ask the Android team for the application ID from the app Gradle file.')
  }
  if (readiness.missing.includes('androidSha256CertFingerprints')) {
    remediation.push('Add the release or Play App Signing SHA-256 certificate fingerprint.')
  }
  const certificateCount = app.androidSha256CertFingerprints?.length ?? 0
  return {
    complete: readiness.complete,
    description: readiness.complete
      ? 'Ready for the Digital Asset Links statement.'
      : 'Add the package and at least one signing certificate before publishing Android records.',
    label: 'Android App Links',
    remediation,
    values: [
      {
        label: 'Application ID',
        state: app.androidPackageName ? 'complete' : 'missing',
        value: display(app.androidPackageName),
      },
      {
        label: 'Signing certificates',
        state: certificateCount > 0 ? 'complete' : 'missing',
        value: certificateCount > 0 ? `${certificateCount} configured` : 'Not configured',
      },
      {
        label: 'Google Play',
        state: 'optional',
        value: app.playStoreUrl ? 'Listing connected' : 'Optional listing not added',
      },
    ],
  }
}

function effectiveLinkStatus(link: AppConsoleDetailDTO['links'][number]): string {
  if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) return 'expired'
  return link.status ?? 'draft'
}

function linkViewModel(
  link: AppConsoleDetailDTO['links'][number],
  appSlug: string,
  runtimeBaseUrl: string | null,
): AppDetailLinkViewModel {
  const status = effectiveLinkStatus(link)
  return {
    destination: link.destinationPath,
    id: String(link.id),
    name: link.name,
    publicUrl: runtimeBaseUrl
      ? `${runtimeBaseUrl.replace(/\/$/, '')}/l/${appSlug}/${link.slug}`
      : null,
    status,
    statusTone: status === 'active' ? 'success' : status === 'expired' ? 'danger' : 'neutral',
  }
}

function updatedLabel(value: string | undefined): string {
  if (!value) return 'Update time unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Update time unavailable'
    : `Updated ${date.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`
}

export function presentAppDetail(
  detail: AppConsoleDetailDTO,
  workspaceName: string,
  canManage: boolean,
  runtimeBaseUrl: string | null,
): AppDetailViewModel {
  const status = detail.app.status ?? 'draft'
  const ios = iosReadiness(detail.app)
  const android = androidReadiness(detail.app)
  const canActivate = ios.complete || android.complete
  return {
    activationHelp: canActivate
      ? 'Platform identity is complete. LinksetGo will also validate fallback safety on activation.'
      : 'Complete either iOS or Android before activation.',
    android,
    appKey: detail.app.slug,
    appStoreUrl: detail.app.appStoreUrl ?? null,
    canActivate,
    canManage,
    description: detail.app.description?.trim() || 'No app description has been added.',
    fallbackUrl: detail.app.fallbackUrl ?? '',
    id: String(detail.app.id),
    ios,
    linkCountLabel: `${detail.totalLinks} ${detail.totalLinks === 1 ? 'connected link' : 'connected links'}`,
    linksHref: `/admin/links?app=${encodeURIComponent(String(detail.app.id))}`,
    name: detail.app.name,
    nativeScheme: detail.app.nativeScheme ?? null,
    playStoreUrl: detail.app.playStoreUrl ?? null,
    recentLinks: detail.links.map((link) => linkViewModel(link, detail.app.slug, runtimeBaseUrl)),
    status,
    statusTone: status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'neutral',
    updatedLabel: updatedLabel(detail.app.updatedAt),
    workspaceName,
  }
}
