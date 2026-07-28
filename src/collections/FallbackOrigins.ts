import type { CollectionConfig, FieldAccess, JSONFieldValidation } from 'payload'

import {
  domainCreateAccess,
  domainManageAccess,
  domainReadAccess,
  internalMutationAccess,
} from '@/lib/server/access'
import {
  enforceFallbackOriginLifecycle,
  fallbackOriginVerificationToken,
} from '@/lib/server/fallback-origin-lifecycle'

const immutableField: FieldAccess = () => false
const validateEvidence: JSONFieldValidation = (value) => {
  if (value === null || value === undefined) return true
  if (typeof value !== 'object' || Array.isArray(value)) return 'DNS evidence must be an object.'
  return JSON.stringify(value).length <= 20_000 ? true : 'DNS evidence is too large.'
}

export const FallbackOrigins: CollectionConfig = {
  slug: 'fallback-origins',
  admin: {
    useAsTitle: 'hostname',
    defaultColumns: ['hostname', 'workspace', 'status', 'verifiedAt', 'updatedAt'],
  },
  access: {
    create: domainCreateAccess,
    delete: internalMutationAccess,
    read: domainReadAccess,
    update: domainManageAccess,
  },
  fields: [
    {
      name: 'workspace',
      type: 'relationship',
      relationTo: 'workspaces',
      required: true,
      index: true,
    },
    {
      name: 'hostname',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      maxLength: 253,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      access: { update: immutableField },
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Verifying', value: 'verifying' },
        { label: 'Verified', value: 'verified' },
        { label: 'Revoked', value: 'revoked' },
      ],
    },
    {
      name: 'verificationToken',
      type: 'text',
      required: true,
      defaultValue: fallbackOriginVerificationToken,
      maxLength: 128,
      access: { create: immutableField, update: immutableField },
      admin: {
        description: 'Publish the generated TXT challenge to prove hostname ownership.',
        readOnly: true,
      },
    },
    {
      name: 'lastCheckedAt',
      type: 'date',
      access: { update: immutableField },
    },
    {
      name: 'verifiedAt',
      type: 'date',
      access: { update: immutableField },
    },
    {
      name: 'revokedAt',
      type: 'date',
      access: { update: immutableField },
    },
    {
      name: 'lastVerificationError',
      type: 'text',
      maxLength: 500,
      access: { update: immutableField },
    },
    {
      name: 'lastEvidence',
      type: 'json',
      validate: validateEvidence,
      access: { update: immutableField },
      admin: {
        description:
          'Bounded, provider-neutral DNS evidence hashes; raw TXT values are not stored.',
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeValidate: [enforceFallbackOriginLifecycle],
  },
}
