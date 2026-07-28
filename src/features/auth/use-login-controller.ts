'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'

export function useLoginController() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const destination = searchParams.get('next') === '/invite' ? '/invite' : '/admin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    void payloadClient
      .getCurrentUser()
      .then((response) => {
        if (response.user) router.replace(destination)
      })
      .catch(() => undefined)
  }, [destination, router])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.')
      return
    }
    setIsSubmitting(true)
    try {
      await payloadClient.login(email.trim(), password)
      router.replace(destination)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    email,
    error,
    isSubmitting,
    onEmailChange: (event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value),
    onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
    onSubmit,
    password,
  }
}
