'use client'

import { TeamView } from './team.view'
import { useTeamController } from './use-team-controller'

export function TeamConnector() {
  return <TeamView {...useTeamController()} />
}
