import type { CollectionConfig } from 'payload'

import {
  appScopedManageAccess,
  appScopedReadAccess,
  canManageAccess,
  enforceAppScope,
} from '@/lib/server/access'
import { enforceVerificationLinkApp } from '@/lib/server/collection-guards'

export const VerificationRuns: CollectionConfig = {
  slug: 'verification-runs',
  admin: {
    useAsTitle: 'kind',
    defaultColumns: ['kind', 'app', 'status', 'startedAt', 'finishedAt'],
  },
  access: {
    create: canManageAccess,
    delete: appScopedManageAccess,
    read: appScopedReadAccess,
    update: appScopedManageAccess,
  },
  indexes: [
    {
      fields: ['app', 'startedAt'],
    },
  ],
  fields: [
    {
      name: 'app',
      type: 'relationship',
      relationTo: 'apps',
      required: true,
      index: true,
    },
    {
      name: 'link',
      type: 'relationship',
      relationTo: 'deep-links',
      index: true,
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Association files', value: 'association' },
        { label: 'Deep link', value: 'deep-link' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      index: true,
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Running', value: 'running' },
        { label: 'Passed', value: 'passed' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'checks',
      type: 'json',
    },
    {
      name: 'startedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
    },
    {
      name: 'finishedAt',
      type: 'date',
    },
    {
      name: 'initiatedBy',
      type: 'relationship',
      relationTo: 'users',
    },
  ],
  hooks: {
    beforeValidate: [enforceAppScope, enforceVerificationLinkApp],
  },
}
