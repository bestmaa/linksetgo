export function normalizeAbuseTarget(value: string | null | undefined): string {
  const candidate = value?.trim() ?? ''
  if (!candidate || candidate.length > 2_048) return ''

  try {
    const url = new URL(candidate)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname ||
      url.pathname.length > 512
    ) {
      return ''
    }
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

export function validOptionalContact(value: string): boolean {
  const contact = value.trim()
  return !contact || (contact.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
}
