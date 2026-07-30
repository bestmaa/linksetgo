import type { CollectionConfig } from 'payload'

import {
  appScopedManageAccess,
  appScopedReadAccess,
  canManageAccess,
  enforceAppScope,
} from '@/lib/server/access'
import { enforceDeepLinkFallbackHost } from '@/lib/server/collection-guards'
import { enforceActiveLinkQuota, enforceSavedLinkQuota } from '@/lib/server/quota-enforcement'
import { enforceDeepLinkLifecycle } from '@/lib/server/deep-link-lifecycle'
import {
  enforcePlatformSuspensionFields,
  platformSuspensionFields,
} from '@/lib/server/platform-suspension'
import {
  normalizeSlug,
  validateDestinationPath,
  validateHttpsURL,
  validateParameters,
  validateSlug,
} from './validators'
import {
  applyDeepLinkFallbackBinding,
  cleanupDeletedDeepLinkFallbackBinding,
  cleanupReplacedDeepLinkFallbackBinding,
} from '@/lib/server/fallback-binding-hooks'

export const DeepLinks: CollectionConfig = {
  slug: 'deep-links',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'app', 'slug', 'status', 'updatedAt'],
  },
  access: {
    create: canManageAccess,
    delete: appScopedManageAccess,
    read: appScopedReadAccess,
    update: appScopedManageAccess,
  },
  indexes: [
    {
      fields: ['app', 'slug'],
      unique: true,
    },
    {
      fields: ['app', 'status'],
    },
  ],
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 160,
    },
    {
      name: 'app',
      type: 'relationship',
      relationTo: 'apps',
      required: true,
      index: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      maxLength: 120,
      validate: validateSlug,
      hooks: {
        beforeValidate: [({ value }) => normalizeSlug(value)],
      },
    },
    {
      name: 'destinationPath',
      type: 'text',
      required: true,
      maxLength: 2048,
      validate: validateDestinationPath,
    },
    {
      name: 'parameters',
      type: 'json',
      validate: validateParameters,
    },
    {
      name: 'fallbackUrl',
      type: 'text',
      validate: validateHttpsURL,
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
      name: 'expiresAt',
      type: 'date',
      index: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    ...platformSuspensionFields,
  ],
  hooks: {
    afterChange: [cleanupReplacedDeepLinkFallbackBinding],
    afterDelete: [cleanupDeletedDeepLinkFallbackBinding],
    beforeValidate: [
      enforcePlatformSuspensionFields,
      enforceAppScope,
      enforceDeepLinkFallbackHost,
      applyDeepLinkFallbackBinding,
      enforceDeepLinkLifecycle,
      enforceSavedLinkQuota,
      enforceActiveLinkQuota,
    ],
  },
}
