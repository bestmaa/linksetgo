import type {
  LinkConsoleConfigurationInput,
  LinkConsoleDetailDTO,
} from '@/lib/client/payload-types'
import { appDestinationPathError } from '@/lib/domain/app-route'

import type { LinkDetailForm, LinkDetailFormErrors, LinkParameterDraft } from './link-detail.types'

export const emptyLinkDetailForm: LinkDetailForm = {
  destinationPath: '',
  expiresAt: '',
  fallbackUrl: '',
  name: '',
  parameters: [],
}

export function linkDetailFormFromDTO(detail: LinkConsoleDetailDTO): LinkDetailForm {
  return {
    destinationPath: detail.link.destinationPath,
    expiresAt: detail.link.expiresAt?.slice(0, 10) ?? '',
    fallbackUrl: detail.link.fallbackUrl ?? '',
    name: detail.link.name,
    parameters: Object.entries(detail.link.parameters).map(([key, value]) => ({
      id: crypto.randomUUID(),
      key,
      value,
    })),
  }
}

function secureURL(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
  } catch {
    return false
  }
}

export function validateLinkDetailForm(form: LinkDetailForm): LinkDetailFormErrors {
  const errors: LinkDetailFormErrors = {}
  if (!form.name.trim()) errors.name = 'Enter a link name.'
  else if (form.name.trim().length > 160) errors.name = 'Keep the name under 160 characters.'
  const destinationPathError = appDestinationPathError(form.destinationPath)
  if (destinationPathError) errors.destinationPath = destinationPathError
  if (form.fallbackUrl.trim() && !secureURL(form.fallbackUrl.trim())) {
    errors.fallbackUrl = 'Use an HTTPS URL without credentials or an explicit port.'
  }
  if (form.expiresAt && Number.isNaN(Date.parse(`${form.expiresAt}T23:59:59.999Z`))) {
    errors.expiresAt = 'Choose a valid expiry date.'
  }
  const usedKeys = new Set<string>()
  if (
    form.parameters.length > 20 ||
    form.parameters.some(({ key, value }) => {
      const normalizedKey = key.trim()
      const invalid =
        !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(normalizedKey) ||
        usedKeys.has(normalizedKey) ||
        value.length > 512
      usedKeys.add(normalizedKey)
      return invalid
    })
  ) {
    errors.parameters = 'Use up to 20 unique safe keys with values under 512 characters.'
  }
  return errors
}

export function linkConfiguration(form: LinkDetailForm): LinkConsoleConfigurationInput {
  return {
    destinationPath: form.destinationPath.trim(),
    expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59.999Z`).toISOString() : null,
    fallbackUrl: form.fallbackUrl.trim() || null,
    name: form.name.trim(),
    parameters: Object.fromEntries(form.parameters.map(({ key, value }) => [key.trim(), value])),
  }
}

export function updateParameter(
  parameters: readonly LinkParameterDraft[],
  id: string,
  field: 'key' | 'value',
  value: string,
): LinkParameterDraft[] {
  return parameters.map((parameter) =>
    parameter.id === id ? { ...parameter, [field]: value } : parameter,
  )
}
