export function storeURLForUserAgent(
  userAgent: string,
  stores: {
    appStoreUrl?: null | string
    playStoreUrl?: null | string
  },
): null | string {
  if (/\bAndroid\b/i.test(userAgent)) return stores.playStoreUrl ?? null
  if (/\b(iPhone|iPad|iPod)\b/i.test(userAgent)) return stores.appStoreUrl ?? null
  return null
}
