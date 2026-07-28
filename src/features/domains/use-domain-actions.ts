'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { DomainConsoleDTO } from '@/lib/client/payload-types'

import { normalizeCustomHostnameDraft } from './domains.helpers'
import type { DomainReleaseConfirmationViewModel } from './domains.types'

type Input = {
  domain: DomainConsoleDTO | null
  onMessage: (message: string) => void
  onReload: () => Promise<void>
  onUpdated: (domain: DomainConsoleDTO) => void
  workspaceID: string | null
}

const actionLabel = (domain: DomainConsoleDTO | null): string | null => {
  if (!domain || domain.type !== 'custom') return null
  switch (domain.status) {
    case 'pending-dns':
      return 'Check DNS & TLS'
    case 'verifying':
      return 'Continue verification'
    case 'certificate-ready':
      return 'Publish association files'
    case 'association-incomplete':
      return 'Confirm mobile release'
    case 'active':
    case 'suspended':
      return null
  }
}

export function useDomainActions(input: Input): {
  actionError: string | null
  actionLabel: string | null
  isActionRunning: boolean
  onPrimaryAction: (() => void) | null
  releaseConfirmation: DomainReleaseConfirmationViewModel
} {
  const [actionError, setActionError] = useState<{
    domainID: string
    message: string
  } | null>(null)
  const [isActionRunning, setIsActionRunning] = useState(false)
  const [confirmationDomainID, setConfirmationDomainID] = useState<string | null>(null)
  const [confirmationHostname, setConfirmationHostname] = useState('')
  const [isReleaseConfirmed, setIsReleaseConfirmed] = useState(false)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)

  const currentDomainID = input.domain ? String(input.domain.id) : null
  const isConfirmationOpen = currentDomainID !== null && confirmationDomainID === currentDomainID

  const reloadAfterError = useCallback(async () => {
    try {
      await input.onReload()
    } catch {
      // The original server error remains the actionable message.
    }
  }, [input])

  const verify = useCallback(async () => {
    if (!input.domain || !input.workspaceID) return
    setIsActionRunning(true)
    setActionError(null)
    try {
      const response = await payloadClient.runDomainVerification(
        String(input.domain.id),
        input.workspaceID,
      )
      input.onUpdated(response.domain)
      input.onMessage(response.message)
    } catch (requestError) {
      setActionError({
        domainID: String(input.domain.id),
        message: errorMessage(requestError),
      })
      await reloadAfterError()
    } finally {
      setIsActionRunning(false)
    }
  }, [input, reloadAfterError])

  const closeConfirmation = useCallback(() => {
    if (isActionRunning) return
    setConfirmationDomainID(null)
    setConfirmationHostname('')
    setIsReleaseConfirmed(false)
    setConfirmationError(null)
  }, [isActionRunning])

  useEffect(() => {
    if (!isConfirmationOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeConfirmation()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [closeConfirmation, isConfirmationOpen])

  const confirm = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!input.domain || !input.workspaceID) return
      if (
        normalizeCustomHostnameDraft(confirmationHostname) !== input.domain.hostname ||
        !isReleaseConfirmed
      ) {
        setConfirmationError(
          'Type the exact hostname and confirm that released iOS and Android builds support it.',
        )
        return
      }

      setIsActionRunning(true)
      setConfirmationError(null)
      try {
        const response = await payloadClient.confirmDomainAssociations(
          String(input.domain.id),
          input.workspaceID,
          confirmationHostname,
        )
        input.onUpdated(response.domain)
        input.onMessage(response.message)
        setConfirmationDomainID(null)
        setConfirmationHostname('')
        setIsReleaseConfirmed(false)
      } catch (requestError) {
        setConfirmationError(errorMessage(requestError))
        await reloadAfterError()
      } finally {
        setIsActionRunning(false)
      }
    },
    [confirmationHostname, input, isReleaseConfirmed, reloadAfterError],
  )

  const label = actionLabel(input.domain)
  const onPrimaryAction = useMemo(() => {
    if (!label) return null
    return input.domain?.status === 'association-incomplete'
      ? () => {
          setConfirmationDomainID(currentDomainID)
          setConfirmationHostname('')
          setIsReleaseConfirmed(false)
          setConfirmationError(null)
        }
      : () => void verify()
  }, [currentDomainID, input.domain?.status, label, verify])

  return {
    actionError: actionError?.domainID === currentDomainID ? actionError.message : null,
    actionLabel: label,
    isActionRunning,
    onPrimaryAction,
    releaseConfirmation: {
      error: confirmationError,
      hostname: confirmationHostname,
      isConfirmed: isReleaseConfirmed,
      isOpen: isConfirmationOpen,
      isSaving: isActionRunning,
      onClose: closeConfirmation,
      onConfirmedChange: (confirmed) => {
        setIsReleaseConfirmed(confirmed)
        if (confirmationError) setConfirmationError(null)
      },
      onHostnameChange: (hostname) => {
        setConfirmationHostname(hostname)
        if (confirmationError) setConfirmationError(null)
      },
      onSubmit: confirm,
      targetHostname: input.domain?.hostname ?? null,
    },
  }
}
