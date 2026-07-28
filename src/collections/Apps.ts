import type { CollectionConfig } from 'payload'

import { appCreateAccess, appManageAccess, appReadAccess } from '@/lib/server/access'
import {
  validateAllowedHosts,
  validateAppStoreURL,
  normalizeSlug,
  validateAndroidPackage,
  validateFingerprints,
  validateHttpsURL,
  validateIOSBundleID,
  validateIOSTeamID,
  validateNativeScheme,
  validatePlayStoreURL,
  validateSlug,
} from './validators'
import { normalizeAppFallbackHosts } from '@/lib/server/collection-guards'
import { enforceAppWorkspaceScope } from '@/lib/server/tenant-guards'
import { enforceWorkspaceAppSlug } from '@/lib/server/app-slug-guard'
import { enforceAppQuota } from '@/lib/server/quota-enforcement'
import {
  enforceActiveAppReadiness,
  enforceAppIdentityPermanence,
  normalizeAndRequireNativeScheme,
} from '@/lib/server/app-lifecycle-guards'
import { enforceCloudAppFallbackOrigins } from '@/lib/server/fallback-origin-policy'
import {
  enforcePlatformSuspensionFields,
  platformSuspensionFields,
} from '@/lib/server/platform-suspension'

export const Apps: CollectionConfig = {
  slug: 'apps',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'status', 'updatedAt'],
  },
  access: {
    create: appCreateAccess,
    delete: appManageAccess,
    read: appReadAccess,
    update: appManageAccess,
  },
  indexes: [
    {
      fields: ['workspace', 'slug'],
      unique: true,
    },
  ],
  fields: [
    {
      name: 'workspace',
      type: 'relationship',
      relationTo: 'workspaces',
      index: true,
      admin: {
        description:
          'Tenant workspace that owns this app. Legacy apps may remain empty until backfilled.',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 120,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      maxLength: 80,
      validate: validateSlug,
      hooks: {
        beforeValidate: [({ value }) => normalizeSlug(value)],
      },
    },
    {
      name: 'description',
      type: 'textarea',
      maxLength: 500,
    },
    {
      name: 'nativeScheme',
      type: 'text',
      index: true,
      maxLength: 64,
      validate: validateNativeScheme,
      admin: {
        description:
          'Custom mobile URL scheme without ://. Required for new apps; legacy apps can be backfilled.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Active', value: 'active' },
        { label: 'Paused', value: 'paused' },
      ],
    },
    {
      name: 'iosBundleId',
      type: 'text',
      validate: validateIOSBundleID,
    },
    {
      name: 'iosTeamId',
      type: 'text',
      validate: validateIOSTeamID,
    },
    {
      name: 'androidPackageName',
      type: 'text',
      validate: validateAndroidPackage,
    },
    {
      name: 'androidSha256CertFingerprints',
      type: 'text',
      hasMany: true,
      validate: validateFingerprints,
    },
    {
      name: 'appStoreUrl',
      type: 'text',
      validate: validateAppStoreURL,
    },
    {
      name: 'playStoreUrl',
      type: 'text',
      validate: validatePlayStoreURL,
    },
    {
      name: 'fallbackUrl',
      type: 'text',
      required: true,
      validate: validateHttpsURL,
    },
    {
      name: 'allowedFallbackHosts',
      type: 'text',
      hasMany: true,
      validate: validateAllowedHosts,
      admin: {
        description: 'Hostnames permitted for per-link fallback overrides.',
      },
    },
    ...platformSuspensionFields,
  ],
  hooks: {
    beforeValidate: [
      enforcePlatformSuspensionFields,
      normalizeAndRequireNativeScheme,
      enforceAppIdentityPermanence,
      enforceAppWorkspaceScope,
      enforceActiveAppReadiness,
      normalizeAppFallbackHosts,
      enforceCloudAppFallbackOrigins,
      enforceWorkspaceAppSlug,
      enforceAppQuota,
    ],
  },
}
