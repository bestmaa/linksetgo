'use client'

import { type ChangeEvent, type FormEvent, useState } from 'react'

import type { SignupConnectorProps, SignupField, SignupSubmissionState } from './signup.types'

type ErrorResponse = {
  error: { field?: SignupField; message: string }
}

const isSignupField = (value: unknown): value is SignupField =>
  value === 'acceptTerms' ||
  value === 'email' ||
  value === 'form' ||
  value === 'name' ||
  value === 'organizationName' ||
  value === 'password' ||
  value === 'workspaceSlug'

const parseErrorResponse = (value: unknown): ErrorResponse | null => {
  if (typeof value !== 'object' || value === null) return null
  const error = (value as Record<string, unknown>).error
  if (typeof error !== 'object' || error === null) return null
  const message = (error as Record<string, unknown>).message
  const field = (error as Record<string, unknown>).field
  if (typeof message !== 'string') return null
  return {
    error: {
      message,
      ...(isSignupField(field) ? { field } : {}),
    },
  }
}

export function useSignupController(props: SignupConnectorProps) {
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [state, setState] = useState<SignupSubmissionState>({ status: 'idle' })
  const [workspaceSlug, setWorkspaceSlug] = useState('')

  const change = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value)
    if (state.status === 'error') setState({ status: 'idle' })
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!props.available || state.status === 'submitting') return

    setState({ status: 'submitting' })
    try {
      const response = await fetch('/api/auth/signup', {
        body: JSON.stringify({
          acceptTerms,
          email,
          name,
          organizationName,
          password,
          workspaceSlug,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const body = (await response.json()) as unknown
      if (!response.ok) {
        const parsed = parseErrorResponse(body)
        setState({
          status: 'error',
          message: parsed?.error.message ?? 'We could not create the account. Please try again.',
          ...(parsed?.error.field ? { field: parsed.error.field } : {}),
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
    acceptTerms,
    available: props.available,
    email,
    managedLinkRootDomain: props.managedLinkRootDomain,
    name,
    onAcceptTermsChange: (event: ChangeEvent<HTMLInputElement>) => {
      setAcceptTerms(event.target.checked)
      if (state.status === 'error') setState({ status: 'idle' })
    },
    onEmailChange: change(setEmail),
    onNameChange: change(setName),
    onOrganizationNameChange: change(setOrganizationName),
    onPasswordChange: change(setPassword),
    onShowPasswordChange: (event: ChangeEvent<HTMLInputElement>) =>
      setShowPassword(event.target.checked),
    onSubmit,
    onWorkspaceSlugChange: change((value) =>
      setWorkspaceSlug(
        value
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/-{2,}/g, '-')
          .replace(/^-+/g, ''),
      ),
    ),
    organizationName,
    password,
    showPassword,
    state,
    workspaceSlug,
  }
}
