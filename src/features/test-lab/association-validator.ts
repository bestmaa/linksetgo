import type { AppDTO } from '@/lib/client/payload-types'

export type AssociationValidation = {
  copyLabel?: string
  copyValue?: string
  detail: string
  passed: boolean
  remediation?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function appleConfiguration(app: AppDTO): AssociationValidation | null {
  if (!app.iosTeamId || !app.iosBundleId) {
    return {
      detail: `${app.name} is missing its Apple Team ID or Bundle ID.`,
      passed: false,
      remediation: 'Open Apps, edit this app and add both values from the Apple developer team.',
    }
  }
  return null
}

function validateAppleDocument(value: unknown, app: AppDTO): AssociationValidation {
  const configurationError = appleConfiguration(app)
  if (configurationError) return configurationError
  const applinks = isRecord(value) && isRecord(value.applinks) ? value.applinks : null
  const details = applinks && Array.isArray(applinks.details) ? applinks.details : []
  const expectedAppID = `${app.iosTeamId}.${app.iosBundleId}`
  const expectedPath = `/l/${app.slug}/*`
  const expectedEntry = JSON.stringify(
    {
      appID: expectedAppID,
      components: [{ '/': expectedPath, comment: 'LinksetGo deep links' }],
    },
    null,
    2,
  )
  const matched = details.some((detail) => {
    if (!isRecord(detail) || detail.appID !== expectedAppID || !Array.isArray(detail.components)) {
      return false
    }
    return detail.components.some(
      (component) => isRecord(component) && component['/'] === expectedPath,
    )
  })
  return matched
    ? {
        copyLabel: 'Copy expected AASA entry',
        copyValue: expectedEntry,
        detail: `${expectedAppID} includes ${expectedPath}.`,
        passed: true,
      }
    : {
        copyLabel: 'Copy expected AASA entry',
        copyValue: expectedEntry,
        detail: `Expected ${expectedAppID} with path ${expectedPath}.`,
        passed: false,
        remediation:
          'Add this entry to applinks.details, publish the AASA file without redirects, then rerun.',
      }
}

function androidConfiguration(app: AppDTO): AssociationValidation | null {
  if (!app.androidPackageName || !app.androidSha256CertFingerprints?.length) {
    return {
      detail: `${app.name} is missing its Android package or SHA-256 fingerprint.`,
      passed: false,
      remediation:
        'Open Apps, edit this app and add the release package plus every signing certificate fingerprint.',
    }
  }
  return null
}

function validateAndroidDocument(value: unknown, app: AppDTO): AssociationValidation {
  const configurationError = androidConfiguration(app)
  if (configurationError) return configurationError
  const statements = Array.isArray(value) ? value : []
  const expectedFingerprints = (app.androidSha256CertFingerprints ?? []).map((item) =>
    item.trim().toUpperCase(),
  )
  const expectedStatement = JSON.stringify(
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: app.androidPackageName,
        sha256_cert_fingerprints: expectedFingerprints,
      },
    },
    null,
    2,
  )
  const matched = statements.some((statement) => {
    if (!isRecord(statement) || !Array.isArray(statement.relation) || !isRecord(statement.target)) {
      return false
    }
    const relationMatches = statement.relation.includes(
      'delegate_permission/common.handle_all_urls',
    )
    const packageMatches = statement.target.package_name === app.androidPackageName
    const actualFingerprints = stringArray(statement.target.sha256_cert_fingerprints).map((item) =>
      item.trim().toUpperCase(),
    )
    return (
      relationMatches &&
      packageMatches &&
      expectedFingerprints.every((fingerprint) => actualFingerprints.includes(fingerprint))
    )
  })
  return matched
    ? {
        copyLabel: 'Copy expected Asset Links entry',
        copyValue: expectedStatement,
        detail: `${app.androidPackageName} includes ${expectedFingerprints.length} configured certificate fingerprint${expectedFingerprints.length === 1 ? '' : 's'}.`,
        passed: true,
      }
    : {
        copyLabel: 'Copy expected Asset Links entry',
        copyValue: expectedStatement,
        detail: `Expected package ${app.androidPackageName} with every configured SHA-256 fingerprint.`,
        passed: false,
        remediation:
          'Add this statement to assetlinks.json, include release and Play App Signing fingerprints, then rerun.',
      }
}

export async function validateAssociation(
  origin: string,
  platform: 'ios' | 'android',
  app: AppDTO | null,
): Promise<AssociationValidation> {
  if (!app) {
    return {
      detail: 'The selected app configuration could not be loaded.',
      passed: false,
      remediation: 'Confirm your account can access the app, then reload Test Lab.',
    }
  }
  const path =
    platform === 'ios' ? '/.well-known/apple-app-site-association' : '/.well-known/assetlinks.json'
  const endpoint = `${origin}${path}`
  try {
    const response = await fetch(endpoint, { cache: 'no-store' })
    if (!response.ok) {
      return {
        copyLabel: 'Copy endpoint URL',
        copyValue: endpoint,
        detail: `${path} returned HTTP ${response.status}.`,
        passed: false,
        remediation:
          'Serve this endpoint publicly over HTTPS with status 200, no login and no redirect.',
      }
    }
    const document: unknown = await response.json()
    return platform === 'ios'
      ? validateAppleDocument(document, app)
      : validateAndroidDocument(document, app)
  } catch {
    return {
      copyLabel: 'Copy endpoint URL',
      copyValue: endpoint,
      detail: `${path} did not return valid association JSON.`,
      passed: false,
      remediation:
        'Check DNS, TLS and response JSON. The endpoint must be reachable from this browser.',
    }
  }
}
