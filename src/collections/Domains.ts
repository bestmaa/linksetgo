import { randomBytes } from 'node:crypto'

import type { CollectionConfig, FieldAccess, FieldHook, TextFieldValidation } from 'payload'

import {
  domainCreateAccess,
  domainManageAccess,
  domainOwnerAccess,
  domainReadAccess,
  superAdminFieldAccess,
} from '@/lib/server/access'
import { enforceDomainLifecycle } from '@/lib/server/domain-guards'
import { enforceDomainWorkspaceScope } from '@/lib/server/tenant-guards'
import { enforceCustomDomainQuota } from '@/lib/server/quota-enforcement'
import { normalizeHostname } from '@/lib/domain/workspace-domain'
import {
  enforcePlatformSuspensionFields,
  platformSuspensionFields,
} from '@/lib/server/platform-suspension'
import { validateHostname } from './validators'

const immutableFieldAccess: FieldAccess = () => false
const normalizeHostnameField: FieldHook = ({ value }) => normalizeHostname(value) ?? value
const validateVerificationToken: TextFieldValidation = (value) =>
  !value || (value.length >= 24 && /^[A-Za-z0-9_-]+$/.test(value))
    ? true
    : 'Verification tokens must be 24 to 128 URL-safe characters.'

export const Domains: CollectionConfig = {
  slug: 'domains',
  admin: {
    useAsTitle: 'hostname',
    defaultColumns: ['hostname', 'type', 'workspace', 'status', 'updatedAt'],
  },
  access: {
    create: domainCreateAccess,
    delete: domainOwnerAccess,
    read: domainReadAccess,
    update: domainManageAccess,
  },
  indexes: [
    {
      fields: ['workspace', 'status'],
    },
    {
      fields: ['type', 'status'],
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
      name: 'hostname',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      maxLength: 253,
      validate: validateHostname,
      hooks: {
        beforeValidate: [normalizeHostnameField],
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'custom',
      options: [
        { label: 'Managed', value: 'managed' },
        { label: 'Custom', value: 'custom' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending-dns',
      index: true,
      access: {
        update: superAdminFieldAccess,
      },
      options: [
        { label: 'Pending DNS', value: 'pending-dns' },
        { label: 'Verifying', value: 'verifying' },
        { label: 'Certificate ready', value: 'certificate-ready' },
        { label: 'Association incomplete', value: 'association-incomplete' },
        { label: 'Active', value: 'active' },
        { label: 'Suspended', value: 'suspended' },
      ],
    },
    {
      name: 'verificationToken',
      type: 'text',
      required: true,
      defaultValue: () => randomBytes(32).toString('base64url'),
      maxLength: 128,
      validate: validateVerificationToken,
      access: {
        update: immutableFieldAccess,
      },
      admin: {
        description: 'Public DNS ownership challenge. Rotate by registering a new domain.',
        readOnly: true,
      },
    },
    {
      name: 'dnsVerifiedAt',
      type: 'date',
      access: {
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'cnameVerifiedAt',
      type: 'date',
      access: {
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'tlsReadyAt',
      type: 'date',
      access: {
        update: superAdminFieldAccess,
      },
      admin: {
        description: 'Set only after the configured ingress reports certificate readiness.',
      },
    },
    {
      name: 'tlsCertificateRef',
      type: 'text',
      maxLength: 255,
      access: {
        read: superAdminFieldAccess,
        update: superAdminFieldAccess,
      },
      admin: {
        description: 'Opaque certificate-provider reference. Never exposed in tenant APIs.',
        readOnly: true,
      },
    },
    {
      name: 'tlsRenewsAt',
      type: 'date',
      access: {
        read: superAdminFieldAccess,
        update: superAdminFieldAccess,
      },
      admin: {
        description: 'Provider-reported certificate renewal instant.',
        readOnly: true,
      },
    },
    {
      name: 'associationsVerifiedAt',
      type: 'date',
      access: {
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'activatedAt',
      type: 'date',
      access: {
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'lastCheckedAt',
      type: 'date',
      access: {
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'lastVerificationError',
      type: 'text',
      maxLength: 500,
      access: {
        update: superAdminFieldAccess,
      },
    },
    ...platformSuspensionFields,
  ],
  hooks: {
    beforeValidate: [
      enforcePlatformSuspensionFields,
      enforceDomainWorkspaceScope,
      enforceDomainLifecycle,
      enforceCustomDomainQuota,
    ],
  },
}
