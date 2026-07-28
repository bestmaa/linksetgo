import type { PayloadRequest } from 'payload'

export const CLOUD_SIGNUP_CONTEXT_KEY = 'relayCloudSignup'
export const TEAM_INVITATION_USER_CONTEXT_KEY = 'relayTeamInvitationUser'

export type NewUserPolicyData = {
  role?: unknown
  status?: unknown
  [key: string]: unknown
}

export function isCloudSignupRequest(req: Pick<PayloadRequest, 'context'>): boolean {
  return req.context[CLOUD_SIGNUP_CONTEXT_KEY] === true
}

export function isTeamInvitationUserRequest(req: Pick<PayloadRequest, 'context'>): boolean {
  return req.context[TEAM_INVITATION_USER_CONTEXT_KEY] === true
}

export function applyNewUserPolicy(
  data: NewUserPolicyData,
  input: { existingUsers: number; isCloudSignup: boolean; isTeamInvitation?: boolean },
): NewUserPolicyData {
  if (input.isTeamInvitation) {
    return { ...data, role: 'viewer', status: 'active' }
  }
  if (input.isCloudSignup) {
    return { ...data, role: 'viewer', status: 'pending-verification' }
  }
  return input.existingUsers === 0 ? { ...data, role: 'super-admin', status: 'active' } : data
}
