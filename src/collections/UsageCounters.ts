import type { CollectionConfig } from 'payload'

import { billingTenantReadAccess, internalMutationAccess } from '@/lib/server/access'

export const UsageCounters: CollectionConfig = {
  slug: 'usage-counters',
  admin: {
    useAsTitle: 'periodStart',
    defaultColumns: ['organization', 'metric', 'periodStart', 'count', 'updatedAt'],
  },
  access: {
    create: internalMutationAccess,
    delete: internalMutationAccess,
    read: billingTenantReadAccess,
    update: internalMutationAccess,
  },
  indexes: [
    {
      fields: ['organization', 'metric', 'periodStart'],
      unique: true,
    },
  ],
  fields: [
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      required: true,
      index: true,
    },
    {
      name: 'metric',
      type: 'select',
      required: true,
      defaultValue: 'monthly-resolutions',
      options: [{ label: 'Monthly resolutions', value: 'monthly-resolutions' }],
    },
    {
      name: 'periodStart',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'count',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
    },
  ],
}
