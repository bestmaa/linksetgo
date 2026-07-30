'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'
import { useRuntimeLinkConfig } from '@/features/runtime-config/use-runtime-link-config'
import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { AppConsoleDetailDTO } from '@/lib/client/payload-types'

import {
  configurationFromAppDetailForm,
  emptyAppDetailForm,
  validateAppDetailForm,
} from './app-detail.helpers'
import { appDetailFormFromDTO, presentAppDetail } from './app-detail.presenter'
import type {
  AppDetailAction,
  AppDetailField,
  AppDetailForm,
  AppDetailFormErrors,
} from './app-detail.types'

const manageableRoles = new Set(['admin', 'owner', 'platform-admin'])

export function useAppDetailController(appId: string) {
  const router = useRouter()
  const {
    isReady: isWorkspaceReady,
    selectedWorkspace,
    selectedWorkspaceId,
  } = useWorkspaceSelection()
  const runtimeConfig = useRuntimeLinkConfig(selectedWorkspaceId)
  const [detail, setDetail] = useState<AppConsoleDetailDTO | null>(null)
  const [form, setForm] = useState<AppDetailForm>(emptyAppDetailForm)
  const [formErrors, setFormErrors] = useState<AppDetailFormErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [confirmation, setConfirmation] = useState<AppDetailAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const canManage = manageableRoles.has(selectedWorkspace?.role ?? '')

  const applyDetail = useCallback((next: AppConsoleDetailDTO) => {
    setDetail(next)
    setForm(appDetailFormFromDTO(next.app))
  }, [])

  const load = useCallback(async () => {
    setError(null)
    setMutationError(null)
    setDetail(null)
    setIsEditing(false)
    setConfirmation(null)
    setIsLoading(true)
    if (!isWorkspaceReady) return
    if (!selectedWorkspaceId) {
      setError('Select a workspace before opening this app.')
      setIsLoading(false)
      return
    }

    try {
      applyDetail(await payloadClient.getConsoleApp(appId, selectedWorkspaceId))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [appId, applyDetail, isWorkspaceReady, selectedWorkspaceId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const update = (field: AppDetailField, value: string) => {
    const normalized =
      field === 'iosTeamId' || field === 'androidSha256CertFingerprints'
        ? value.toUpperCase()
        : value
    setForm((current) => ({ ...current, [field]: normalized }))
    setFormErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    setMutationError(null)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail || !selectedWorkspaceId || !canManage) return

    const validation = validateAppDetailForm(
      form,
      detail.app.status === 'active' && detail.app.routingMode !== 'scheme-handoff',
    )
    setFormErrors(validation.errors)
    setMutationError(validation.message)
    if (Object.keys(validation.errors).length > 0 || validation.message) return

    setIsSaving(true)
    try {
      const next = await payloadClient.updateConsoleApp(appId, {
        action: 'save',
        configuration: configurationFromAppDetailForm(form),
        workspaceId: selectedWorkspaceId,
      })
      applyDetail(next)
      setIsEditing(false)
      setToast('App configuration saved.')
    } catch (requestError) {
      setMutationError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  const onConfirmAction = async () => {
    if (!confirmation || !selectedWorkspaceId || !canManage) return
    setIsSaving(true)
    setMutationError(null)
    try {
      const next = await payloadClient.updateConsoleApp(appId, {
        action: confirmation,
        workspaceId: selectedWorkspaceId,
      })
      applyDetail(next)
      setConfirmation(null)
      setToast(confirmation === 'activate' ? 'App activated.' : 'App paused.')
    } catch (requestError) {
      setMutationError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  const app = useMemo(
    () =>
      detail
        ? presentAppDetail(
            detail,
            selectedWorkspace?.name ?? 'Selected workspace',
            canManage,
            runtimeConfig.config?.baseUrl ?? null,
            runtimeConfig.config?.pathStyle ?? 'host-scoped',
          )
        : null,
    [
      canManage,
      detail,
      runtimeConfig.config?.baseUrl,
      runtimeConfig.config?.pathStyle,
      selectedWorkspace?.name,
    ],
  )

  return {
    app,
    confirmation,
    error,
    form,
    formErrors,
    isEditing,
    isLoading,
    isRuntimeDomainLoading: runtimeConfig.isLoading,
    isSaving,
    mutationError,
    onCancelAction: () => {
      if (!isSaving) setConfirmation(null)
      setMutationError(null)
    },
    onCloseEdit: () => {
      if (isSaving) return
      if (detail) setForm(appDetailFormFromDTO(detail.app))
      setFormErrors({})
      setMutationError(null)
      setIsEditing(false)
    },
    onConfirmAction: () => void onConfirmAction(),
    onCreateLink: () => router.push(`/admin/links?create=1&app=${encodeURIComponent(appId)}`),
    onFieldChange: update,
    onOpenEdit: () => {
      if (!detail || !canManage) return
      setForm(appDetailFormFromDTO(detail.app))
      setFormErrors({})
      setMutationError(null)
      setIsEditing(true)
    },
    onRequestAction: (action: AppDetailAction) => {
      if (!canManage) return
      setMutationError(null)
      setConfirmation(action)
    },
    onRetry: () => void load(),
    onRetryRuntimeDomain: runtimeConfig.reload,
    onSubmit,
    toast,
    runtimeDomainError: runtimeConfig.error,
  }
}
