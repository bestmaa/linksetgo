import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import {
  appDetailFingerprints,
  configurationFromAppDetailForm,
  emptyAppDetailForm,
  validateAppDetailForm,
} from '@/features/app-detail/app-detail.helpers'
import { presentAppDetail } from '@/features/app-detail/app-detail.presenter'
import { appPlatformReadiness, hasCompleteAppPlatform } from '@/lib/domain/app-readiness'
import type { AppConsoleDetailDTO } from '@/lib/client/payload-types'
import { getConsoleAppDetail, mutateConsoleApp } from '@/lib/server/app-console'
import { parseAppConsoleMutation } from '@/lib/server/app-console-input'
import type { App, User } from '@/payload-types'

const activeUser = {
  email: 'owner@relay.test',
  id: 7,
  role: 'admin',
  status: 'active',
} as User

const baseApp = {
  createdAt: '2026-07-27T00:00:00.000Z',
  fallbackUrl: 'https://example.com/download',
  id: 41,
  name: 'Example app',
  slug: 'example-app',
  status: 'draft',
  updatedAt: '2026-07-27T00:00:00.000Z',
  workspace: 12,
} as App

const fingerprint = Array.from({ length: 32 }, () => 'AA').join(':')

describe('app management domain rules', () => {
  it('requires a complete identity for at least one mobile platform', () => {
    expect(appPlatformReadiness({})).toEqual({
      android: {
        complete: false,
        missing: ['androidPackageName', 'androidSha256CertFingerprints'],
      },
      ios: { complete: false, missing: ['iosBundleId', 'iosTeamId'] },
    })
    expect(
      hasCompleteAppPlatform({
        iosBundleId: 'com.example.app',
        iosTeamId: 'A1B2C3D4E5',
      }),
    ).toBe(true)
  })

  it('rejects immutable workspace and app-key injection at the request boundary', () => {
    const attemptedMutation = parseAppConsoleMutation({
      action: 'pause',
      slug: 'attacker-selected-key',
      workspaceId: '12',
    })
    const attemptedWorkspaceMutation = parseAppConsoleMutation({
      action: 'pause',
      workspace: '99',
      workspaceId: '12',
    })

    expect(attemptedMutation).toMatchObject({ ok: false, message: expect.stringContaining('key') })
    expect(attemptedWorkspaceMutation).toMatchObject({
      ok: false,
      message: expect.stringContaining('workspace'),
    })
  })

  it('normalizes editable configuration without changing permanent values', () => {
    const form = {
      ...emptyAppDetailForm,
      androidPackageName: 'com.example.app',
      androidSha256CertFingerprints: ` ${fingerprint.toLowerCase()} \n`,
      fallbackUrl: 'https://example.com/download',
      name: ' Example app ',
    }

    expect(validateAppDetailForm(form, false)).toEqual({ errors: {}, message: null })
    expect(configurationFromAppDetailForm(form)).toMatchObject({
      androidPackageName: 'com.example.app',
      androidSha256CertFingerprints: [fingerprint],
      name: 'Example app',
    })
    expect(appDetailFingerprints(form.androidSha256CertFingerprints)).toEqual([fingerprint])
  })

  it('uses only the selected runtime domain when presenting public URLs', () => {
    const detail: AppConsoleDetailDTO = {
      app: {
        fallbackUrl: 'https://example.com/download',
        id: 41,
        name: 'Example app',
        slug: 'example-app',
        status: 'draft',
        workspace: 12,
      },
      links: [
        {
          destinationPath: '/offer',
          id: 8,
          name: 'Offer',
          slug: 'offer',
          status: 'active' as const,
        },
      ],
      totalLinks: 1,
    }

    expect(
      presentAppDetail(detail, 'Main workspace', true, 'https://links.company.com').recentLinks[0]
        ?.publicUrl,
    ).toBe('https://links.company.com/l/example-app/offer')
    expect(
      presentAppDetail(detail, 'Main workspace', true, null).recentLinks[0]?.publicUrl,
    ).toBeNull()
  })
})

describe('workspace-scoped app management service', () => {
  it('fails closed when the app does not belong to the selected workspace', async () => {
    let findOptions: Record<string, unknown> = {}
    const payload = {
      find: vi.fn(async (options: Record<string, unknown>) => {
        findOptions = options
        return { docs: [] }
      }),
    } as unknown as Payload

    const result = await getConsoleAppDetail(payload, activeUser, '41', '99')

    expect(result).toMatchObject({ code: 'NOT_FOUND', ok: false, status: 404 })
    expect(findOptions).toMatchObject({
      collection: 'apps',
      overrideAccess: false,
      user: activeUser,
      where: {
        and: [{ id: { equals: 41 } }, { workspace: { equals: 99 } }],
      },
    })
  })

  it('blocks activation before either platform is complete', async () => {
    const update = vi.fn()
    const payload = {
      find: vi.fn(async () => ({ docs: [baseApp] })),
      update,
    } as unknown as Payload

    const result = await mutateConsoleApp(payload, activeUser, '41', {
      action: 'activate',
      workspaceId: '12',
    })

    expect(result).toMatchObject({ code: 'NOT_READY', ok: false, status: 422 })
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps the workspace constraint on the atomic lifecycle update', async () => {
    const readyApp = {
      ...baseApp,
      iosBundleId: 'com.example.app',
      iosTeamId: 'A1B2C3D4E5',
    } as App
    const activeApp = { ...readyApp, status: 'active' } as App
    const find = vi.fn(async (options: { collection: string }) =>
      options.collection === 'apps'
        ? { docs: [find.mock.calls.length === 1 ? readyApp : activeApp] }
        : { docs: [], totalDocs: 0 },
    )
    let updateOptions: Record<string, unknown> = {}
    const payload = {
      find,
      update: vi.fn(async (options: Record<string, unknown>) => {
        updateOptions = options
        return { docs: [activeApp], errors: [] }
      }),
    } as unknown as Payload

    const result = await mutateConsoleApp(payload, activeUser, '41', {
      action: 'activate',
      workspaceId: '12',
    })

    expect(result.ok).toBe(true)
    expect(updateOptions).toMatchObject({
      collection: 'apps',
      data: { status: 'active' },
      overrideAccess: false,
      user: activeUser,
      where: {
        and: [{ id: { equals: 41 } }, { workspace: { equals: 12 } }],
      },
    })
  })
})
