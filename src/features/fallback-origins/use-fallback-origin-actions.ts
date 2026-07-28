'use client'

import { useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { FallbackOriginConsoleDTO } from '@/lib/client/payload-types'

export function useFallbackOriginActions(input: {
  onMessage: (message: string) => void
  onUpdated: (origin: FallbackOriginConsoleDTO) => void
  origin: FallbackOriginConsoleDTO | null
  workspaceID: string | null
}) {
  const [actionError, setActionError] = useState<string | null>(null)
  const [action, setAction] = useState<'revoke' | 'verify' | null>(null)
  const [isRevokeOpen, setIsRevokeOpen] = useState(false)

  const run = async (nextAction: 'revoke' | 'verify') => {
    if (!input.origin || !input.workspaceID || action) return
    setAction(nextAction)
    setActionError(null)
    try {
      const response = await payloadClient.runFallbackOriginAction(
        String(input.origin.id),
        input.workspaceID,
        nextAction,
      )
      input.onUpdated(response.origin)
      input.onMessage(response.message)
      if (nextAction === 'revoke') setIsRevokeOpen(false)
    } catch (requestError) {
      setActionError(errorMessage(requestError))
    } finally {
      setAction(null)
    }
  }

  return {
    actionError,
    isActionRunning: action !== null,
    onCancelRevoke: () => setIsRevokeOpen(false),
    onConfirmRevoke: () => void run('revoke'),
    onRequestRevoke: () => {
      setActionError(null)
      setIsRevokeOpen(true)
    },
    onVerify: () => void run('verify'),
    revocation: {
      hostname: input.origin?.hostname ?? null,
      isOpen: isRevokeOpen,
      isSaving: action === 'revoke',
      onCancel: () => setIsRevokeOpen(false),
      onConfirm: () => void run('revoke'),
    },
  }
}
