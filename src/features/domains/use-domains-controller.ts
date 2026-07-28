'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'
import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { DomainConsoleDTO, DomainInstructionsDTO } from '@/lib/client/payload-types'

import { normalizeCustomHostnameDraft } from './domains.helpers'
import {
  presentDomainInstructions,
  presentDomainRows,
  presentSelectedDomain,
} from './domains.presenter'
import { useDomainActions } from './use-domain-actions'

export function useDomainsController() {
  const {
    isReady: isWorkspaceReady,
    selectedWorkspace,
    selectedWorkspaceId,
  } = useWorkspaceSelection()
  const [domains, setDomains] = useState<DomainConsoleDTO[]>([])
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [instructions, setInstructions] = useState<DomainInstructionsDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [instructionsError, setInstructionsError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [hostname, setHostname] = useState('')
  const [hostnameError, setHostnameError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    if (!isWorkspaceReady) return
    if (!selectedWorkspaceId) {
      setDomains([])
      setSelectedDomainId(null)
      setIsLoading(false)
      return
    }

    try {
      const response = await payloadClient.listDomains(selectedWorkspaceId)
      setDomains(response.docs)
      setSelectedDomainId((current) => {
        if (current && response.docs.some((domain) => String(domain.id) === current)) return current
        return response.docs[0] ? String(response.docs[0].id) : null
      })
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [isWorkspaceReady, selectedWorkspaceId])

  const selectedDomain = domains.find((domain) => String(domain.id) === selectedDomainId) ?? null

  const loadInstructions = useCallback(async () => {
    if (!selectedWorkspaceId || !selectedDomain || selectedDomain.type !== 'custom') {
      setInstructions(null)
      setInstructionsError(null)
      return
    }
    setIsLoadingInstructions(true)
    setInstructionsError(null)
    try {
      setInstructions(
        await payloadClient.getDomainInstructions(String(selectedDomain.id), selectedWorkspaceId),
      )
    } catch (requestError) {
      setInstructions(null)
      setInstructionsError(errorMessage(requestError))
    } finally {
      setIsLoadingInstructions(false)
    }
  }, [selectedDomain, selectedWorkspaceId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInstructions(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadInstructions])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!isCreateOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCreateOpen(false)
        setHostname('')
        setHostnameError(null)
        setSubmitError(null)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isCreateOpen])

  const onCopy = useCallback((label: string, value: string) => {
    void navigator.clipboard
      .writeText(value)
      .then(() => setToast(`${label} copied.`))
      .catch(() => setToast('Copy failed. Select the value and copy it manually.'))
  }, [])

  const rows = useMemo(
    () =>
      presentDomainRows({
        domains,
        onSelect: setSelectedDomainId,
        selectedDomainID: selectedDomainId,
      }),
    [domains, selectedDomainId],
  )
  const instructionRows = useMemo(
    () => presentDomainInstructions(instructions, onCopy),
    [instructions, onCopy],
  )
  const domainActions = useDomainActions({
    domain: selectedDomain,
    onMessage: setToast,
    onReload: load,
    onUpdated: (updated) =>
      setDomains((current) =>
        current.map((domain) => (domain.id === updated.id ? updated : domain)),
      ),
    workspaceID: selectedWorkspaceId,
  })
  const selectedView = presentSelectedDomain({
    actionError: domainActions.actionError,
    actionLabel: domainActions.actionLabel,
    domain: selectedDomain,
    instructions: instructionRows,
    instructionsError,
    isActionRunning: domainActions.isActionRunning,
    isLoadingInstructions,
    onPrimaryAction: domainActions.onPrimaryAction,
    row: rows.find((domain) => domain.id === selectedDomainId),
  })

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = normalizeCustomHostnameDraft(hostname)
    if (!normalized) {
      setHostnameError('Enter one public hostname without a scheme, path, port, IP, or wildcard.')
      return
    }
    if (!selectedWorkspaceId) {
      setSubmitError('Select a workspace before registering a domain.')
      return
    }

    setIsSaving(true)
    setSubmitError(null)
    try {
      const created = await payloadClient.createCustomDomain({
        hostname: normalized,
        workspaceId: selectedWorkspaceId,
      })
      setHostname('')
      setIsCreateOpen(false)
      setToast('Custom domain registered. Publish both DNS records next.')
      await load()
      setSelectedDomainId(String(created.id))
    } catch (requestError) {
      setSubmitError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    domains: rows,
    error,
    hostname,
    hostnameError,
    isCreateOpen,
    isLoading,
    isSaving,
    onCloseCreate: () => {
      setIsCreateOpen(false)
      setHostname('')
      setHostnameError(null)
      setSubmitError(null)
    },
    onCreate: () => setIsCreateOpen(true),
    onHostnameBlur: () => {
      if (hostname && !normalizeCustomHostnameDraft(hostname)) {
        setHostnameError('Enter one public hostname, for example links.company.com.')
      }
    },
    onHostnameChange: (value: string) => {
      setHostname(value)
      if (hostnameError) setHostnameError(null)
    },
    onRefresh: () => {
      void Promise.all([load(), loadInstructions()]).then(() =>
        setToast('Domain status refreshed.'),
      )
    },
    onSubmit,
    releaseConfirmation: domainActions.releaseConfirmation,
    selectedDomain: selectedView,
    submitError,
    toast,
    workspaceName: selectedWorkspace?.name ?? null,
  }
}
