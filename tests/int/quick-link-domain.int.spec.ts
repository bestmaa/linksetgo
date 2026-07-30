import { MAX_QUICK_LINK_BODY_BYTES, parseQuickLinkInput } from '@/lib/domain/quick-link'
import { describe, expect, it } from 'vitest'

describe('quick-link request parsing', () => {
  it('normalizes a complete native-link request and official store URLs', () => {
    const result = parseQuickLinkInput({
      appStoreUrl: ' https://apps.apple.com/in/app/oberoi-mall/id123456789 ',
      fallbackUrl: ' https://Download.Example.COM/mobile?from=link ',
      name: ' Rewards detail ',
      nativeUrl: ' oberoi://rewards-detail?SlabName=Gold&SlabPromo=10OFF ',
      playStoreUrl: ' https://play.google.com/store/apps/details?id=com.oberoidev ',
      workspaceId: ' 42 ',
    })

    expect(result).toEqual({
      ok: true,
      value: {
        appStoreUrl: 'https://apps.apple.com/in/app/oberoi-mall/id123456789',
        fallbackUrl: 'https://download.example.com/mobile?from=link',
        name: 'Rewards detail',
        nativeUrl: 'oberoi://rewards-detail?SlabName=Gold&SlabPromo=10OFF',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.oberoidev',
        workspaceId: '42',
      },
    })
  })

  it('keeps every optional destination unset when the form omits it', () => {
    expect(
      parseQuickLinkInput({
        nativeUrl: 'oberoi://home',
        workspaceId: 'workspace_1',
      }),
    ).toEqual({
      ok: true,
      value: {
        appStoreUrl: null,
        fallbackUrl: null,
        name: null,
        nativeUrl: 'oberoi://home',
        playStoreUrl: null,
        workspaceId: 'workspace_1',
      },
    })
  })

  it.each([
    [null, 'form'],
    [[], 'form'],
    [{ nativeUrl: 'oberoi://home', unexpected: true, workspaceId: '1' }, 'form'],
    [{ nativeUrl: 'oberoi://home', workspaceId: '../other' }, 'workspaceId'],
    [{ nativeUrl: 'https://example.com/home', workspaceId: '1' }, 'nativeUrl'],
    [{ nativeUrl: 'oberoi://home#fragment', workspaceId: '1' }, 'nativeUrl'],
    [
      { fallbackUrl: 'http://example.com', nativeUrl: 'oberoi://home', workspaceId: '1' },
      'fallbackUrl',
    ],
    [
      { fallbackUrl: 'https://127.0.0.1/app', nativeUrl: 'oberoi://home', workspaceId: '1' },
      'fallbackUrl',
    ],
    [
      {
        appStoreUrl: 'https://apps.apple.com.attacker.test/app/oberoi',
        nativeUrl: 'oberoi://home',
        workspaceId: '1',
      },
      'appStoreUrl',
    ],
    [
      {
        nativeUrl: 'oberoi://home',
        playStoreUrl: 'https://play.google.com.attacker.test/store/apps/details?id=com.oberoi',
        workspaceId: '1',
      },
      'playStoreUrl',
    ],
  ] as const)('rejects unsafe or unexpected input %#', (value, field) => {
    expect(parseQuickLinkInput(value)).toMatchObject({ field, ok: false })
  })

  it('enforces the bounded display-name and request-size contracts', () => {
    expect(
      parseQuickLinkInput({
        name: 'n'.repeat(161),
        nativeUrl: 'oberoi://home',
        workspaceId: '1',
      }),
    ).toMatchObject({ field: 'name', ok: false })
    expect(MAX_QUICK_LINK_BODY_BYTES).toBe(16 * 1024)
  })
})
