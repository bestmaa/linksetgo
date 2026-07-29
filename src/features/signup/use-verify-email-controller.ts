'use client'

import { useEffect, useState } from 'react'

import { isCloudVerificationToken } from '@/lib/domain/cloud-verification-token'

import type { VerifyEmailState } from './verify-email.types'

type VerifiedResponse = {
  email: string
  status: 'verified'
}

const parseVerifiedResponse = (value: unknown): VerifiedResponse | null => {
  if (typeof value !== 'object' || value === null) return null
  const response = value as Record<string, unknown>
  return response.status === 'verified' && typeof response.email === 'string'
    ? { email: response.email, status: 'verified' }
    : null
}

export function useVerifyEmailController() {
  const [state, setState] = useState<VerifyEmailState>({ status: 'checking' })

  useEffect(() => {
    const verify = async () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('token')
      window.history.replaceState(null, '', '/verify-email')
      if (!isCloudVerificationToken(token)) {
        setState({ status: 'error', message: 'This verification link is invalid or incomplete.' })
        return
      }

      try {
        const response = await fetch('/api/auth/verify-email', {
          body: JSON.stringify({ token }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        })
        const body = (await response.json()) as unknown
        const verified = parseVerifiedResponse(body)
        if (!response.ok || !verified) {
          setState({
            status: 'error',
            message:
              response.status >= 500
                ? 'LinksetGo Cloud could not verify this link right now. Please try again.'
                : 'This verification link is invalid, expired, or already used.',
          })
          return
        }
        setState({ status: 'verified', email: verified.email })
      } catch {
        setState({
          status: 'error',
          message: 'LinksetGo Cloud could not verify this link. Please try again.',
        })
      }
    }

    void verify()
  }, [])

  return { state }
}
