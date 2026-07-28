export type RuntimeLinkConfig = {
  baseUrl: string
  hostname: string
  source: 'custom' | 'installation' | 'managed'
  workspaceId: string
}

type RuntimeDomain = {
  hostname: string
  status: string
  type: 'custom' | 'managed'
}

const sources = new Set<RuntimeLinkConfig['source']>(['custom', 'installation', 'managed'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseRuntimeLinkConfig(value: unknown): RuntimeLinkConfig | null {
  if (!isRecord(value)) return null

  const { baseUrl, hostname, source, workspaceId } = value
  if (
    typeof baseUrl !== 'string' ||
    typeof hostname !== 'string' ||
    typeof source !== 'string' ||
    !sources.has(source as RuntimeLinkConfig['source']) ||
    typeof workspaceId !== 'string'
  ) {
    return null
  }

  try {
    const url = new URL(baseUrl)
    const isLoopback =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if (
      url.origin !== baseUrl ||
      url.hostname !== hostname ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback))
    ) {
      return null
    }
  } catch {
    return null
  }

  return {
    baseUrl,
    hostname,
    source: source as RuntimeLinkConfig['source'],
    workspaceId,
  }
}

export function selectRuntimeLinkConfig(input: {
  domains: readonly RuntimeDomain[]
  edition: 'cloud' | 'community'
  installationBaseURL: string
  workspaceID: string
}): RuntimeLinkConfig | null {
  const activeDomains = [...input.domains]
    .filter((domain) => domain.status === 'active')
    .sort(
      (left, right) =>
        Number(left.type === 'managed') - Number(right.type === 'managed') ||
        left.hostname.localeCompare(right.hostname),
    )
  const selectedDomain = activeDomains[0]
  if (selectedDomain) {
    return {
      baseUrl: `https://${selectedDomain.hostname}`,
      hostname: selectedDomain.hostname,
      source: selectedDomain.type,
      workspaceId: input.workspaceID,
    }
  }
  if (input.edition === 'cloud') return null

  const installationURL = new URL(input.installationBaseURL)
  return {
    baseUrl: installationURL.origin,
    hostname: installationURL.hostname,
    source: 'installation',
    workspaceId: input.workspaceID,
  }
}
