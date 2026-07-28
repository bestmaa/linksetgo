import { createElement } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TeamInviteView } from '@/features/team-invite/team-invite.view'
import type { TeamInviteViewProps } from '@/features/team-invite/team-invite.types'
import { TeamView } from '@/features/team/team.view'
import type { TeamViewProps } from '@/features/team/team.types'

const noop = vi.fn()

afterEach(cleanup)

const teamProps = (overrides: Partial<TeamViewProps> = {}): TeamViewProps => ({
  canInviteOwner: true,
  canManage: true,
  canManualInvite: false,
  error: null,
  invitationToRevoke: null,
  invitations: [
    {
      canRevoke: true,
      deliveryMode: 'webhook',
      email: 'invitee@relay.test',
      expiresLabel: 'Aug 3, 2026',
      id: '21',
      inviter: 'Owner',
      role: 'member',
      roleTone: 'neutral',
      status: 'pending',
    },
  ],
  inviteDialog: {
    delivery: 'webhook',
    email: '',
    error: null,
    isOpen: false,
    isSaving: false,
    manualUrl: null,
    role: 'member',
  },
  isLoading: false,
  memberDialog: {
    error: null,
    isOpen: false,
    isRemoving: false,
    isSaving: false,
    member: null,
    role: 'member',
    status: 'active',
  },
  members: [
    {
      canEdit: true,
      detail: 'owner@relay.test',
      id: '10',
      isSelf: true,
      name: 'Owner',
      role: 'owner',
      roleTone: 'blue',
      status: 'active',
    },
  ],
  onCancelRevoke: noop,
  onCloseInvite: noop,
  onCloseMember: noop,
  onConfirmRevoke: noop,
  onCopyManualUrl: noop,
  onDeliveryChange: noop,
  onEmailChange: noop,
  onInvite: (event) => event.preventDefault(),
  onMemberRoleChange: noop,
  onMemberStatusChange: noop,
  onOpenInvite: noop,
  onOpenMember: noop,
  onRemoveMember: noop,
  onRequestRevoke: noop,
  onRetry: noop,
  onRoleChange: noop,
  onSaveMember: (event) => event.preventDefault(),
  onToggleRemoveConfirmation: noop,
  organizationName: 'Oberoi Mall',
  toast: null,
  workspaceName: 'Production',
  ...overrides,
})

const inviteProps = (overrides: Partial<TeamInviteViewProps> = {}): TeamInviteViewProps => ({
  confirmPassword: '',
  error: null,
  isSubmitting: false,
  name: '',
  onAccept: noop,
  onConfirmPasswordChange: noop,
  onCreateAccount: (event) => event.preventDefault(),
  onNameChange: noop,
  onOpenRelay: noop,
  onPasswordChange: noop,
  onSignIn: noop,
  onUseDifferentAccount: noop,
  password: '',
  state: {
    preview: {
      accountMode: 'create',
      emailMasked: 'in*****@relay.test',
      organizationName: 'Oberoi Mall',
      role: 'member',
    },
    status: 'ready',
  },
  ...overrides,
})

describe('team management views', () => {
  it('renders server-authorized member and invitation actions', () => {
    render(createElement(TeamView, teamProps()))

    expect(screen.getByRole('heading', { level: 1, name: 'Team' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Invite member' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit Owner' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy()
    expect(screen.getByText('You', { exact: true })).toBeTruthy()
  })

  it('warns that a manual bearer URL is shown only once', () => {
    render(
      createElement(
        TeamView,
        teamProps({
          canManualInvite: true,
          inviteDialog: {
            delivery: 'manual',
            email: '',
            error: null,
            isOpen: true,
            isSaving: false,
            manualUrl: 'https://app.relay.test/invite#token=secret',
            role: 'viewer',
          },
        }),
      ),
    )

    const dialog = screen.getByRole('dialog', { name: 'Invite a team member' })
    expect(within(dialog).getByText(/stores only its SHA-256 hash/i)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeTruthy()
  })

  it('shows only the masked invited email on public account creation', () => {
    render(createElement(TeamInviteView, inviteProps()))

    expect(screen.getByRole('heading', { name: 'Join Oberoi Mall' })).toBeTruthy()
    expect(screen.getByText('in*****@relay.test', { exact: true })).toBeTruthy()
    expect(screen.getByLabelText('Your name')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create account and join' })).toBeTruthy()
    expect(screen.queryByText('invitee@relay.test')).toBeNull()
  })

  it('requires account switching when the authenticated email does not match', () => {
    render(
      createElement(
        TeamInviteView,
        inviteProps({
          state: {
            preview: {
              accountMode: 'wrong-account',
              emailMasked: 'in*****@relay.test',
              organizationName: 'Oberoi Mall',
              role: 'admin',
            },
            status: 'ready',
          },
        }),
      ),
    )

    expect(screen.getByRole('button', { name: 'Use a different account' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull()
  })
})
