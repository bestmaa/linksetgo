'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { AppDTO } from '@/lib/client/payload-types'
import { useRuntimeLinkConfig } from '@/features/runtime-config/use-runtime-link-config'
import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'

import {
  approvedFallbackHosts,
  buildCreateLinkInput,
  buildPublicLinkUrl,
  copyLinkToClipboard,
  emptyLinkForm,
  fallbackURLForAppError,
  formForAvailableApps,
  linkStatusForApp,
  type FormDraft,
  slugifyLinkName,
} from './links-controller.helpers'
import { createLinkRows } from './links.presenter'
import type { ParameterRowViewModel } from './links.types'
import { useLinkCatalog } from './use-link-catalog'
import { useNativeLinkImport } from './use-native-link-import'

export function useLinksController() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedWorkspaceId } = useWorkspaceSelection()
  const runtimeConfig = useRuntimeLinkConfig(selectedWorkspaceId)
  const [form, setForm] = useState<FormDraft>({
    ...emptyLinkForm,
    appId: searchParams.get('app') ?? '',
  })
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [appFilter, setAppFilter] = useState(searchParams.get('app') ?? '')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [formError, setFormError] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(searchParams.get('create') === '1')
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [lastCreatedLink, setLastCreatedLink] = useState<{
    name: string
    publicUrl: string
  } | null>(null)
  const onAppsLoaded = useCallback((loadedApps: readonly AppDTO[]) => {
    setForm((current) => formForAvailableApps(current, loadedApps))
    setAppFilter((current) => (loadedApps.some((app) => String(app.id) === current) ? current : ''))
  }, [])
  const catalog = useLinkCatalog(
    appFilter,
    page,
    search,
    statusFilter,
    selectedWorkspaceId,
    onAppsLoaded,
  )
  const { apps, links } = catalog
  const selectedApp = apps.find((app) => String(app.id) === form.appId)
  const fallbackHosts = approvedFallbackHosts(selectedApp)
  const nativeImport = useNativeLinkImport(setForm, selectedApp?.nativeScheme ?? null)
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const update = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const closeCreate = () => {
    setIsCreateOpen(false)
    setFormError(null)
    nativeImport.reset()
    router.replace('/admin/links')
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    if (!form.name.trim() || !form.slug.trim() || !form.appId || !form.destinationPath.trim()) {
      setFormError('Name, app, slug and destination path are required.')
      return
    }
    if (!form.destinationPath.startsWith('/')) {
      setFormError('Destination path must start with /.')
      return
    }
    const fallbackError = fallbackURLForAppError(form.fallbackUrl, selectedApp)
    if (fallbackError) {
      setFormError(fallbackError)
      return
    }
    if (!runtimeConfig.config) {
      setFormError(runtimeConfig.error ?? 'Wait for the workspace link domain to finish loading.')
      return
    }
    setIsSaving(true)
    try {
      const publicUrl = buildPublicLinkUrl(
        runtimeConfig.config.baseUrl,
        selectedApp?.slug ?? 'app',
        form.slug,
      )
      if (!publicUrl) throw new Error('The workspace link domain is unavailable.')
      await payloadClient.createDeepLink(buildCreateLinkInput(form))
      setLastCreatedLink({ name: form.name.trim(), publicUrl })
      setToast('Deep link created and ready to test.')
      setForm({ ...emptyLinkForm, appId: String(apps[0]?.id ?? '') })
      closeCreate()
      await catalog.load()
    } catch (requestError) {
      setFormError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  const updateParameter = (id: string, key: 'key' | 'value', value: string) =>
    setForm((current) => ({
      ...current,
      parameters: current.parameters.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    }))

  const parameterRows: ParameterRowViewModel[] = form.parameters.map((parameter) => ({
    ...parameter,
    onKeyChange: (event: ChangeEvent<HTMLInputElement>) =>
      updateParameter(parameter.id, 'key', event.target.value),
    onRemove: () =>
      setForm((current) => ({
        ...current,
        parameters: current.parameters.filter((item) => item.id !== parameter.id),
      })),
    onValueChange: (event: ChangeEvent<HTMLInputElement>) =>
      updateParameter(parameter.id, 'value', event.target.value),
  }))

  const rows = createLinkRows({
    appFilter,
    apps,
    links,
    linkOrigin: runtimeConfig.config?.baseUrl ?? null,
    onCopy: (url) => {
      if (url) copyLinkToClipboard(url, setToast)
      else setToast(runtimeConfig.error ?? 'Workspace domain is still loading.')
    },
    search,
    statusFilter,
  })

  return {
    appFilter,
    appOptions: apps.map((app) => ({
      id: String(app.id),
      label: app.name,
      nativeScheme: app.nativeScheme ?? null,
      slug: app.slug,
    })),
    appStatus: selectedApp?.status ?? null,
    error: catalog.error,
    fallbackHostHelp:
      fallbackHosts.length > 0
        ? `Leave blank for the app default, or use: ${fallbackHosts.join(', ')}.`
        : 'Leave blank to use the app default fallback.',
    form: {
      ...form,
      parameters: parameterRows,
      publicUrl:
        buildPublicLinkUrl(
          runtimeConfig.config?.baseUrl ?? null,
          apps.find((app) => String(app.id) === form.appId)?.slug ?? 'app',
          form.slug,
        ) ?? 'Loading workspace domain...',
    },
    formError,
    isCreateOpen,
    isLoading: catalog.isLoading,
    isSaving,
    lastCreatedLink: lastCreatedLink
      ? {
          ...lastCreatedLink,
          onCopy: () => copyLinkToClipboard(lastCreatedLink.publicUrl, setToast),
          onDismiss: () => setLastCreatedLink(null),
          testHref: `/admin/test-lab?url=${encodeURIComponent(lastCreatedLink.publicUrl)}`,
        }
      : null,
    links: rows,
    nativeImportFeedback: nativeImport.feedback,
    nativeScheme: selectedApp?.nativeScheme ?? null,
    nativeUrl: nativeImport.nativeUrl,
    onAddParameter: () =>
      update('parameters', [...form.parameters, { id: crypto.randomUUID(), key: '', value: '' }]),
    onAppChange: (event: ChangeEvent<HTMLSelectElement>) => {
      const appId = event.target.value
      const app = apps.find((item) => String(item.id) === appId)
      setForm((current) => ({
        ...current,
        appId,
        status: linkStatusForApp(app, current.status),
      }))
    },
    onAppFilterChange: (event: ChangeEvent<HTMLSelectElement>) => {
      setAppFilter(event.target.value)
      setPage(1)
    },
    onCloseCreate: closeCreate,
    onCreate: () => setIsCreateOpen(true),
    onDestinationChange: (event: ChangeEvent<HTMLInputElement>) =>
      update('destinationPath', event.target.value),
    onExpiresChange: (event: ChangeEvent<HTMLInputElement>) =>
      update('expiresAt', event.target.value),
    onFallbackChange: (event: ChangeEvent<HTMLInputElement>) =>
      update('fallbackUrl', event.target.value),
    onNameChange: (event: ChangeEvent<HTMLInputElement>) => {
      const name = event.target.value
      setForm((current) => ({ ...current, name, slug: slugifyLinkName(name) }))
    },
    onNativeUrlChange: nativeImport.onChange,
    onNativeUrlImport: nativeImport.onImport,
    onNextPage: () => setPage((current) => Math.min(catalog.totalPages, current + 1)),
    onPreviousPage: () => setPage((current) => Math.max(1, current - 1)),
    onRetry: () => void catalog.load(),
    onSearchChange: (event: ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value)
      setPage(1)
    },
    onSlugChange: (event: ChangeEvent<HTMLInputElement>) =>
      update('slug', slugifyLinkName(event.target.value)),
    onStatusChange: (event: ChangeEvent<HTMLSelectElement>) =>
      update('status', event.target.value === 'draft' ? 'draft' : 'active'),
    onStatusFilterChange: (event: ChangeEvent<HTMLSelectElement>) => {
      setStatusFilter(event.target.value)
      setPage(1)
    },
    onSubmit,
    page,
    search,
    statusFilter,
    toast,
    totalLinks: catalog.totalLinks,
    totalPages: catalog.totalPages,
  }
}
