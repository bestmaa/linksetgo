import type { CollectionConfig } from 'payload'

import { appScopedReadAccess } from '@/lib/server/access'
import { validateHostname } from './validators'

export const LinkEvents: CollectionConfig = {
  slug: 'link-events',
  admin: {
    useAsTitle: 'eventType',
    defaultColumns: ['eventType', 'link', 'app', 'platform', 'occurredAt'],
  },
  access: {
    create: () => false,
    delete: () => false,
    read: appScopedReadAccess,
    update: () => false,
  },
  indexes: [
    {
      fields: ['link', 'occurredAt'],
    },
    {
      fields: ['app', 'occurredAt'],
    },
    {
      fields: ['sessionHash', 'occurredAt'],
    },
  ],
  fields: [
    {
      name: 'link',
      type: 'relationship',
      relationTo: 'deep-links',
      required: true,
      index: true,
    },
    {
      name: 'app',
      type: 'relationship',
      relationTo: 'apps',
      required: true,
      index: true,
    },
    {
      name: 'eventType',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Resolved', value: 'resolved' },
        { label: 'Fallback viewed', value: 'fallback-viewed' },
        { label: 'Open app clicked', value: 'open-app-clicked' },
        { label: 'Store clicked', value: 'store-clicked' },
        { label: 'App opened', value: 'app-opened' },
      ],
    },
    {
      name: 'platform',
      type: 'select',
      required: true,
      defaultValue: 'unknown',
      options: [
        { label: 'iOS', value: 'ios' },
        { label: 'Android', value: 'android' },
        { label: 'Web', value: 'web' },
        { label: 'Unknown', value: 'unknown' },
      ],
    },
    {
      name: 'hostname',
      type: 'text',
      index: true,
      maxLength: 253,
      validate: validateHostname,
    },
    {
      name: 'sessionHash',
      type: 'text',
      maxLength: 128,
      access: {
        read: () => false,
      },
    },
    {
      name: 'referrer',
      type: 'text',
      maxLength: 2048,
      access: {
        read: () => false,
      },
    },
    {
      name: 'userAgent',
      type: 'textarea',
      maxLength: 1024,
      access: {
        read: () => false,
      },
    },
    {
      name: 'metadata',
      type: 'json',
      access: {
        read: () => false,
      },
    },
    {
      name: 'occurredAt',
      type: 'date',
      required: true,
      index: true,
      defaultValue: () => new Date().toISOString(),
    },
  ],
}
