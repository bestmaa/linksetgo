import { describe, expect, it } from 'vitest'

import {
  validateAllowedHosts,
  validateAppStoreURL,
  validateHttpsURL,
  validatePlayStoreURL,
  validateSlug,
} from '@/collections/validators'
import { isFallbackURLAllowed, relationIDsMatch } from '@/lib/server/collection-guards'
import { parseLinkParameters } from '@/lib/domain/link-parameters'

const textOptions = {} as Parameters<typeof validateSlug>[1]
const manyTextOptions = {} as Parameters<typeof validateAllowedHosts>[1]

describe('security validation', () => {
  it('requires canonical slugs and HTTPS URLs', async () => {
    expect(await validateSlug('good-slug', textOptions)).toBe(true)
    expect(await validateSlug('../bad', textOptions)).not.toBe(true)
    expect(await validateHttpsURL('https://example.com/path', textOptions)).toBe(true)
    expect(await validateHttpsURL('javascript:alert(1)', textOptions)).not.toBe(true)
  })

  it('accepts only official mobile store listing URLs', async () => {
    expect(
      await validateAppStoreURL('https://apps.apple.com/in/app/relay/id123456789', textOptions),
    ).toBe(true)
    expect(
      await validatePlayStoreURL(
        'https://play.google.com/store/apps/details?id=com.example.relay',
        textOptions,
      ),
    ).toBe(true)
    expect(await validateAppStoreURL('https://phishing.example/app/relay', textOptions)).not.toBe(
      true,
    )
    expect(
      await validatePlayStoreURL(
        'https://play.google.com.evil.example/store/apps/details',
        textOptions,
      ),
    ).not.toBe(true)
  })

  it('accepts hostnames but rejects URL-shaped allowlist entries', async () => {
    expect(await validateAllowedHosts(['example.com'], manyTextOptions)).toBe(true)
    expect(await validateAllowedHosts(['https://example.com'], manyTextOptions)).not.toBe(true)
  })

  it('bounds public link parameters to small scalar objects', async () => {
    expect(
      parseLinkParameters({
        SlabName: 'Gold',
        SlabPromo: '10OFF',
        featured: true,
        page: 2,
      }).ok,
    ).toBe(true)
    expect(parseLinkParameters({ nested: { unsafe: true } }).ok).toBe(false)
    expect(parseLinkParameters({ 'bad key': 'value' }).ok).toBe(false)
    expect(
      parseLinkParameters(
        Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`key${index}`, index])),
      ).ok,
    ).toBe(false)
  })

  it('allows overrides only for an app allowlist or local development', () => {
    expect(isFallbackURLAllowed('https://example.com/path', ['example.com'], 'production')).toBe(
      true,
    )
    expect(isFallbackURLAllowed('https://evil.example/path', ['example.com'], 'production')).toBe(
      false,
    )
    expect(isFallbackURLAllowed('https://localhost/path', [], 'development')).toBe(true)
    expect(isFallbackURLAllowed('https://localhost/path', [], 'production')).toBe(false)
  })

  it('compares populated and scalar relationship IDs safely', () => {
    expect(relationIDsMatch({ id: 7 }, 7)).toBe(true)
    expect(relationIDsMatch({ id: 7 }, 8)).toBe(false)
  })
})
