'use client'

import { type ChangeEvent, type FormEvent, useState } from 'react'

import { useTestLabQr } from '@/features/test-lab/use-test-lab-qr'
import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'
import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { QuickLinkCreateDTO } from '@/lib/client/payload-types'

export function useQuickLinksController() {
  const { selectedWorkspaceId } = useWorkspaceSelection()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [appStoreUrl, setAppStoreUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fallbackUrl, setFallbackUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [name, setName] = useState('')
  const [nativeUrl, setNativeUrl] = useState('')
  const [playStoreUrl, setPlayStoreUrl] = useState('')
  const [result, setResult] = useState<QuickLinkCreateDTO | null>(null)
  const qr = useTestLabQr(result?.publicUrl ?? null)

  const change = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value)
    setError(null)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedWorkspaceId || isSaving) return
    setError(null)
    setIsSaving(true)
    try {
      setResult(
        await payloadClient.createQuickLink({
          nativeUrl,
          workspaceId: selectedWorkspaceId,
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(fallbackUrl.trim() ? { fallbackUrl: fallbackUrl.trim() } : {}),
          ...(appStoreUrl.trim() ? { appStoreUrl: appStoreUrl.trim() } : {}),
          ...(playStoreUrl.trim() ? { playStoreUrl: playStoreUrl.trim() } : {}),
        }),
      )
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    advancedOpen,
    appStoreUrl,
    error,
    fallbackUrl,
    isSaving,
    name,
    nativeUrl,
    onAdvancedToggle: () => setAdvancedOpen((current) => !current),
    onAppStoreUrlChange: change(setAppStoreUrl),
    onCopy: () => {
      if (result?.publicUrl) void navigator.clipboard.writeText(result.publicUrl)
    },
    onDownloadQr: qr.onDownloadPng,
    onFallbackUrlChange: change(setFallbackUrl),
    onNameChange: change(setName),
    onNativeUrlChange: change(setNativeUrl),
    onPlayStoreUrlChange: change(setPlayStoreUrl),
    onSubmit,
    onUseAnother: () => {
      setNativeUrl('')
      setName('')
      setFallbackUrl('')
      setResult(null)
      setError(null)
    },
    playStoreUrl,
    qrDataUrl: qr.qrDataUrl,
    qrError: qr.qrError,
    result: result
      ? {
          fallbackActionHref:
            result.fallbackStatus === 'pending-verification' ? '/admin/fallback-origins' : null,
          fallbackMessage:
            result.fallbackStatus === 'pending-verification'
              ? 'Your link is live. The web fallback stays hidden until its safety scan and DNS TXT verification both pass.'
              : result.fallbackStatus === 'ready'
                ? 'Your verified web fallback passed its safety check and is available to visitors.'
                : 'No fallback was added. Visitors who do not have the app will see the safe LinksetGo landing page.',
          name: result.name,
          publicUrl: result.publicUrl,
        }
      : null,
    workspaceReady: Boolean(selectedWorkspaceId),
  }
}
