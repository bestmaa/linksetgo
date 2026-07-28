import { APIError, type CollectionBeforeValidateHook } from 'payload'

import { normalizeTeamEmail } from '@/lib/domain/team-invitations'

export const TEAM_INVITATION_WRITE_CONTEXT = 'relayTeamInvitationWrite'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const enforcePrivateTeamInvitationWrite: CollectionBeforeValidateHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (req.context[TEAM_INVITATION_WRITE_CONTEXT] !== true) {
    throw new APIError('Team invitations can be changed only through the invitation service.', 403)
  }

  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const email = normalizeTeamEmail(
    Object.hasOwn(next, 'emailNormalized') ? next.emailNormalized : previous.emailNormalized,
  )
  if (!email) throw new APIError('A normalized invitation email is required.', 400)

  if (
    operation === 'update' &&
    ['emailNormalized', 'invitedBy', 'organization', 'role', 'tokenHash'].some(
      (field) => Object.hasOwn(next, field) && next[field] !== previous[field],
    )
  ) {
    throw new APIError('Invitation identity fields are permanent.', 409)
  }

  return { ...next, emailNormalized: email }
}
