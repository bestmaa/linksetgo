import { APIError, type CollectionBeforeValidateHook } from 'payload'

import { hasCompleteAppPlatform } from '@/lib/domain/app-readiness'
import { isSharedPublicAppKey } from '@/lib/domain/deployment-surface'
import { normalizeNativeScheme } from '@/lib/domain/native-scheme'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const selected = (
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
  field: string,
): unknown => (Object.hasOwn(next, field) ? next[field] : previous[field])

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const fingerprints = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null

const relationID = (value: unknown): string | null => {
  if (typeof value === 'number' || typeof value === 'string') return String(value)
  return isRecord(value) && (typeof value.id === 'number' || typeof value.id === 'string')
    ? String(value.id)
    : null
}

const allowsIdentityMigration = (context: unknown): boolean =>
  isRecord(context) && context.allowAppIdentityMigration === true

export const enforceAppIdentityPermanence: CollectionBeforeValidateHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || allowsIdentityMigration(req.context)) return data

  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const slugChanged = Object.hasOwn(next, 'slug') && next.slug !== previous.slug
  const publicKeyChanged =
    Object.hasOwn(next, 'publicKey') &&
    previous.publicKey !== null &&
    previous.publicKey !== undefined &&
    next.publicKey !== previous.publicKey
  const workspaceChanged =
    Object.hasOwn(next, 'workspace') &&
    relationID(next.workspace) !== relationID(previous.workspace)

  if (slugChanged || publicKeyChanged || workspaceChanged) {
    throw new APIError(
      'An app key and workspace are permanent after the app is created; its shared public key is also permanent.',
      409,
    )
  }
  return data
}

export const normalizeOptionalPublicAppKey: CollectionBeforeValidateHook = ({ data }) => {
  const next = isRecord(data) ? data : {}
  if (!Object.hasOwn(next, 'publicKey')) return data
  if (next.publicKey === null || next.publicKey === undefined || next.publicKey === '') {
    return { ...next, publicKey: null }
  }
  const publicKey =
    typeof next.publicKey === 'string'
      ? next.publicKey
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      : ''
  if (!publicKey) {
    throw new APIError('Enter a valid shared public app key.', 422)
  }
  if (!isSharedPublicAppKey(publicKey)) {
    throw new APIError('That shared public app key is reserved by LinksetGo.', 409)
  }
  return { ...next, publicKey }
}

export const normalizeAndRequireNativeScheme: CollectionBeforeValidateHook = ({
  data,
  operation,
  req,
}) => {
  const next = isRecord(data) ? data : {}
  if (typeof next.nativeScheme === 'string' && next.nativeScheme.trim()) {
    const normalized = normalizeNativeScheme(next.nativeScheme)
    if (!normalized) throw new APIError('Enter a valid mobile app custom scheme.', 422)
    return { ...next, nativeScheme: normalized }
  }
  if (operation === 'create' && req.user) {
    throw new APIError('A native URL scheme is required for every new app.', 422)
  }
  return data
}

export const enforceActiveAppReadiness: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  if (selected(next, previous, 'status') !== 'active') return data
  if (selected(next, previous, 'routingMode') === 'scheme-handoff') return data

  if (
    !hasCompleteAppPlatform({
      androidPackageName: text(selected(next, previous, 'androidPackageName')),
      androidSha256CertFingerprints: fingerprints(
        selected(next, previous, 'androidSha256CertFingerprints'),
      ),
      iosBundleId: text(selected(next, previous, 'iosBundleId')),
      iosTeamId: text(selected(next, previous, 'iosTeamId')),
    })
  ) {
    throw new APIError(
      'Complete either the iOS or Android platform identity before activating this app.',
      422,
    )
  }
  return data
}
