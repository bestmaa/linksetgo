export type RelayEdition = 'cloud' | 'community'

export function getRelayEdition(
  configuredValue: string | undefined = process.env.RELAY_EDITION,
): RelayEdition {
  return configuredValue?.trim().toLowerCase() === 'cloud' ? 'cloud' : 'community'
}

export function requireCloudEdition(
  configuredValue: string | undefined = process.env.RELAY_EDITION,
): void {
  if (getRelayEdition(configuredValue) !== 'cloud') {
    throw new Error('This operation is available only in Relay Cloud mode.')
  }
}
