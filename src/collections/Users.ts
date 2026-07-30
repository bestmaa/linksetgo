import type { CollectionConfig } from 'payload'
import { AuthenticationError } from 'payload'

import {
  selfOrSuperAdminAccess,
  superAdminAccess,
  superAdminFieldAccess,
  isSuperAdminRequest,
} from '@/lib/server/access'
import {
  applyNewUserPolicy,
  isCloudSignupRequest,
  isTeamInvitationUserRequest,
} from '@/lib/server/user-creation-policy'
import {
  enforceUserCredentialPolicy,
  enforceUserPasswordResetPolicy,
} from '@/lib/server/user-credential-policy'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  access: {
    admin: ({ req }) => isSuperAdminRequest(req),
    create: superAdminAccess,
    delete: superAdminAccess,
    read: selfOrSuperAdminAccess,
    unlock: superAdminAccess,
    update: selfOrSuperAdminAccess,
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 120,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'admin',
      saveToJWT: true,
      options: [
        { label: 'Super admin', value: 'super-admin' },
        { label: 'Admin', value: 'admin' },
        { label: 'Viewer', value: 'viewer' },
      ],
      access: {
        create: superAdminFieldAccess,
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      saveToJWT: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Pending verification', value: 'pending-verification' },
        { label: 'Disabled', value: 'disabled' },
      ],
      access: {
        create: superAdminFieldAccess,
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'allowedApps',
      type: 'relationship',
      relationTo: 'apps',
      hasMany: true,
      saveToJWT: true,
      access: {
        create: superAdminFieldAccess,
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'emailVerificationTokenHash',
      type: 'text',
      unique: true,
      index: true,
      maxLength: 64,
      hidden: true,
      access: {
        create: superAdminFieldAccess,
        read: superAdminFieldAccess,
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'emailVerificationExpiresAt',
      type: 'date',
      hidden: true,
      access: {
        create: superAdminFieldAccess,
        read: superAdminFieldAccess,
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'passwordResetTokenHash',
      type: 'text',
      unique: true,
      index: true,
      maxLength: 64,
      hidden: true,
      access: {
        create: superAdminFieldAccess,
        read: superAdminFieldAccess,
        update: superAdminFieldAccess,
      },
    },
    {
      name: 'passwordResetExpiresAt',
      type: 'date',
      index: true,
      hidden: true,
      access: {
        create: superAdminFieldAccess,
        read: superAdminFieldAccess,
        update: superAdminFieldAccess,
      },
    },
  ],
  hooks: {
    beforeLogin: [
      ({ req, user }) => {
        if (user.status !== 'active') throw new AuthenticationError(req.t)
        return user
      },
    ],
    beforeOperation: [enforceUserPasswordResetPolicy],
    beforeValidate: [
      enforceUserCredentialPolicy,
      async ({ data, operation, req }) => {
        if (operation !== 'create' || !data) return data

        const existingUsers = await req.payload.count({
          collection: 'users',
          overrideAccess: true,
          req,
        })

        return applyNewUserPolicy(data, {
          existingUsers: existingUsers.totalDocs,
          isCloudSignup: isCloudSignupRequest(req),
          isTeamInvitation: isTeamInvitationUserRequest(req),
        })
      },
    ],
  },
}
