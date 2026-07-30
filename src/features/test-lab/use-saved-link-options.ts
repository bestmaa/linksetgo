'use client'

import { useEffect, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { PublicLinkPathStyle } from '@/lib/domain/runtime-link-config'

import { buildSavedLinkOptions } from './test-lab-controller.helpers'
import type { SavedLinkOptionViewModel } from './test-lab.types'

type SavedLinksState =
  | { kind: 'error'; message: string; scope: string }
  | { kind: 'idle' }
  | { kind: 'loading'; scope: string }
  | { kind: 'ready'; options: SavedLinkOptionViewModel[]; scope: string }

export function useSavedLinkOptions(
  configuredOrigin: string | null,
  pathStyle: PublicLinkPathStyle,
  workspaceID: string | null,
) {
  const [state, setState] = useState<SavedLinksState>({ kind: 'idle' })
  const scope =
    configuredOrigin && workspaceID ? `${workspaceID}:${configuredOrigin}:${pathStyle}` : null

  useEffect(() => {
    if (!configuredOrigin || !workspaceID || !scope) return

    let active = true
    const timeout = window.setTimeout(() => {
      setState({ kind: 'loading', scope })
      void payloadClient
        .listApps({ limit: 100, workspaceId: workspaceID })
        .then(async (appsResponse) => {
          const appIDs = appsResponse.docs.map((app) => app.id)
          const linksResponse =
            appIDs.length > 0
              ? await payloadClient.listDeepLinks({ appIds: appIDs, limit: 100 })
              : { docs: [] }
          if (!active) return
          setState({
            kind: 'ready',
            options: buildSavedLinkOptions(
              linksResponse.docs,
              appsResponse.docs,
              configuredOrigin,
              pathStyle,
            ),
            scope,
          })
        })
        .catch((requestError: unknown) => {
          if (active) {
            setState({ kind: 'error', message: errorMessage(requestError), scope })
          }
        })
    }, 0)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [configuredOrigin, pathStyle, scope, workspaceID])

  const isCurrent = state.kind !== 'idle' && state.scope === scope
  return {
    error: state.kind === 'error' && isCurrent ? state.message : null,
    isLoading: state.kind === 'loading' && isCurrent,
    options: state.kind === 'ready' && isCurrent ? state.options : [],
  }
}
