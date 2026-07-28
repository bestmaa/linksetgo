'use client'

import { TeamInviteView } from './team-invite.view'
import { useTeamInviteController } from './use-team-invite-controller'

export function TeamInviteConnector() {
  return <TeamInviteView {...useTeamInviteController()} />
}
