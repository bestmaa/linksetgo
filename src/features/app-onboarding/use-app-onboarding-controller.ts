'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'
import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import { normalizeNativeScheme } from '@/lib/domain/native-scheme'

import {
  buildDraftAppInput,
  emptyAppOnboardingForm,
  errorForField,
  onboardingSteps,
  slugifyAppName,
  validateOnboardingStep,
} from './app-onboarding.helpers'
import type {
  AppOnboardingErrors,
  AppOnboardingField,
  AppOnboardingForm,
  AppOnboardingStep,
  AppOnboardingStepItem,
  AppPlatform,
  CreatedAppViewModel,
} from './app-onboarding.types'

const stepLabels: Record<AppOnboardingStep, string> = {
  basics: 'Basics',
  destinations: 'Destinations',
  platforms: 'Platforms',
  review: 'Review',
}

const platformLabels: Record<AppPlatform, string> = {
  android: 'Android',
  both: 'iOS and Android',
  ios: 'iOS',
}

function firstInvalidStep(form: AppOnboardingForm): {
  errors: AppOnboardingErrors
  step: AppOnboardingStep | null
} {
  for (const step of onboardingSteps.slice(0, -1)) {
    const errors = validateOnboardingStep(form, step)
    if (Object.keys(errors).length > 0) return { errors, step }
  }
  return { errors: {}, step: null }
}

export function useAppOnboardingController() {
  const router = useRouter()
  const { selectedWorkspace, selectedWorkspaceId } = useWorkspaceSelection()
  const [form, setForm] = useState<AppOnboardingForm>(emptyAppOnboardingForm)
  const [step, setStep] = useState<AppOnboardingStep>('basics')
  const [furthestStepIndex, setFurthestStepIndex] = useState(0)
  const [errors, setErrors] = useState<AppOnboardingErrors>({})
  const slugWasEdited = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdApp, setCreatedApp] = useState<CreatedAppViewModel | null>(null)

  const stepIndex = onboardingSteps.indexOf(step)

  useEffect(() => {
    document.getElementById('app-onboarding-step-title')?.focus()
  }, [step, createdApp])

  const steps = useMemo<readonly AppOnboardingStepItem[]>(
    () =>
      onboardingSteps.map((id, index) => ({
        canVisit: index <= furthestStepIndex,
        id,
        label: stepLabels[id],
        number: index + 1,
        state: index < stepIndex ? 'complete' : index === stepIndex ? 'current' : 'upcoming',
      })),
    [furthestStepIndex, stepIndex],
  )

  const moveTo = (nextStep: AppOnboardingStep) => {
    setErrors({})
    setSubmitError(null)
    setStep(nextStep)
  }

  const onNext = () => {
    const nextErrors = validateOnboardingStep(form, step)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const nextIndex = Math.min(stepIndex + 1, onboardingSteps.length - 1)
    setFurthestStepIndex((current) => Math.max(current, nextIndex))
    moveTo(onboardingSteps[nextIndex]!)
  }

  const onBack = () => {
    const previousIndex = Math.max(0, stepIndex - 1)
    moveTo(onboardingSteps[previousIndex]!)
  }

  const onFieldChange = (field: AppOnboardingField, value: string) => {
    const normalizedValue =
      field === 'slug'
        ? slugifyAppName(value)
        : field === 'nativeScheme'
          ? (normalizeNativeScheme(value) ??
            value
              .trim()
              .toLowerCase()
              .replace(/:\/\/$/, ''))
          : value

    setForm((current) => ({
      ...current,
      [field]: normalizedValue,
      ...(field === 'name' && !slugWasEdited.current ? { slug: slugifyAppName(value) } : {}),
    }))
    if (field === 'slug') slugWasEdited.current = true
    setErrors((current) => {
      if (!current[field] && !(field === 'name' && current.slug)) return current
      const next = { ...current }
      delete next[field]
      if (field === 'name' && !slugWasEdited.current) delete next.slug
      return next
    })
  }

  const onFieldBlur = (field: AppOnboardingField) => {
    setErrors((current) => {
      const next = { ...current }
      const message = errorForField(form, step, field)
      if (message) next[field] = message
      else delete next[field]
      return next
    })
  }

  const onPlatformChange = (platform: AppPlatform) => {
    setForm((current) => ({ ...current, platform }))
    if (step === 'platforms') setErrors({})
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedWorkspaceId) {
      setSubmitError('Select or create a workspace before adding an app.')
      return
    }
    const invalid = firstInvalidStep(form)
    if (invalid.step) {
      setErrors(invalid.errors)
      setStep(invalid.step)
      return
    }

    setIsSaving(true)
    setSubmitError(null)
    try {
      const app = await payloadClient.createApp({
        ...buildDraftAppInput(form),
        workspace: selectedWorkspaceId,
      })
      setCreatedApp({
        id: String(app.id),
        name: app.name,
        platformLabel: platformLabels[form.platform],
        slug: app.slug,
      })
    } catch (requestError) {
      setSubmitError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    createdApp,
    errors,
    form,
    isSaving,
    onBack,
    onBackToApps: () => router.push('/admin/apps'),
    onCancel: () => router.push('/admin/apps'),
    onCreateLink: () =>
      router.push(
        createdApp
          ? `/admin/links?create=1&app=${encodeURIComponent(createdApp.id)}`
          : '/admin/links?create=1',
      ),
    onFieldBlur,
    onFieldChange,
    onNext,
    onOpenDraft: () => {
      if (createdApp) router.push(`/admin/apps/${encodeURIComponent(createdApp.id)}`)
    },
    onPlatformChange,
    onStepSelect: (selectedStep: AppOnboardingStep) => {
      const selectedIndex = onboardingSteps.indexOf(selectedStep)
      if (selectedIndex <= furthestStepIndex) moveTo(selectedStep)
    },
    onSubmit,
    step,
    steps,
    submitError,
    workspaceName: selectedWorkspace?.name ?? null,
  }
}
