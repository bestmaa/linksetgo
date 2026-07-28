import { describe, expect, it } from 'vitest'

import {
  parseFallbackOriginAction,
  parseFallbackOriginRegistration,
} from '@/lib/domain/fallback-origin-console-input'

describe('fallback-origin admin input', () => {
  it('accepts only exact registration fields', () => {
    expect(
      parseFallbackOriginRegistration({
        hostname: 'www.company.example',
        workspaceId: '42',
      }),
    ).toEqual({
      hostname: 'www.company.example',
      ok: true,
      workspaceID: '42',
    })
    expect(
      parseFallbackOriginRegistration({
        hostname: 'www.company.example',
        status: 'verified',
        workspaceId: '42',
      }),
    ).toEqual({ ok: false })
  })

  it('accepts only verify or revoke with one workspace identifier', () => {
    expect(parseFallbackOriginAction({ action: 'verify', workspaceId: '42' })).toEqual({
      action: 'verify',
      ok: true,
      workspaceID: '42',
    })
    expect(
      parseFallbackOriginAction({
        action: 'verify',
        originId: 'foreign',
        workspaceId: '42',
      }),
    ).toEqual({ ok: false })
    expect(parseFallbackOriginAction({ action: 'delete', workspaceId: '42' })).toEqual({
      ok: false,
    })
  })
})
