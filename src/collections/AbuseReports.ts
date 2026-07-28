import type { CollectionConfig } from 'payload'

import { internalMutationAccess, superAdminAccess } from '@/lib/server/access'
import { enforcePlatformOperatorOnly } from '@/lib/server/operator-record-guard'

export const AbuseReports: CollectionConfig = {
  slug: 'abuse-reports',
  admin: {
    useAsTitle: 'submissionHash',
    defaultColumns: ['category', 'targetHostname', 'receivedAt', 'status'],
  },
  access: {
    create: internalMutationAccess,
    delete: internalMutationAccess,
    read: superAdminAccess,
    update: internalMutationAccess,
  },
  fields: [
    {
      name: 'category',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Malware', value: 'malware' },
        { label: 'Phishing', value: 'phishing' },
        { label: 'Spam', value: 'spam' },
        { label: 'Impersonation', value: 'impersonation' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      name: 'targetHostname',
      type: 'text',
      required: true,
      index: true,
      maxLength: 253,
    },
    {
      name: 'targetPath',
      type: 'text',
      maxLength: 512,
    },
    {
      name: 'details',
      type: 'textarea',
      required: true,
      maxLength: 4_000,
    },
    {
      name: 'reporterContact',
      type: 'email',
    },
    {
      name: 'reporterKeyHash',
      type: 'text',
      required: true,
      index: true,
      minLength: 64,
      maxLength: 64,
    },
    {
      name: 'userAgentHash',
      type: 'text',
      minLength: 64,
      maxLength: 64,
    },
    {
      name: 'submissionHash',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      minLength: 64,
      maxLength: 64,
    },
    {
      name: 'receivedAt',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'received',
      index: true,
      options: [
        { label: 'Received', value: 'received' },
        { label: 'Triaged', value: 'triaged' },
        { label: 'Attached to case', value: 'attached-to-case' },
        { label: 'Closed', value: 'closed' },
      ],
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
      name: 'evidenceSnapshot',
      type: 'json',
      required: true,
      admin: {
        description: 'Bounded identifiers captured at intake; no raw client IP is retained.',
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeValidate: [enforcePlatformOperatorOnly],
  },
  timestamps: false,
}
