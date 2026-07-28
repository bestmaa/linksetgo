import type { CollectionConfig } from 'payload'

import {
  billingTenantReadAccess,
  internalMutationAccess,
  superAdminFieldAccess,
} from '@/lib/server/access'

export const Subscriptions: CollectionConfig = {
  slug: 'subscriptions',
  admin: {
    useAsTitle: 'providerSubscriptionID',
    defaultColumns: ['organization', 'plan', 'status', 'currentPeriodEnd', 'updatedAt'],
  },
  access: {
    create: internalMutationAccess,
    delete: internalMutationAccess,
    read: billingTenantReadAccess,
    update: internalMutationAccess,
  },
  indexes: [
    {
      fields: ['status', 'currentPeriodEnd'],
    },
  ],
  fields: [
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      required: true,
      index: true,
      unique: true,
    },
    {
      name: 'plan',
      type: 'select',
      required: true,
      defaultValue: 'free',
      index: true,
      options: [
        { label: 'Free', value: 'free' },
        { label: 'Starter', value: 'starter' },
        { label: 'Pro', value: 'pro' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Trialing', value: 'trialing' },
        { label: 'Past due', value: 'past-due' },
        { label: 'Paused', value: 'paused' },
        { label: 'Canceled', value: 'canceled' },
      ],
    },
    {
      name: 'provider',
      type: 'text',
      required: true,
      maxLength: 64,
      access: {
        read: superAdminFieldAccess,
      },
    },
    {
      name: 'providerCustomerID',
      type: 'text',
      index: true,
      maxLength: 255,
      access: {
        read: superAdminFieldAccess,
      },
    },
    {
      name: 'providerSubscriptionID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      maxLength: 255,
      access: {
        read: superAdminFieldAccess,
      },
    },
    {
      name: 'currentPeriodEnd',
      type: 'date',
      index: true,
    },
    {
      name: 'graceEndsAt',
      type: 'date',
      index: true,
    },
    {
      name: 'lastEventAt',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'lastProviderEventID',
      type: 'text',
      required: true,
      maxLength: 255,
      access: {
        read: superAdminFieldAccess,
      },
    },
    {
      name: 'catalogVersion',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 1,
    },
  ],
}
