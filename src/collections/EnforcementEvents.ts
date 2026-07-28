import type { CollectionConfig } from 'payload'

import { internalMutationAccess, superAdminAccess } from '@/lib/server/access'
import { enforcePlatformOperatorOnly } from '@/lib/server/operator-record-guard'

export const EnforcementEvents: CollectionConfig = {
  slug: 'enforcement-events',
  admin: {
    useAsTitle: 'resourceID',
    defaultColumns: ['resourceType', 'resourceID', 'action', 'occurredAt', 'actor'],
  },
  access: {
    create: internalMutationAccess,
    delete: internalMutationAccess,
    read: superAdminAccess,
    update: internalMutationAccess,
  },
  fields: [
    {
      name: 'resourceType',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Organization', value: 'organization' },
        { label: 'Workspace', value: 'workspace' },
        { label: 'Domain', value: 'domain' },
        { label: 'App', value: 'app' },
        { label: 'Link', value: 'link' },
      ],
    },
    {
      name: 'resourceID',
      type: 'text',
      required: true,
      index: true,
      maxLength: 128,
    },
    {
      name: 'action',
      type: 'select',
      required: true,
      options: [
        { label: 'Suspend', value: 'suspend' },
        { label: 'Restore', value: 'restore' },
      ],
    },
    {
      name: 'previousSuspended',
      type: 'checkbox',
      required: true,
    },
    {
      name: 'reason',
      type: 'textarea',
      required: true,
      maxLength: 1_000,
    },
    {
      name: 'abuseCase',
      type: 'relationship',
      relationTo: 'abuse-cases',
      index: true,
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'occurredAt',
      type: 'date',
      required: true,
      index: true,
    },
  ],
  hooks: {
    beforeValidate: [enforcePlatformOperatorOnly],
  },
  timestamps: false,
}
