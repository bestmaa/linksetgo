import type { CollectionConfig } from 'payload'

import {
  membershipCreateAccess,
  membershipDeleteAccess,
  membershipManageAccess,
  membershipReadAccess,
} from '@/lib/server/access'
import { enforceMembershipScope } from '@/lib/server/tenant-guards'
import { enforceMemberQuota } from '@/lib/server/quota-enforcement'
import {
  protectOrganizationMembershipDelete,
  protectOrganizationMembershipUpdate,
} from '@/lib/server/membership-owner-guards'

export const OrganizationMemberships: CollectionConfig = {
  slug: 'organization-memberships',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['organization', 'user', 'role', 'status', 'updatedAt'],
  },
  access: {
    create: membershipCreateAccess,
    delete: membershipDeleteAccess,
    read: membershipReadAccess,
    update: membershipManageAccess,
  },
  indexes: [
    {
      fields: ['organization', 'user'],
      unique: true,
    },
    {
      fields: ['organization', 'status'],
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
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'member',
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
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Disabled', value: 'disabled' },
      ],
    },
  ],
  hooks: {
    beforeDelete: [protectOrganizationMembershipDelete],
    beforeValidate: [
      enforceMembershipScope,
      protectOrganizationMembershipUpdate,
      enforceMemberQuota,
    ],
  },
}
