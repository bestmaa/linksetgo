'use client'

import { useSearchParams } from 'next/navigation'
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react'

import { errorMessage } from '@/lib/client/payload-client'
import { useRuntimeLinkConfig } from '@/features/runtime-config/use-runtime-link-config'
import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'
import { buildPublicURL } from '@/lib/domain/public-link'

import { validateAssociation } from './association-validator'
import {
  checkResult,
  type CheckResult,
  parseLinksetGoUrl,
  pendingChecks,
  platformsFor,
  safeLinksetGoUrl,
  selectedSavedLinkId,
} from './test-lab-controller.helpers'
import { checkPublicLink, loadAppConfiguration } from './test-lab-requests'
import type { CheckViewModel, TestPlatform } from './test-lab.types'
import { useSavedLinkOptions } from './use-saved-link-options'
import { useTestLabQr } from './use-test-lab-qr'

export function useTestLabController() {
  const searchParams = useSearchParams()
  const { selectedWorkspaceId } = useWorkspaceSelection()
  const runtimeConfig = useRuntimeLinkConfig(selectedWorkspaceId)
  const configuredOrigin = runtimeConfig.config?.baseUrl ?? null
  const pathStyle = runtimeConfig.config?.pathStyle ?? 'host-scoped'
  const [urlDraft, setUrlDraft] = useState(searchParams.get('url') ?? '')
  const url =
    urlDraft ||
    (configuredOrigin ? buildPublicURL(configuredOrigin, 'app', 'example', pathStyle) : '')
  const [platform, setPlatform] = useState<TestPlatform>('both')
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const runId = useRef(0)
  const openUrl = configuredOrigin ? safeLinksetGoUrl(url, configuredOrigin, pathStyle) : null
  const qr = useTestLabQr(openUrl)
  const savedLinks = useSavedLinkOptions(configuredOrigin, pathStyle, selectedWorkspaceId)

  useEffect(() => {
    if (!copyFeedback) return
    const timeout = window.setTimeout(() => setCopyFeedback(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [copyFeedback])

  const copyText = (value: string, successMessage: string) => {
    if (!navigator.clipboard) {
      setCopyFeedback('Clipboard access is unavailable. Select the value and copy it manually.')
      return
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => setCopyFeedback(successMessage))
      .catch(() => setCopyFeedback('Copy failed. Select the value and copy it manually.'))
  }

  const run = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const currentRun = ++runId.current
    setIsRunning(true)
    setChecks(pendingChecks(platform))

    if (!configuredOrigin || !selectedWorkspaceId) {
      setChecks(
        pendingChecks(platform).map((check, index) =>
          index === 0
            ? checkResult(
                'Workspace link domain',
                runtimeConfig.error ?? 'The workspace domain is still loading.',
                false,
                { remediation: 'Reload the page or verify this workspace domain in Domains.' },
              )
            : checkResult(check.label, 'Skipped until the workspace domain is ready', false),
        ),
      )
      setIsRunning(false)
      return
    }

    let parsed: ReturnType<typeof parseLinksetGoUrl>
    try {
      parsed = parseLinksetGoUrl(url.trim(), configuredOrigin, pathStyle)
    } catch (parseError) {
      setChecks(
        pendingChecks(platform).map((check, index) =>
          index === 0
            ? checkResult('Valid LinksetGo URL', errorMessage(parseError), false, {
                remediation: 'Select a saved link or paste its exact generated public URL.',
              })
            : checkResult(check.label, 'Skipped until the URL is valid', false),
        ),
      )
      setIsRunning(false)
      return
    }

    const [lookup, appLookup] = await Promise.all([
      checkPublicLink(parsed.origin, parsed.appSlug, parsed.linkSlug),
      loadAppConfiguration(parsed.appSlug, selectedWorkspaceId, pathStyle),
    ])
    const associationResults = await Promise.all(
      platformsFor(platform).map(async (target) => ({
        result: await validateAssociation(parsed.origin, target, appLookup.data, pathStyle),
        target,
      })),
    )
    if (currentRun !== runId.current) return

    const resolved = lookup.data
    const fallback = resolved?.link.fallbackUrl || resolved?.app.fallbackUrl
    setChecks([
      checkResult('Valid LinksetGo URL', parsed.url, true),
      checkResult(
        'Link record resolves',
        resolved ? `${resolved.link.name} is ${resolved.status}` : (lookup.error ?? 'Unavailable'),
        Boolean(resolved),
        resolved
          ? {}
          : {
              remediation:
                'Confirm the link and app are active, the link is not expired and your URL slugs match.',
            },
      ),
      checkResult(
        'Destination is valid',
        resolved?.link.destinationPath ?? 'No active destination was returned',
        Boolean(resolved?.link.destinationPath.startsWith('/')),
        resolved?.link.destinationPath
          ? {}
          : { remediation: 'Edit the saved link and provide a route that starts with /.' },
      ),
      ...associationResults.map(({ result, target }) =>
        checkResult(
          `${target === 'ios' ? 'iOS' : 'Android'} association`,
          appLookup.error ?? result.detail,
          result.passed && !appLookup.error,
          appLookup.error
            ? { remediation: 'Reload the app configuration, then rerun this check.' }
            : {
                ...(result.copyLabel ? { copyLabel: result.copyLabel } : {}),
                ...(result.copyValue ? { copyValue: result.copyValue } : {}),
                ...(result.remediation ? { remediation: result.remediation } : {}),
              },
        ),
      ),
      checkResult(
        'Fallback is configured',
        fallback ?? 'No web fallback was returned',
        Boolean(fallback),
        fallback
          ? {}
          : { remediation: 'Add an allowlisted HTTPS fallback to the link or its app.' },
      ),
    ])
    setIsRunning(false)
  }

  const failed = checks.filter((check) => check.status === 'failed').length
  const passed = checks.filter((check) => check.status === 'passed').length
  const viewChecks: CheckViewModel[] = checks.map(({ copyLabel, copyValue, ...check }) => ({
    ...check,
    ...(copyLabel && copyValue
      ? { copyAction: { label: copyLabel, onCopy: () => copyText(copyValue, 'Fix copied.') } }
      : {}),
  }))

  const selectPlatform = (nextPlatform: TestPlatform) => {
    runId.current += 1
    setPlatform(nextPlatform)
    setChecks([])
    setIsRunning(false)
  }

  return {
    checks: viewChecks,
    copyFeedback,
    isRunning,
    isSavedLinksLoading: savedLinks.isLoading,
    onCopy: () => copyText(url, 'URL copied.'),
    onDownloadPng: qr.onDownloadPng,
    onDownloadSvg: qr.onDownloadSvg,
    onPlatformAndroid: () => selectPlatform('android'),
    onPlatformBoth: () => selectPlatform('both'),
    onPlatformIos: () => selectPlatform('ios'),
    onRun: run,
    onSavedLinkChange: (event: ChangeEvent<HTMLSelectElement>) => {
      const selected = savedLinks.options.find((option) => option.id === event.target.value)
      setUrlDraft(selected?.url ?? '')
      runId.current += 1
      setChecks([])
      setIsRunning(false)
    },
    onUrlChange: (event: ChangeEvent<HTMLInputElement>) => {
      setUrlDraft(event.target.value)
      runId.current += 1
      setChecks([])
      setIsRunning(false)
    },
    openUrl,
    platform,
    qrDataUrl: qr.qrDataUrl,
    qrError:
      runtimeConfig.error ??
      (url.trim() && configuredOrigin && !openUrl
        ? 'Use a valid URL from the configured LinksetGo link domain to generate a QR code.'
        : qr.qrError),
    runLabel:
      platform === 'both'
        ? 'Run both platforms'
        : `Run ${platform === 'ios' ? 'iOS' : 'Android'} checks`,
    savedLinkId: selectedSavedLinkId(url, savedLinks.options),
    savedLinkOptions: savedLinks.options,
    savedLinksError: savedLinks.error,
    summary: isRunning
      ? 'Checks are running'
      : checks.length === 0
        ? 'Ready when you are'
        : failed > 0
          ? `${failed} ${failed === 1 ? 'check needs' : 'checks need'} attention`
          : `${passed} checks passed`,
    summaryDetail: isRunning
      ? 'Resolving the link and inspecting the selected platform configuration.'
      : checks.length === 0
        ? 'Run a configuration check before testing on a device.'
        : failed > 0
          ? 'Use the remediation below, publish the change and rerun.'
          : 'Web configuration passed. A real-device test is still required.',
    url,
    urlPlaceholder:
      configuredOrigin && runtimeConfig.config
        ? buildPublicURL(configuredOrigin, 'app', 'link', pathStyle)
        : pathStyle === 'shared-clean'
          ? 'https://go.example.com/app/link'
          : 'https://links.example.com/l/app/link',
  }
}
