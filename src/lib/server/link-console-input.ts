import 'server-only'

import { parseLinkParameters } from '@/lib/domain/link-parameters'
import type {
  LinkConsoleConfigurationInput,
  LinkConsoleMutationInput,
} from '@/lib/client/payload-types'
import { normalizeConsoleAppIdentifier } from './app-console-input'

type ParseResult = { message: string; ok: false } | { ok: true; value: LinkConsoleMutationInput }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const configurationKeys = new Set<keyof LinkConsoleConfigurationInput>([
  'destinationPath',
  'expiresAt',
  'fallbackUrl',
  'name',
  'parameters',
])

function optionalText(value: unknown, maximum: number): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' && value.length <= maximum ? value : undefined
}

function parseConfiguration(value: unknown): LinkConsoleConfigurationInput | null {
  if (!isRecord(value)) return null
  if (
    Object.keys(value).some(
      (key) => !configurationKeys.has(key as keyof LinkConsoleConfigurationInput),
    )
  ) {
    return null
  }

  const name = optionalText(value.name, 160)
  const destinationPath = optionalText(value.destinationPath, 2048)
  const fallbackUrl = optionalText(value.fallbackUrl, 2048)
  const expiresAt = optionalText(value.expiresAt, 64)
  const parsedParameters = parseLinkParameters(value.parameters)
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    typeof destinationPath !== 'string' ||
    !destinationPath.trim() ||
    fallbackUrl === undefined ||
    expiresAt === undefined ||
    (typeof expiresAt === 'string' && Number.isNaN(Date.parse(expiresAt))) ||
    !parsedParameters.ok ||
    (parsedParameters.value &&
      Object.values(parsedParameters.value).some((parameter) => typeof parameter !== 'string'))
  ) {
    return null
  }

  return {
    destinationPath,
    expiresAt,
    fallbackUrl,
    name,
    parameters: (parsedParameters.value ?? {}) as Record<string, string>,
  }
}

export function parseLinkConsoleMutation(value: unknown): ParseResult {
  if (!isRecord(value)) return { message: 'Enter a valid link update.', ok: false }
  const workspaceId = normalizeConsoleAppIdentifier(value.workspaceId)
  const action = value.action
  if (!workspaceId || (action !== 'save' && action !== 'activate' && action !== 'pause')) {
    return { message: 'Select a workspace and valid link action.', ok: false }
  }

  const allowedKeys =
    action === 'save'
      ? new Set(['action', 'configuration', 'workspaceId'])
      : new Set(['action', 'workspaceId'])
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return {
      message: 'The permanent app and link key cannot be changed here.',
      ok: false,
    }
  }

  if (action === 'save') {
    const configuration = parseConfiguration(value.configuration)
    return configuration
      ? { ok: true, value: { action, configuration, workspaceId } }
      : { message: 'Review the editable link fields and try again.', ok: false }
  }
  return { ok: true, value: { action, workspaceId } }
}
