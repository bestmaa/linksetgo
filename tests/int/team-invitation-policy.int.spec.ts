import { describe, expect, it } from 'vitest'

import {
  maskTeamEmail,
  parseAcceptTeamInvitation,
  parseCreateTeamInvitation,
  parseTeamMemberMutation,
} from '@/lib/domain/team-invitations'
import { getTeamInvitationDeliveryConfiguration } from '@/lib/server/team-invitation-delivery'

describe('team invitation policy boundaries', () => {
  it('normalizes email and rejects unknown invitation fields', () => {
    expect(
      parseCreateTeamInvitation({
        delivery: 'webhook',
        email: '  Person@Example.COM ',
        organizationId: '42',
        role: 'member',
      }),
    ).toEqual({
      ok: true,
      value: {
        delivery: 'webhook',
        email: 'person@example.com',
        organizationId: '42',
        role: 'member',
      },
    })
    expect(
      parseCreateTeamInvitation({
        delivery: 'webhook',
        email: 'person@example.com',
        organizationId: '42',
        role: 'owner',
        token: 'caller-controlled',
      }),
    ).toMatchObject({ ok: false })
  })

  it('accepts only strong new-account credentials and a fixed-shape token', () => {
    const token = 'A'.repeat(43)
    expect(parseAcceptTeamInvitation({ token })).toEqual({
      ok: true,
      value: { name: null, password: null, token },
    })
    expect(
      parseAcceptTeamInvitation({
        name: 'Invited User',
        password: 'weak',
        token,
      }),
    ).toMatchObject({ field: 'password', ok: false })
    expect(
      parseAcceptTeamInvitation({
        name: 'Invited User',
        password: 'StrongInvitation123!',
        token,
      }),
    ).toMatchObject({ ok: true })
  })

  it('keeps member mutations closed to extra identity fields', () => {
    expect(
      parseTeamMemberMutation({
        action: 'update',
        organizationId: '42',
        role: 'admin',
        status: 'active',
        userId: 'forged',
      }),
    ).toMatchObject({ ok: false })
  })

  it('masks the local part without changing the destination domain', () => {
    expect(maskTeamEmail('person@example.com')).toBe('pe****@example.com')
  })

  it('disables external delivery in Community and fails Cloud configuration closed', () => {
    expect(getTeamInvitationDeliveryConfiguration({ RELAY_EDITION: 'community' })).toEqual({
      reason: 'community-edition',
      status: 'unavailable',
    })
    expect(
      getTeamInvitationDeliveryConfiguration({
        CLOUD_APP_BASE_URL: 'http://app.linksetgo.test',
        RELAY_EDITION: 'cloud',
        TEAM_INVITATION_WEBHOOK_SECRET: 'x'.repeat(32),
        TEAM_INVITATION_WEBHOOK_URL: 'https://hooks.linksetgo.test/invitations',
      }),
    ).toMatchObject({ status: 'misconfigured' })
    expect(
      getTeamInvitationDeliveryConfiguration({
        CLOUD_APP_BASE_URL: 'https://app.linksetgo.test',
        RELAY_EDITION: 'cloud',
        TEAM_INVITATION_WEBHOOK_SECRET: 'x'.repeat(32),
        TEAM_INVITATION_WEBHOOK_URL: 'https://hooks.linksetgo.test/invitations',
      }),
    ).toEqual({
      appBaseURL: 'https://app.linksetgo.test',
      secret: 'x'.repeat(32),
      status: 'ready',
      webhookURL: 'https://hooks.linksetgo.test/invitations',
    })
  })
})
