'use client'

import { type ChangeEvent, type FormEvent, useState } from 'react'

import type { AccountEmailActionState } from './account-recovery.types'

type ErrorBody = { error: { message: string } }

const parseError = (value: unknown): ErrorBody | null => {
  if (typeof value !== 'object' || value === null) return null
  const error = (value as Record<string, unknown>).error
  if (typeof error !== 'object' || error === null) return null
  const message = (error as Record<string, unknown>).message
  return typeof message === 'string' ? { error: { message } } : null
}

function useAccountEmailAction(available: boolean, endpoint: string) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<AccountEmailActionState>({ status: 'idle' })

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!available || state.status === 'submitting') return
    setState({ status: 'submitting' })

    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ email }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const body = (await response.json()) as unknown
      if (!response.ok) {
        setState({
          status: 'error',
          message: parseError(body)?.error.message ?? 'This request could not be completed.',
        })
        return
      }
      setState({ status: 'success' })
    } catch {
      setState({
        status: 'error',
        message: 'LinksetGo Cloud could not be reached. Check your connection and try again.',
      })
    }
  }

  return {
    available,
    email,
    onEmailChange: (event: ChangeEvent<HTMLInputElement>) => {
      setEmail(event.target.value)
      if (state.status === 'error') setState({ status: 'idle' })
    },
    onSubmit,
    state,
  }
}

export const useForgotPasswordController = (available: boolean) =>
  useAccountEmailAction(available, '/api/auth/forgot-password')

export const useResendVerificationController = (available: boolean) =>
  useAccountEmailAction(available, '/api/auth/resend-verification')
