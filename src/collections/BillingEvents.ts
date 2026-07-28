import type { CollectionConfig } from 'payload'

import { internalMutationAccess, superAdminAccess } from '@/lib/server/access'

export const BillingEvents: CollectionConfig = {
  slug: 'billing-events',
  admin: {
    useAsTitle: 'providerEventID',
    defaultColumns: ['providerEventID', 'organization', 'outcome', 'occurredAt', 'createdAt'],
  },
  access: {
    create: internalMutationAccess,
    delete: internalMutationAccess,
    read: superAdminAccess,
    update: internalMutationAccess,
  },
  indexes: [
    {
      fields: ['organization', 'occurredAt'],
    },
    {
      fields: ['providerSubscriptionID', 'occurredAt'],
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
      name: 'provider',
      type: 'text',
      required: true,
      maxLength: 64,
    },
    {
      name: 'providerEventID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      maxLength: 255,
    },
    {
      name: 'providerSubscriptionID',
      type: 'text',
      required: true,
      index: true,
      maxLength: 255,
    },
    {
      name: 'occurredAt',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'receivedAt',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'payloadHash',
      type: 'text',
      required: true,
      maxLength: 64,
      minLength: 64,
    },
    {
      name: 'plan',
      type: 'select',
      required: true,
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
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Trialing', value: 'trialing' },
        { label: 'Past due', value: 'past-due' },
        { label: 'Paused', value: 'paused' },
        { label: 'Canceled', value: 'canceled' },
      ],
    },
    {
      name: 'outcome',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Applied', value: 'applied' },
        { label: 'Stale', value: 'stale' },
      ],
    },
  ],
}
