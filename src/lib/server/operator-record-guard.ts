import type { CollectionBeforeValidateHook } from 'payload'
import { APIError } from 'payload'

import { isPlatformSuperAdmin } from './tenant-context'

export const enforcePlatformOperatorOnly: CollectionBeforeValidateHook = ({ data, req }) => {
  if (req.user && !isPlatformSuperAdmin(req)) {
    throw new APIError('This record is restricted to Relay platform operators.', 403)
  }
  return data
}
