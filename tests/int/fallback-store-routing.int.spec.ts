import { describe, expect, it } from 'vitest'

import { storeURLForUserAgent } from '@/features/fallback/fallback.helpers'

const stores = {
  appStoreUrl: 'https://apps.apple.com/app/example/id123',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example',
}

describe('fallback store routing', () => {
  it('selects only the matching official mobile store', () => {
    expect(
      storeURLForUserAgent(
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/136 Mobile',
        stores,
      ),
    ).toBe(stores.playStoreUrl)
    expect(
      storeURLForUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15',
        stores,
      ),
    ).toBe(stores.appStoreUrl)
  })

  it('keeps desktop and missing-store visitors on the neutral landing page', () => {
    expect(storeURLForUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', stores)).toBeNull()
    expect(
      storeURLForUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9)', {
        appStoreUrl: stores.appStoreUrl,
      }),
    ).toBeNull()
  })
})
