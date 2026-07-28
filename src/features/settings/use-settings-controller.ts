'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useRuntimeLinkConfig } from '@/features/runtime-config/use-runtime-link-config'
import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'
import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { BillingSummaryDTO } from '@/lib/client/payload-types'

import type { CheckoutPlan, SettingsTab } from './settings.types'

type BillingState =
  | { status: 'idle' }
  | { error: string; status: 'error'; workspaceID: string }
  | { status: 'ready'; summary: BillingSummaryDTO; workspaceID: string }

const tabLabels: Record<SettingsTab, string> = {
  domain: 'Domain',
  general: 'General',
  system: 'System',
  team: 'Team & access',
}
const tabIds: SettingsTab[] = ['general', 'domain', 'team', 'system']

async function endpointOk(url: string) {
  try {
    return (await fetch(url, { cache: 'no-store' })).ok
  } catch {
    return false
  }
}

export function useSettingsController() {
  const router = useRouter()
  const { selectedWorkspace, selectedWorkspaceId } = useWorkspaceSelection()
  const runtimeConfig = useRuntimeLinkConfig(selectedWorkspaceId)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [apiStatus, setApiStatus] = useState('Checking…')
  const [appCount, setAppCount] = useState(0)
  const [billingState, setBillingState] = useState<BillingState>({ status: 'idle' })
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)
  const [userEmail, setUserEmail] = useState('—')
  const [userRole, setUserRole] = useState('Administrator')
  const [verificationStatus, setVerificationStatus] = useState<
    'idle' | 'checking' | 'verified' | 'attention'
  >('idle')
  const [verificationDetail, setVerificationDetail] = useState('Not checked in this session')
  const [toast, setToast] = useState<string | null>(null)
  const domain =
    runtimeConfig.config?.baseUrl ?? runtimeConfig.error ?? 'Loading workspace domain...'
  const hasCurrentBillingState =
    selectedWorkspaceId !== null &&
    'workspaceID' in billingState &&
    billingState.workspaceID === selectedWorkspaceId
  const billingSummary =
    hasCurrentBillingState && billingState.status === 'ready' ? billingState.summary : null
  const billingError =
    hasCurrentBillingState && billingState.status === 'error' ? billingState.error : null
  const isBillingLoading = selectedWorkspaceId !== null && !hasCurrentBillingState
  const canCheckout =
    billingSummary?.edition === 'cloud' &&
    ['admin', 'owner', 'platform-admin'].includes(selectedWorkspace?.role ?? '')

  useEffect(() => {
    if (!selectedWorkspaceId) return
    void Promise.all([
      payloadClient.listApps({ workspaceId: selectedWorkspaceId }),
      payloadClient.getCurrentUser(),
    ])
      .then(([apps, currentUser]) => {
        setApiStatus('Connected')
        setAppCount(apps.totalDocs)
        setUserEmail(currentUser.user?.email ?? '—')
        setUserRole(currentUser.user?.role ?? 'Administrator')
      })
      .catch(() => setApiStatus('Needs attention'))
  }, [selectedWorkspaceId])

  useEffect(() => {
    if (!selectedWorkspaceId) return
    void payloadClient
      .getBillingSummary(selectedWorkspaceId)
      .then((summary) => {
        setBillingState({ status: 'ready', summary, workspaceID: selectedWorkspaceId })
      })
      .catch((error) => {
        setBillingState({
          error: errorMessage(error),
          status: 'error',
          workspaceID: selectedWorkspaceId,
        })
      })
  }, [selectedWorkspaceId])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const verify = async () => {
    if (!runtimeConfig.config) {
      setVerificationStatus('attention')
      setVerificationDetail(
        runtimeConfig.error ?? 'Wait for the workspace link domain to finish loading.',
      )
      return
    }
    setVerificationStatus('checking')
    setVerificationDetail('Checking Apple and Android association files…')
    const origin = domain.replace(/\/$/, '')
    const [apple, android] = await Promise.all([
      endpointOk(`${origin}/.well-known/apple-app-site-association`),
      endpointOk(`${origin}/.well-known/assetlinks.json`),
    ])
    const passed = Number(apple) + Number(android)
    setVerificationStatus(passed === 2 ? 'verified' : 'attention')
    setVerificationDetail(
      passed === 2
        ? 'Both platform association files are responding.'
        : `${passed} of 2 platform association files responded.`,
    )
  }

  const checkout = async (plan: CheckoutPlan) => {
    if (!selectedWorkspaceId || !canCheckout) return
    setCheckoutError(null)
    setIsCheckoutLoading(true)
    try {
      const session = await payloadClient.createBillingCheckout(selectedWorkspaceId, plan)
      const destination = new URL(session.url)
      if (destination.protocol !== 'https:') throw new Error('Checkout returned an unsafe URL.')
      const confirmed = window.confirm(
        `Continue to the secure ${plan === 'starter' ? '$5 Starter' : '$10 Pro'} checkout?`,
      )
      if (confirmed) window.location.assign(destination.toString())
    } catch (requestError) {
      setCheckoutError(errorMessage(requestError))
    } finally {
      setIsCheckoutLoading(false)
    }
  }

  return {
    activeTab,
    apiStatus,
    appCount,
    billingError,
    billingSummary,
    canCheckout,
    checkoutError,
    databaseLabel: process.env.NEXT_PUBLIC_DATABASE_LABEL ?? 'linksetgo',
    domain,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'Development',
    isBillingLoading,
    isCheckoutLoading,
    onCopyDomain: () =>
      runtimeConfig.config
        ? void navigator.clipboard
            .writeText(runtimeConfig.config.baseUrl)
            .then(() => setToast('Domain copied to clipboard.'))
            .catch(() => setToast('Copy failed. Select the domain and copy it manually.'))
        : setToast(runtimeConfig.error ?? 'Workspace domain is still loading.'),
    onCheckout: (plan: CheckoutPlan) => void checkout(plan),
    onOpenTeam: () => router.push('/admin/team'),
    onVerify: () => void verify(),
    tabs: tabIds.map((id) => ({
      active: id === activeTab,
      id,
      label: tabLabels[id],
      onSelect: () => setActiveTab(id),
    })),
    toast,
    userEmail,
    userRole,
    verificationDetail,
    verificationStatus,
  }
}
