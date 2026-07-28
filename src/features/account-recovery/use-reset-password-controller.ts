'use client'

import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'

import { isPasswordResetToken, isStrongAccountPassword } from '@/lib/domain/account-recovery'

import type { ResetPasswordState } from './account-recovery.types'

export function useResetPasswordController(available: boolean) {
  const [confirmPassword, setConfirmPassword] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [state, setState] = useState<ResetPasswordState>({ status: 'checking' })
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const candidate = new URLSearchParams(window.location.hash.slice(1)).get('token')
      window.history.replaceState(null, '', '/reset-password')
      if (!available) {
        setState({ status: 'invalid', message: 'Account recovery is unavailable.' })
        return
      }
      if (!isPasswordResetToken(candidate)) {
        setState({ status: 'invalid', message: 'This reset link is invalid or incomplete.' })
        return
      }
      setToken(candidate)
      setState({ status: 'idle' })
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [available])

  const change = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value)
    if (state.status === 'error') setState(token ? { status: 'idle' } : state)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token || state.status === 'submitting') return
    if (!isStrongAccountPassword(password)) {
      setState({
        status: 'error',
        message: 'Use 12–128 characters with upper, lower, number, and symbol.',
      })
      return
    }
    if (password !== confirmPassword) {
      setState({ status: 'error', message: 'The passwords do not match.' })
      return
    }

    setState({ status: 'submitting' })
    try {
      const response = await fetch('/api/auth/reset-password', {
        body: JSON.stringify({ password, token }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        setToken(null)
        setState({
          status: 'invalid',
          message: 'This reset link is invalid, expired, or already used.',
        })
        return
      }
      setToken(null)
      setPassword('')
      setConfirmPassword('')
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
    confirmPassword,
    onConfirmPasswordChange: change(setConfirmPassword),
    onPasswordChange: change(setPassword),
    onShowPasswordChange: (event: ChangeEvent<HTMLInputElement>) =>
      setShowPassword(event.target.checked),
    onSubmit,
    password,
    showPassword,
    state,
  }
}
