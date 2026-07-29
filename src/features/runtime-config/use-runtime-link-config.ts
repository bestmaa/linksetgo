'use client'

import { useCallback, useEffect, useState } from 'react'

import { parseRuntimeLinkConfig, type RuntimeLinkConfig } from '@/lib/domain/runtime-link-config'

type RuntimeConfigState =
  | { kind: 'error'; message: string; workspaceID: string }
  | { kind: 'idle' }
  | { kind: 'loading'; workspaceID: string }
  | { config: RuntimeLinkConfig; kind: 'ready' }

async function readError(response: Response): Promise<string> {
  try {
    const value = (await response.json()) as unknown
    if (
      typeof value === 'object' &&
      value !== null &&
      'error' in value &&
      typeof value.error === 'object' &&
      value.error !== null &&
      'message' in value.error &&
      typeof value.error.message === 'string'
    ) {
      return value.error.message
    }
  } catch {
    // The bounded fallback below avoids exposing an upstream response body.
  }

  return 'LinksetGo could not load this workspace link domain.'
}

export function useRuntimeLinkConfig(workspaceID: string | null) {
  const [state, setState] = useState<RuntimeConfigState>({ kind: 'idle' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!workspaceID) return

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setState({ kind: 'loading', workspaceID })
      void fetch(`/api/admin/runtime-config?workspaceId=${encodeURIComponent(workspaceID)}`, {
        cache: 'no-store',
        credentials: 'include',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(await readError(response))
          const config = parseRuntimeLinkConfig((await response.json()) as unknown)
          if (!config || config.workspaceId !== workspaceID) {
            throw new Error('LinksetGo returned an invalid workspace link domain.')
          }
          setState({ config, kind: 'ready' })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Workspace domain loading failed.',
            workspaceID,
          })
        })
    }, 0)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [reloadKey, workspaceID])

  const reload = useCallback(() => setReloadKey((value) => value + 1), [])
  const isCurrentWorkspace =
    state.kind === 'ready'
      ? state.config.workspaceId === workspaceID
      : state.kind !== 'idle' && state.workspaceID === workspaceID

  return {
    config: state.kind === 'ready' && isCurrentWorkspace ? state.config : null,
    error: state.kind === 'error' && isCurrentWorkspace ? state.message : null,
    isLoading: state.kind === 'loading' && isCurrentWorkspace,
    reload,
  }
}
