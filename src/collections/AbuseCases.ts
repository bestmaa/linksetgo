import type { CollectionConfig } from 'payload'

import { internalMutationAccess, superAdminAccess } from '@/lib/server/access'
import { enforcePlatformOperatorOnly } from '@/lib/server/operator-record-guard'

export const AbuseCases: CollectionConfig = {
  slug: 'abuse-cases',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'severity', 'status', 'openedAt', 'assignedTo'],
  },
  access: {
    create: internalMutationAccess,
    delete: internalMutationAccess,
    read: superAdminAccess,
    update: internalMutationAccess,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 200,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'open',
      index: true,
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Investigating', value: 'investigating' },
        { label: 'Actioned', value: 'actioned' },
        { label: 'Closed', value: 'closed' },
      ],
    },
    {
      name: 'severity',
      type: 'select',
      required: true,
      defaultValue: 'medium',
      index: true,
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
        { label: 'Critical', value: 'critical' },
      ],
    },
    {
      name: 'primaryReport',
      type: 'relationship',
      relationTo: 'abuse-reports',
      index: true,
    },
    {
      name: 'workspace',
      type: 'relationship',
      relationTo: 'workspaces',
      index: true,
    },
    {
      name: 'domain',
      type: 'relationship',
      relationTo: 'domains',
      index: true,
    },
    {
      name: 'app',
      type: 'relationship',
      relationTo: 'apps',
      index: true,
    },
    {
      name: 'link',
      type: 'relationship',
      relationTo: 'deep-links',
      index: true,
    },
    {
      name: 'assignedTo',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
    {
      name: 'openedAt',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'closedAt',
      type: 'date',
      index: true,
    },
    {
      name: 'resolution',
      type: 'textarea',
      maxLength: 4_000,
    },
  ],
  hooks: {
    beforeValidate: [enforcePlatformOperatorOnly],
  },
  timestamps: true,
}
