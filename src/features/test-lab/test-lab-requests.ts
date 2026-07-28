import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { AppDTO, PublicLinkResponse } from '@/lib/client/payload-types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const optionalText = (value: unknown): boolean =>
  value === undefined || value === null || typeof value === 'string'

const scalarParameters = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (isRecord(value) &&
    Object.values(value).every(
      (item) =>
        item === null ||
        typeof item === 'boolean' ||
        typeof item === 'number' ||
        typeof item === 'string',
    ))

function isPublicLinkResponse(value: unknown): value is PublicLinkResponse {
  if (!isRecord(value) || !isRecord(value.app) || !isRecord(value.link)) return false
  return (
    value.status === 'active' &&
    typeof value.publicUrl === 'string' &&
    typeof value.app.name === 'string' &&
    typeof value.app.slug === 'string' &&
    typeof value.app.fallbackUrl === 'string' &&
    optionalText(value.app.appStoreUrl) &&
    optionalText(value.app.playStoreUrl) &&
    typeof value.link.name === 'string' &&
    typeof value.link.slug === 'string' &&
    typeof value.link.destinationPath === 'string' &&
    optionalText(value.link.nativeUrl) &&
    value.link.status === 'active' &&
    optionalText(value.link.expiresAt) &&
    optionalText(value.link.fallbackUrl) &&
    scalarParameters(value.link.parameters)
  )
}

async function publicError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as unknown
    if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') {
      return body.error.message
    }
    return `Public resolver returned ${response.status}.`
  } catch {
    return `Public resolver returned ${response.status}.`
  }
}

export async function checkPublicLink(origin: string, appSlug: string, linkSlug: string) {
  try {
    const endpoint = new URL(
      `/api/public/links/${encodeURIComponent(appSlug)}/${encodeURIComponent(linkSlug)}`,
      origin,
    )
    const response = await fetch(endpoint, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { accept: 'application/json' },
    })
    if (!response.ok) throw new Error(await publicError(response))
    const body = (await response.json()) as unknown
    if (!isPublicLinkResponse(body)) throw new Error('Public resolver returned invalid data.')
    return {
      data: body,
      error: null,
    } satisfies { data: PublicLinkResponse | null; error: string | null }
  } catch (requestError) {
    return {
      data: null,
      error: errorMessage(requestError),
    } satisfies { data: PublicLinkResponse | null; error: string | null }
  }
}

export async function loadAppConfiguration(slug: string, workspaceID: string) {
  try {
    return {
      data: await payloadClient.getAppBySlug(slug, workspaceID),
      error: null,
    } satisfies { data: AppDTO | null; error: string | null }
  } catch (requestError) {
    return {
      data: null,
      error: errorMessage(requestError),
    } satisfies { data: AppDTO | null; error: string | null }
  }
}
