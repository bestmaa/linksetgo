import type { CollectionConfig } from 'payload'

import {
  organizationManageAccess,
  organizationReadAccess,
  superAdminAccess,
} from '@/lib/server/access'
import { normalizeSlug, validateSlug } from './validators'
import {
  enforcePlatformSuspensionFields,
  platformSuspensionFields,
} from '@/lib/server/platform-suspension'

export const Organizations: CollectionConfig = {
  slug: 'organizations',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'status', 'updatedAt'],
  },
  access: {
    create: superAdminAccess,
    delete: superAdminAccess,
    read: organizationReadAccess,
    update: organizationManageAccess,
  },
  fields: [
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
      unique: true,
      index: true,
      maxLength: 80,
      validate: validateSlug,
      hooks: {
        beforeValidate: [({ value }) => normalizeSlug(value)],
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Pending verification', value: 'pending-verification' },
        { label: 'Suspended', value: 'suspended' },
      ],
    },
    ...platformSuspensionFields,
  ],
  hooks: {
    beforeValidate: [enforcePlatformSuspensionFields],
  },
}
