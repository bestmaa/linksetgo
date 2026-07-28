import type { CollectionConfig } from 'payload'

import { internalMutationAccess, superAdminAccess } from '@/lib/server/access'
import { enforcePlatformOperatorOnly } from '@/lib/server/operator-record-guard'

export const AbuseCaseEvents: CollectionConfig = {
  slug: 'abuse-case-events',
  admin: {
    useAsTitle: 'summary',
    defaultColumns: ['abuseCase', 'eventType', 'occurredAt', 'actor'],
  },
  access: {
    create: internalMutationAccess,
    delete: internalMutationAccess,
    read: superAdminAccess,
    update: internalMutationAccess,
  },
  fields: [
    {
      name: 'abuseCase',
      type: 'relationship',
      relationTo: 'abuse-cases',
      required: true,
      index: true,
    },
    {
      name: 'eventType',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Opened', value: 'opened' },
        { label: 'Note', value: 'note' },
        { label: 'Status changed', value: 'status-changed' },
        { label: 'Resource suspended', value: 'resource-suspended' },
        { label: 'Resource restored', value: 'resource-restored' },
      ],
    },
    {
      name: 'summary',
      type: 'text',
      required: true,
      maxLength: 500,
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'enforcementEvent',
      type: 'relationship',
      relationTo: 'enforcement-events',
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
