'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { useRuntimeLinkConfig } from '@/features/runtime-config/use-runtime-link-config'
import { useTestLabQr } from '@/features/test-lab/use-test-lab-qr'
import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'
import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { LinkConsoleDetailDTO } from '@/lib/client/payload-types'

import {
  emptyLinkDetailForm,
  linkConfiguration,
  linkDetailFormFromDTO,
  updateParameter,
  validateLinkDetailForm,
} from './link-detail.helpers'
import { presentLinkDetail, publicURLForLink } from './link-detail.presenter'
import type {
  LinkDetailAction,
  LinkDetailForm,
  LinkDetailFormErrors,
  LinkDetailParameterViewModel,
} from './link-detail.types'
import { useLinkAnalytics } from './use-link-analytics'

const manageableRoles = new Set(['admin', 'owner', 'platform-admin'])

export function useLinkDetailController(linkID: string) {
  const { isReady, selectedWorkspace, selectedWorkspaceId } = useWorkspaceSelection()
  const runtimeConfig = useRuntimeLinkConfig(selectedWorkspaceId)
  const [record, setRecord] = useState<LinkConsoleDetailDTO | null>(null)
  const [form, setForm] = useState<LinkDetailForm>(emptyLinkDetailForm)
  const [formErrors, setFormErrors] = useState<LinkDetailFormErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [action, setAction] = useState<LinkDetailAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const canManage = manageableRoles.has(selectedWorkspace?.role ?? '')

  const applyRecord = useCallback((next: LinkConsoleDetailDTO) => {
    setRecord(next)
    setForm(linkDetailFormFromDTO(next))
  }, [])

  const load = useCallback(async () => {
    setError(null)
    setMutationError(null)
    setRecord(null)
    setIsLoading(true)
    if (!isReady) return
    if (!selectedWorkspaceId) {
      setError('Select a workspace before opening this link.')
      setIsLoading(false)
      return
    }
    try {
      applyRecord(await payloadClient.getConsoleLink(linkID, selectedWorkspaceId))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [applyRecord, isReady, linkID, selectedWorkspaceId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const publicURL = publicURLForLink(record, runtimeConfig.config?.baseUrl ?? null)
  const qr = useTestLabQr(publicURL)
  const analytics = useLinkAnalytics(linkID, selectedWorkspaceId, Boolean(record))

  const updateField = (field: Exclude<keyof LinkDetailForm, 'parameters'>, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFormErrors((current) => ({ ...current, [field]: undefined }))
    setMutationError(null)
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedWorkspaceId || !record || !canManage) return
    const errors = validateLinkDetailForm(form)
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    setIsSaving(true)
    setMutationError(null)
    try {
      applyRecord(
        await payloadClient.updateConsoleLink(linkID, {
          action: 'save',
          configuration: linkConfiguration(form),
          workspaceId: selectedWorkspaceId,
        }),
      )
      setIsEditing(false)
      setToast('Link configuration saved.')
    } catch (requestError) {
      setMutationError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  const confirmAction = async () => {
    if (!action || !selectedWorkspaceId || !canManage) return
    setIsSaving(true)
    setMutationError(null)
    try {
      applyRecord(
        await payloadClient.updateConsoleLink(linkID, {
          action,
          workspaceId: selectedWorkspaceId,
        }),
      )
      setToast(action === 'activate' ? 'Link activated.' : 'Link paused.')
      setAction(null)
    } catch (requestError) {
      setMutationError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  const parameterRows = useMemo<LinkDetailParameterViewModel[]>(
    () =>
      form.parameters.map((parameter) => ({
        ...parameter,
        onKeyChange: (event) =>
          setForm((current) => ({
            ...current,
            parameters: updateParameter(
              current.parameters,
              parameter.id,
              'key',
              event.target.value,
            ),
          })),
        onRemove: () =>
          setForm((current) => ({
            ...current,
            parameters: current.parameters.filter((item) => item.id !== parameter.id),
          })),
        onValueChange: (event) =>
          setForm((current) => ({
            ...current,
            parameters: updateParameter(
              current.parameters,
              parameter.id,
              'value',
              event.target.value,
            ),
          })),
      })),
    [form.parameters],
  )

  return {
    action,
    analytics: analytics.view,
    detail: record
      ? presentLinkDetail({
          baseURL: runtimeConfig.config?.baseUrl ?? null,
          canManage,
          detail: record,
          qrDataURL: qr.qrDataUrl,
          qrError: runtimeConfig.error ?? qr.qrError,
        })
      : null,
    error,
    form: { ...form, parameters: parameterRows },
    formErrors,
    isEditing,
    isLoading,
    isSaving,
    mutationError,
    onActionCancel: () => setAction(null),
    onActionConfirm: () => void confirmAction(),
    onActionRequest: setAction,
    onAddParameter: () =>
      setForm((current) => ({
        ...current,
        parameters: [...current.parameters, { id: crypto.randomUUID(), key: '', value: '' }],
      })),
    onAnalyticsEventChange: analytics.onEventChange,
    onAnalyticsFromChange: analytics.onFromChange,
    onAnalyticsPlatformChange: analytics.onPlatformChange,
    onAnalyticsRetry: analytics.onRetry,
    onAnalyticsToChange: analytics.onToChange,
    onCloseEdit: () => {
      if (record) setForm(linkDetailFormFromDTO(record))
      setFormErrors({})
      setMutationError(null)
      setIsEditing(false)
    },
    onCopyPublicURL: () => {
      if (!publicURL) return
      void navigator.clipboard
        .writeText(publicURL)
        .then(() => setToast('Public URL copied.'))
        .catch(() => setToast('Copy failed. Select the URL and copy it manually.'))
    },
    onDownloadQR: qr.onDownloadPng,
    onFieldChange: updateField,
    onOpenEdit: () => {
      if (!record || !canManage) return
      setForm(linkDetailFormFromDTO(record))
      setFormErrors({})
      setMutationError(null)
      setIsEditing(true)
    },
    onRetry: () => void load(),
    onSubmit: save,
    toast,
  }
}
