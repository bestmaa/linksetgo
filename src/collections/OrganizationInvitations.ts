import type { CollectionConfig } from 'payload'

import {
  internalMutationAccess,
  superAdminAccess,
  superAdminFieldAccess,
} from '@/lib/server/access'
import { enforcePrivateTeamInvitationWrite } from '@/lib/server/team-invitation-guards'

export const OrganizationInvitations: CollectionConfig = {
  slug: 'organization-invitations',
  admin: {
    useAsTitle: 'emailNormalized',
    defaultColumns: ['emailNormalized', 'organization', 'role', 'status', 'expiresAt'],
  },
  access: {
    create: internalMutationAccess,
    delete: internalMutationAccess,
    read: superAdminAccess,
    update: internalMutationAccess,
  },
  indexes: [
    {
      fields: ['organization', 'status', 'expiresAt'],
    },
    {
      fields: ['organization', 'emailNormalized', 'status'],
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
      name: 'emailNormalized',
      type: 'email',
      required: true,
      index: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Owner', value: 'owner' },
        { label: 'Admin', value: 'admin' },
        { label: 'Member', value: 'member' },
        { label: 'Viewer', value: 'viewer' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Accepted', value: 'accepted' },
        { label: 'Revoked', value: 'revoked' },
      ],
    },
    {
      name: 'tokenHash',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      minLength: 64,
      maxLength: 64,
      hidden: true,
      access: {
        create: superAdminFieldAccess,
        read: superAdminFieldAccess,
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'deliveryMode',
      type: 'select',
      required: true,
      options: [
        { label: 'Webhook', value: 'webhook' },
        { label: 'Manual', value: 'manual' },
      ],
    },
    {
      name: 'deliveredAt',
      type: 'date',
    },
    {
      name: 'acceptedAt',
      type: 'date',
    },
    {
      name: 'revokedAt',
      type: 'date',
    },
    {
      name: 'invitedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'acceptedBy',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
  ],
  hooks: {
    beforeValidate: [enforcePrivateTeamInvitationWrite],
  },
}
