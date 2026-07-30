import type { CollectionBeforeOperationHook, CollectionBeforeValidateHook } from 'payload'
import { APIError } from 'payload'

import {
  ACCOUNT_PASSWORD_REQUIREMENTS,
  isStrongAccountPassword,
} from '@/lib/domain/account-password'
import type { User } from '@/payload-types'
import { isSuperAdminRequest } from './access'

const normalizedEmail = (value: string): string => value.trim().toLowerCase()

export const enforceUserPasswordResetPolicy: CollectionBeforeOperationHook<'users'> = ({
  args,
  operation,
}) => {
  if (operation !== 'resetPassword') return args
  if (!isStrongAccountPassword(args.data.password)) {
    throw new APIError(ACCOUNT_PASSWORD_REQUIREMENTS, 400)
  }
  return args
}

export const enforceUserCredentialPolicy: CollectionBeforeValidateHook<User> = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data

  const credentialData = data as Record<string, unknown>
  if (Object.hasOwn(credentialData, 'password')) {
    if (operation === 'update' && req.user && !isSuperAdminRequest(req)) {
      throw new APIError(
        'Password changes are not available from the generic user API. Use account recovery.',
        403,
      )
    }
    if (!isStrongAccountPassword(credentialData.password)) {
      throw new APIError(ACCOUNT_PASSWORD_REQUIREMENTS, 400)
    }
  }

  if (
    operation !== 'update' ||
    typeof data.email !== 'string' ||
    normalizedEmail(data.email) === normalizedEmail(originalDoc?.email ?? '') ||
    // Local application services run without an authenticated actor. Their explicit
    // overrideAccess boundary remains available for future verified-email workflows.
    !req.user ||
    isSuperAdminRequest(req)
  ) {
    return data
  }

  throw new APIError(
    'Email changes require verification and are not available from the generic user API.',
    403,
  )
}
