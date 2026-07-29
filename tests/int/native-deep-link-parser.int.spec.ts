import { describe, expect, it } from 'vitest'

import { parseNativeDeepLink } from '@/features/links/links-controller.helpers'
import { nativeSchemeURL, normalizeNativeScheme } from '@/lib/domain/native-scheme'

describe('React Native custom-scheme URL parser', () => {
  it('imports the route and scalar parameters from the Example example', () => {
    expect(parseNativeDeepLink('example://rewards-detail?SlabName=Gold&SlabPromo=10OFF')).toEqual({
      ok: true,
      destinationPath: '/rewards-detail',
      parameters: [
        { key: 'SlabName', value: 'Gold' },
        { key: 'SlabPromo', value: '10OFF' },
      ],
      scheme: 'example',
    })
  })

  it('imports a route with no query parameters', () => {
    expect(parseNativeDeepLink('example://home', 'example')).toEqual({
      ok: true,
      destinationPath: '/home',
      parameters: [],
      scheme: 'example',
    })
  })

  it('round trips Example routes without turning the native URL into a public URL', () => {
    const parsed = parseNativeDeepLink('example://rewards-detail?SlabName=Gold', 'example')
    expect(parsed).toMatchObject({ ok: true, destinationPath: '/rewards-detail' })
    if (!parsed.ok) throw new Error(parsed.message)
    expect(nativeSchemeURL('example', parsed.destinationPath)).toBe('example://rewards-detail')
    expect(nativeSchemeURL('https', parsed.destinationPath)).toBeNull()
  })

  it('rejects a native URL that belongs to a different selected app', () => {
    const result = parseNativeDeepLink('otherapp://home', 'example')
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toMatch(/selected app expects example/i)
  })

  it('normalizes guided scheme input while rejecting browser schemes', () => {
    expect(normalizeNativeScheme(' Example:// ')).toBe('example')
    expect(normalizeNativeScheme('https')).toBeNull()
    expect(normalizeNativeScheme('1example')).toBeNull()
  })

  it('uses the same scalar parameter limits as the server', () => {
    const tooMany = new URLSearchParams(
      Array.from({ length: 21 }, (_, index) => [`key${index}`, String(index)]),
    )
    const tooManyResult = parseNativeDeepLink(`example://home?${tooMany}`)
    expect(tooManyResult).toMatchObject({ ok: false })
    if (!tooManyResult.ok) expect(tooManyResult.message).toMatch(/at most 20/i)

    const longValueResult = parseNativeDeepLink(`example://home?promo=${'x'.repeat(513)}`)
    expect(longValueResult).toMatchObject({ ok: false })
    if (!longValueResult.ok) expect(longValueResult.message).toMatch(/at most 512/i)
  })

  it('supports a nested route and URL-decoded scalar query values', () => {
    expect(parseNativeDeepLink('example://brands/details?brandName=Example%20Brand')).toMatchObject(
      {
        ok: true,
        destinationPath: '/brands/details',
        parameters: [{ key: 'brandName', value: 'Example Brand' }],
      },
    )
  })

  it.each([
    ['https://example.com/rewards', /custom scheme/i],
    ['example://', /non-empty path/i],
    ['example://home#section', /fragments/i],
    ['example://home/%2e%2e/admin', /unsafe path segment/i],
    ['example://home?x=1&x=2', /appears more than once/i],
    ['example://home?__proto__=polluted', /safe key/i],
    ['example://home?promo=%0Aunsafe', /invalid or oversized/i],
    ['example://home?promo=%ZZ', /invalid characters or encoding/i],
  ])('rejects unsafe or ambiguous input: %s', (input, expectedMessage) => {
    const result = parseNativeDeepLink(input)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(expectedMessage)
  })
})
