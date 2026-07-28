import type { CollectionConfig } from 'payload'

import {
  workspaceCreateAccess,
  workspaceManageAccess,
  workspaceOwnerAccess,
  workspaceReadAccess,
} from '@/lib/server/access'
import { enforceWorkspaceOrganizationScope } from '@/lib/server/tenant-guards'
import { normalizeSlug, validateSlug } from './validators'
import {
  enforcePlatformSuspensionFields,
  platformSuspensionFields,
} from '@/lib/server/platform-suspension'

export const Workspaces: CollectionConfig = {
  slug: 'workspaces',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'organization', 'status', 'updatedAt'],
  },
  access: {
    create: workspaceCreateAccess,
    delete: workspaceOwnerAccess,
    read: workspaceReadAccess,
    update: workspaceManageAccess,
  },
  fields: [
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      required: true,
      index: true,
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
    beforeValidate: [enforcePlatformSuspensionFields, enforceWorkspaceOrganizationScope],
  },
}
