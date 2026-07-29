'use client'

import { useRouter } from 'next/navigation'
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import { isCloudVerificationToken } from '@/lib/domain/cloud-verification-token'

import type { TeamInviteState, TeamInviteViewProps } from './team-invite.types'

const SESSION_KEY = 'relay.pending-team-invitation'

const readInvitationToken = (): string | null => {
  const hashToken = new URLSearchParams(window.location.hash.slice(1)).get('token')
  if (isCloudVerificationToken(hashToken)) return hashToken
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY)
    return isCloudVerificationToken(stored) ? stored : null
  } catch {
    return null
  }
}

const clearInvitationToken = (): void => {
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Token still disappears when this page closes.
  }
}

export function useTeamInviteController(): TeamInviteViewProps {
  const router = useRouter()
  const token = useRef<string | null>(null)
  const [state, setState] = useState<TeamInviteState>({ status: 'checking' })
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const preview = async (value: string) => {
    try {
      setState({
        preview: await payloadClient.previewTeamInvitation(value),
        status: 'ready',
      })
    } catch (requestError) {
      clearInvitationToken()
      setState({ message: errorMessage(requestError), status: 'error' })
    }
  }

  useEffect(() => {
    token.current = readInvitationToken()
    window.history.replaceState(null, '', '/invite')
    if (!token.current) {
      setState({
        message: 'This invitation link is invalid or incomplete.',
        status: 'error',
      })
      return
    }
    void preview(token.current)
  }, [])

  const accept = async (account?: { name: string; password: string }) => {
    if (!token.current || state.status !== 'ready') return
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await payloadClient.acceptTeamInvitation({
        ...account,
        token: token.current,
      })
      clearInvitationToken()
      token.current = null
      setState({
        organizationName: result.organizationName,
        signInRequired: result.signInRequired,
        status: 'accepted',
      })
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const createAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    void accept({ name: name.trim(), password })
  }

  const switchAccount = async () => {
    setError(null)
    setIsSubmitting(true)
    try {
      await payloadClient.logout()
      if (token.current) await preview(token.current)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const signIn = () => {
    if (!token.current) return
    try {
      window.sessionStorage.setItem(SESSION_KEY, token.current)
    } catch {
      setError('Reopen the invitation after signing in to continue.')
      return
    }
    router.push('/admin/login?next=/invite')
  }

  return {
    confirmPassword,
    error,
    isSubmitting,
    name,
    onAccept: () => void accept(),
    onConfirmPasswordChange: (event: ChangeEvent<HTMLInputElement>) =>
      setConfirmPassword(event.currentTarget.value),
    onCreateAccount: createAccount,
    onNameChange: (event: ChangeEvent<HTMLInputElement>) => setName(event.currentTarget.value),
    onOpenLinksetGo: () =>
      router.push(state.status === 'accepted' && state.signInRequired ? '/admin/login' : '/admin'),
    onPasswordChange: (event: ChangeEvent<HTMLInputElement>) =>
      setPassword(event.currentTarget.value),
    onSignIn: signIn,
    onUseDifferentAccount: () => void switchAccount(),
    password,
    state,
  }
}
