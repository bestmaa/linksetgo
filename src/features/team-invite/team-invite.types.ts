import type { FormEventHandler, ChangeEventHandler } from 'react'

import type { TeamInvitationPreviewDTO } from '@/lib/client/payload-types'

export type TeamInviteState =
  | { status: 'checking' }
  | { message: string; status: 'error' }
  | { preview: TeamInvitationPreviewDTO; status: 'ready' }
  | {
      organizationName: string
      signInRequired: boolean
      status: 'accepted'
    }

export type TeamInviteViewProps = {
  confirmPassword: string
  error: string | null
  isSubmitting: boolean
  name: string
  onAccept: () => void
  onConfirmPasswordChange: ChangeEventHandler<HTMLInputElement>
  onCreateAccount: FormEventHandler<HTMLFormElement>
  onNameChange: ChangeEventHandler<HTMLInputElement>
  onOpenLinksetGo: () => void
  onPasswordChange: ChangeEventHandler<HTMLInputElement>
  onSignIn: () => void
  onUseDifferentAccount: () => void
  password: string
  state: TeamInviteState
}
