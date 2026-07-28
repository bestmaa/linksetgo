import { describe, expect, it } from 'vitest'

import { parseNativeDeepLink } from '@/features/links/links-controller.helpers'
import { nativeSchemeURL, normalizeNativeScheme } from '@/lib/domain/native-scheme'

describe('React Native custom-scheme URL parser', () => {
  it('imports the route and scalar parameters from the Oberoi example', () => {
    expect(parseNativeDeepLink('oberoi://rewards-detail?SlabName=Gold&SlabPromo=10OFF')).toEqual({
      ok: true,
      destinationPath: '/rewards-detail',
      parameters: [
        { key: 'SlabName', value: 'Gold' },
        { key: 'SlabPromo', value: '10OFF' },
      ],
      scheme: 'oberoi',
    })
  })

  it('imports a route with no query parameters', () => {
    expect(parseNativeDeepLink('oberoi://home', 'oberoi')).toEqual({
      ok: true,
      destinationPath: '/home',
      parameters: [],
      scheme: 'oberoi',
    })
  })

  it('round trips Oberoi routes without turning the native URL into a public URL', () => {
    const parsed = parseNativeDeepLink('oberoi://rewards-detail?SlabName=Gold', 'oberoi')
    expect(parsed).toMatchObject({ ok: true, destinationPath: '/rewards-detail' })
    if (!parsed.ok) throw new Error(parsed.message)
    expect(nativeSchemeURL('oberoi', parsed.destinationPath)).toBe('oberoi://rewards-detail')
    expect(nativeSchemeURL('https', parsed.destinationPath)).toBeNull()
  })

  it('rejects a native URL that belongs to a different selected app', () => {
    const result = parseNativeDeepLink('otherapp://home', 'oberoi')
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toMatch(/selected app expects oberoi/i)
  })

  it('normalizes guided scheme input while rejecting browser schemes', () => {
    expect(normalizeNativeScheme(' Oberoi:// ')).toBe('oberoi')
    expect(normalizeNativeScheme('https')).toBeNull()
    expect(normalizeNativeScheme('1oberoi')).toBeNull()
  })

  it('uses the same scalar parameter limits as the server', () => {
    const tooMany = new URLSearchParams(
      Array.from({ length: 21 }, (_, index) => [`key${index}`, String(index)]),
    )
    const tooManyResult = parseNativeDeepLink(`oberoi://home?${tooMany}`)
    expect(tooManyResult).toMatchObject({ ok: false })
    if (!tooManyResult.ok) expect(tooManyResult.message).toMatch(/at most 20/i)

    const longValueResult = parseNativeDeepLink(`oberoi://home?promo=${'x'.repeat(513)}`)
    expect(longValueResult).toMatchObject({ ok: false })
    if (!longValueResult.ok) expect(longValueResult.message).toMatch(/at most 512/i)
  })

  it('supports a nested route and URL-decoded scalar query values', () => {
    expect(parseNativeDeepLink('oberoi://brands/details?brandName=Nike%20Air')).toMatchObject({
      ok: true,
      destinationPath: '/brands/details',
      parameters: [{ key: 'brandName', value: 'Nike Air' }],
    })
  })

  it.each([
    ['https://example.com/rewards', /custom scheme/i],
    ['oberoi://', /non-empty path/i],
    ['oberoi://home#section', /fragments/i],
    ['oberoi://home/%2e%2e/admin', /unsafe path segment/i],
    ['oberoi://home?x=1&x=2', /appears more than once/i],
    ['oberoi://home?__proto__=polluted', /safe key/i],
    ['oberoi://home?promo=%0Aunsafe', /invalid or oversized/i],
    ['oberoi://home?promo=%ZZ', /invalid characters or encoding/i],
  ])('rejects unsafe or ambiguous input: %s', (input, expectedMessage) => {
    const result = parseNativeDeepLink(input)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(expectedMessage)
  })
})
