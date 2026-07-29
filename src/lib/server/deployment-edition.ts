export type LinksetGoEdition = 'cloud' | 'community'

export function getLinksetGoEdition(
  configuredValue: string | undefined = process.env.RELAY_EDITION,
): LinksetGoEdition {
  return configuredValue?.trim().toLowerCase() === 'cloud' ? 'cloud' : 'community'
}

export function requireCloudEdition(
  configuredValue: string | undefined = process.env.RELAY_EDITION,
): void {
  if (getLinksetGoEdition(configuredValue) !== 'cloud') {
    throw new Error('This operation is available only in LinksetGo Cloud mode.')
  }
}
