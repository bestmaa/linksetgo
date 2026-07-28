'use client'

import { type ChangeEvent, type Dispatch, type SetStateAction, useState } from 'react'

import { type FormDraft, parseNativeDeepLink } from './links-controller.helpers'
import type { NativeImportFeedback } from './links.types'

export function useNativeLinkImport(
  setForm: Dispatch<SetStateAction<FormDraft>>,
  expectedScheme: string | null,
) {
  const [nativeUrl, setNativeUrl] = useState('')
  const [feedback, setFeedback] = useState<NativeImportFeedback | null>(null)

  const reset = () => {
    setNativeUrl('')
    setFeedback(null)
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNativeUrl(event.target.value)
    setFeedback(null)
  }

  const onImport = () => {
    if (!expectedScheme) {
      setFeedback({
        kind: 'error',
        message: 'Select an app with a configured native URL scheme before importing this route.',
      })
      return
    }
    const parsed = parseNativeDeepLink(nativeUrl, expectedScheme)
    if (!parsed.ok) {
      setFeedback({ kind: 'error', message: parsed.message })
      return
    }

    setForm((current) => ({
      ...current,
      destinationPath: parsed.destinationPath,
      parameters: parsed.parameters.map((parameter) => ({
        id: crypto.randomUUID(),
        ...parameter,
      })),
    }))
    const parameterSummary =
      parsed.parameters.length === 0
        ? 'No query parameters were present.'
        : `${parsed.parameters.length} query parameter${parsed.parameters.length === 1 ? '' : 's'} imported.`
    setFeedback({
      kind: 'success',
      message: `Imported ${parsed.destinationPath} from the ${parsed.scheme} scheme. ${parameterSummary}`,
    })
  }

  return {
    feedback,
    nativeUrl,
    onChange,
    onImport,
    reset,
  }
}
