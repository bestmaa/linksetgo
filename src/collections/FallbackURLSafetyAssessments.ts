import type { CollectionConfig, JSONFieldValidation, NumberFieldValidation } from 'payload'

import {
  domainReadAccess,
  internalMutationAccess,
  superAdminFieldAccess,
} from '@/lib/server/access'
import { fallbackURLThreats } from '@/lib/domain/fallback-url-safety'
import { enforceFallbackURLSafetyAssessment } from '@/lib/server/fallback-url-safety-guards'

const validateRedirectCount: NumberFieldValidation = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10)
    ? true
    : 'Redirect count must be an integer between 0 and 10.'

const validateEvidence: JSONFieldValidation = (value) => {
  if (value === null || value === undefined) return true
  if (typeof value !== 'object' || Array.isArray(value)) {
    return 'Safety evidence must be one object.'
  }
  return JSON.stringify(value).length <= 8_192 ? true : 'Safety evidence is too large.'
}

export const FallbackURLSafetyAssessments: CollectionConfig = {
  slug: 'fallback-url-safety-assessments',
  admin: {
    hidden: true,
    useAsTitle: 'hostname',
  },
  access: {
    create: internalMutationAccess,
    delete: internalMutationAccess,
    read: domainReadAccess,
    update: internalMutationAccess,
  },
  indexes: [
    {
      fields: ['workspace', 'urlHash'],
      unique: true,
    },
    {
      fields: ['status', 'expiresAt'],
    },
    {
      fields: ['origin', 'status'],
    },
    {
      fields: ['status', 'claimExpiresAt'],
    },
    {
      fields: ['status', 'checkedAt'],
    },
  ],
  fields: [
    {
      name: 'workspace',
      type: 'relationship',
      relationTo: 'workspaces',
      required: true,
      index: true,
    },
    {
      name: 'origin',
      type: 'relationship',
      relationTo: 'fallback-origins',
      required: true,
      index: true,
    },
    {
      name: 'canonicalUrl',
      type: 'text',
      required: true,
      maxLength: 2_048,
    },
    {
      name: 'hostname',
      type: 'text',
      required: true,
      index: true,
      maxLength: 253,
      admin: { readOnly: true },
    },
    {
      name: 'urlHash',
      type: 'text',
      required: true,
      index: true,
      maxLength: 64,
      access: { read: superAdminFieldAccess },
      admin: { readOnly: true },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Checking', value: 'checking' },
        { label: 'Safe', value: 'safe' },
        { label: 'Unsafe', value: 'unsafe' },
        { label: 'Error', value: 'error' },
      ],
    },
    {
      name: 'checkedAt',
      type: 'date',
      index: true,
    },
    {
      name: 'expiresAt',
      type: 'date',
      index: true,
    },
    {
      name: 'providerObservedAt',
      type: 'date',
      access: { read: superAdminFieldAccess },
    },
    {
      name: 'claimToken',
      type: 'text',
      maxLength: 128,
      access: { read: superAdminFieldAccess },
      admin: { readOnly: true },
    },
    {
      name: 'claimExpiresAt',
      type: 'date',
      index: true,
      access: { read: superAdminFieldAccess },
      admin: { readOnly: true },
    },
    {
      name: 'lastAttemptAt',
      type: 'date',
      index: true,
      access: { read: superAdminFieldAccess },
      admin: { readOnly: true },
    },
    {
      name: 'redirectCount',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      max: 10,
      validate: validateRedirectCount,
    },
    {
      name: 'threats',
      type: 'select',
      hasMany: true,
      options: fallbackURLThreats.map((value) => ({
        label: value.replaceAll('-', ' '),
        value,
      })),
    },
    {
      name: 'lastError',
      type: 'textarea',
      maxLength: 500,
      access: { read: superAdminFieldAccess },
    },
    {
      name: 'evidence',
      type: 'json',
      validate: validateEvidence,
      access: { read: superAdminFieldAccess },
    },
  ],
  hooks: {
    beforeValidate: [enforceFallbackURLSafetyAssessment],
  },
}
