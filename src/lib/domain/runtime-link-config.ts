export type PublicLinkPathStyle = 'host-scoped' | 'shared-clean'

export type RuntimeLinkConfig = {
  baseUrl: string
  hostname: string
  pathStyle: PublicLinkPathStyle
  source: 'custom' | 'installation' | 'managed' | 'shared'
  workspaceId: string
}

type RuntimeDomain = {
  hostname: string
  status: string
  type: 'custom' | 'managed'
}

const sources = new Set<RuntimeLinkConfig['source']>([
  'custom',
  'installation',
  'managed',
  'shared',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseRuntimeLinkConfig(value: unknown): RuntimeLinkConfig | null {
  if (!isRecord(value)) return null

  const { baseUrl, hostname, source, workspaceId } = value
  const pathStyle =
    value.pathStyle === undefined && source !== 'shared' ? 'host-scoped' : value.pathStyle
  if (
    typeof baseUrl !== 'string' ||
    typeof hostname !== 'string' ||
    (pathStyle !== 'host-scoped' && pathStyle !== 'shared-clean') ||
    typeof source !== 'string' ||
    !sources.has(source as RuntimeLinkConfig['source']) ||
    typeof workspaceId !== 'string' ||
    (source === 'shared' && pathStyle !== 'shared-clean') ||
    (source !== 'shared' && pathStyle !== 'host-scoped')
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
    pathStyle,
    source: source as RuntimeLinkConfig['source'],
    workspaceId,
  }
}

export function selectRuntimeLinkConfig(input: {
  domains: readonly RuntimeDomain[]
  edition: 'cloud' | 'community'
  installationBaseURL: string
  preferShared?: boolean
  sharedEligible?: boolean
  sharedBaseURL?: null | string
  workspaceID: string
}): RuntimeLinkConfig | null {
  const sharedConfig = (): RuntimeLinkConfig | null => {
    if (input.sharedEligible === false || !input.sharedBaseURL) return null
    const sharedURL = new URL(input.sharedBaseURL)
    return {
      baseUrl: sharedURL.origin,
      hostname: sharedURL.hostname,
      pathStyle: 'shared-clean',
      source: 'shared',
      workspaceId: input.workspaceID,
    }
  }
  if (input.edition === 'cloud' && input.preferShared) {
    const selectedShared = sharedConfig()
    if (selectedShared) return selectedShared
  }

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
      pathStyle: 'host-scoped',
      source: selectedDomain.type,
      workspaceId: input.workspaceID,
    }
  }
  if (input.edition === 'cloud') {
    return sharedConfig()
  }

  const installationURL = new URL(input.installationBaseURL)
  return {
    baseUrl: installationURL.origin,
    hostname: installationURL.hostname,
    pathStyle: 'host-scoped',
    source: 'installation',
    workspaceId: input.workspaceID,
  }
}
