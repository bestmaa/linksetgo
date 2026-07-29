'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'
import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type {
  FallbackOriginConsoleDTO,
  FallbackOriginInstructionsDTO,
} from '@/lib/client/payload-types'

import { normalizeCustomHostnameDraft } from '../domains/domains.helpers'
import {
  presentFallbackOriginRecord,
  presentFallbackOriginRows,
} from './fallback-origins.presenter'
import { useFallbackOriginActions } from './use-fallback-origin-actions'

export function useFallbackOriginsController(props: { required: boolean }) {
  const workspace = useWorkspaceSelection()
  const [origins, setOrigins] = useState<FallbackOriginConsoleDTO[]>([])
  const [selectedID, setSelectedID] = useState<string | null>(null)
  const [instructions, setInstructions] = useState<FallbackOriginInstructionsDTO | null>(null)
  const [instructionsError, setInstructionsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(props.required)
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false)
  const [verificationAvailable, setVerificationAvailable] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [hostname, setHostname] = useState('')
  const [hostnameError, setHostnameError] = useState<string | null>(null)
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!props.required) {
      setIsLoading(false)
      return
    }
    if (!workspace.isReady) return
    if (!workspace.selectedWorkspaceId) {
      setOrigins([])
      setSelectedID(null)
      setIsLoading(false)
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      const response = await payloadClient.listFallbackOrigins(workspace.selectedWorkspaceId)
      setOrigins(response.docs)
      setVerificationAvailable(response.verification.available)
      setVerificationMessage(response.verification.message)
      setSelectedID((current) =>
        current && response.docs.some(({ id }) => String(id) === current)
          ? current
          : response.docs[0]
            ? String(response.docs[0].id)
            : null,
      )
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [props.required, workspace.isReady, workspace.selectedWorkspaceId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  const selectedOrigin = origins.find((origin) => String(origin.id) === selectedID) ?? null

  useEffect(() => {
    let cancelled = false
    const timeout = window.setTimeout(() => {
      if (!selectedOrigin || !workspace.selectedWorkspaceId) {
        setInstructions(null)
        setInstructionsError(null)
        return
      }
      setIsLoadingInstructions(true)
      setInstructionsError(null)
      void payloadClient
        .getFallbackOriginInstructions(String(selectedOrigin.id), workspace.selectedWorkspaceId)
        .then((value) => {
          if (!cancelled) setInstructions(value)
        })
        .catch((requestError: unknown) => {
          if (!cancelled) {
            setInstructions(null)
            setInstructionsError(errorMessage(requestError))
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoadingInstructions(false)
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [selectedOrigin, workspace.selectedWorkspaceId])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3_200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const actions = useFallbackOriginActions({
    onMessage: setToast,
    onUpdated: (updated) =>
      setOrigins((current) =>
        current.map((origin) => (origin.id === updated.id ? updated : origin)),
      ),
    origin: selectedOrigin,
    workspaceID: workspace.selectedWorkspaceId,
  })
  const onCopy = useCallback((label: string, value: string) => {
    void navigator.clipboard
      .writeText(value)
      .then(() => setToast(`${label} copied.`))
      .catch(() => setToast('Copy failed. Select the value and copy it manually.'))
  }, [])
  const rows = useMemo(
    () =>
      presentFallbackOriginRows({
        onSelect: setSelectedID,
        origins,
        selectedID,
      }),
    [origins, selectedID],
  )
  const selectedRow = rows.find(({ id }) => id === selectedID) ?? null
  const selectedView =
    selectedOrigin && selectedRow
      ? {
          ...selectedRow,
          actionError: actions.actionError ?? instructionsError,
          isActionRunning: actions.isActionRunning,
          isLoadingInstructions,
          onRequestRevoke: selectedOrigin.status === 'revoked' ? null : actions.onRequestRevoke,
          onVerify:
            selectedOrigin.status === 'pending' || selectedOrigin.status === 'verified'
              ? actions.onVerify
              : null,
          record: presentFallbackOriginRecord(instructions, onCopy),
          verificationError: selectedOrigin.lastVerificationError ?? null,
        }
      : null

  const closeRegistration = () => {
    setIsCreateOpen(false)
    setHostname('')
    setHostnameError(null)
    setRegistrationError(null)
  }
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = normalizeCustomHostnameDraft(hostname)
    if (!normalized) {
      setHostnameError('Enter one public hostname without a scheme, path, port, IP, or wildcard.')
      return
    }
    if (!workspace.selectedWorkspaceId) {
      setRegistrationError('Select a workspace before registering an origin.')
      return
    }
    setIsSaving(true)
    setRegistrationError(null)
    try {
      const created = await payloadClient.createFallbackOrigin({
        hostname: normalized,
        workspaceId: workspace.selectedWorkspaceId,
      })
      closeRegistration()
      await load()
      setSelectedID(String(created.id))
      setToast('Fallback origin registered. Publish the TXT record next.')
    } catch (requestError) {
      setRegistrationError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    error,
    isLoading,
    onCreate: () => setIsCreateOpen(true),
    onRefresh: () => void load(),
    origins: rows,
    registration: {
      error: registrationError,
      hostname,
      hostnameError,
      isOpen: isCreateOpen,
      isSaving,
      onClose: closeRegistration,
      onHostnameBlur: () => {
        if (hostname && !normalizeCustomHostnameDraft(hostname)) {
          setHostnameError('Enter a hostname such as www.example.com.')
        }
      },
      onHostnameChange: (value: string) => {
        setHostname(value)
        if (hostnameError) setHostnameError(null)
      },
      onSubmit,
    },
    required: props.required,
    revocation: actions.revocation,
    selectedOrigin: selectedView,
    toast,
    verificationAvailable,
    verificationMessage,
    workspaceName: workspace.selectedWorkspace?.name ?? null,
  }
}
