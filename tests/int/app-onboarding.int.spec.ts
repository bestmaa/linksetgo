import { describe, expect, it } from 'vitest'

import {
  buildDraftAppInput,
  emptyAppOnboardingForm,
  slugifyAppName,
  validateOnboardingStep,
} from '@/features/app-onboarding/app-onboarding.helpers'

const fingerprint = Array.from({ length: 32 }, () => 'AA').join(':')

describe('app onboarding', () => {
  it('generates a stable URL-safe app key from a product name', () => {
    expect(slugifyAppName('  Example App — Rewards!  ')).toBe('example-app-rewards')
  })

  it('reports the platform identifiers needed to publish both association files', () => {
    const errors = validateOnboardingStep(emptyAppOnboardingForm, 'platforms')

    expect(errors).toMatchObject({
      androidPackageName: expect.any(String),
      androidSha256CertFingerprints: expect.any(String),
      iosBundleId: expect.any(String),
      iosTeamId: expect.any(String),
    })
  })

  it('rejects unsafe fallbacks and unofficial store URLs inline', () => {
    const errors = validateOnboardingStep(
      {
        ...emptyAppOnboardingForm,
        appStoreUrl: 'https://example.com/app/123',
        fallbackUrl: 'http://example.com/download',
        playStoreUrl: 'https://example.com/store/apps/details?id=com.example.app',
      },
      'destinations',
    )

    expect(errors).toMatchObject({
      appStoreUrl: expect.stringContaining('official'),
      fallbackUrl: expect.stringContaining('HTTPS'),
      playStoreUrl: expect.stringContaining('official'),
    })
  })

  it('creates a draft and omits identifiers for an unselected platform', () => {
    const input = buildDraftAppInput({
      ...emptyAppOnboardingForm,
      appStoreUrl: 'https://apps.apple.com/in/app/example/id123',
      fallbackUrl: 'https://example.com/download',
      iosBundleId: 'com.example.app',
      iosTeamId: 'A1B2C3D4E5',
      name: 'Example',
      nativeScheme: 'example',
      platform: 'ios',
      slug: 'example',
    })

    expect(input).toEqual({
      appStoreUrl: 'https://apps.apple.com/in/app/example/id123',
      fallbackUrl: 'https://example.com/download',
      iosBundleId: 'com.example.app',
      iosTeamId: 'A1B2C3D4E5',
      name: 'Example',
      nativeScheme: 'example',
      slug: 'example',
      status: 'draft',
    })
    expect(input).not.toHaveProperty('androidPackageName')
  })

  it('normalizes Android fingerprints into the Payload array shape', () => {
    const input = buildDraftAppInput({
      ...emptyAppOnboardingForm,
      androidPackageName: 'com.example.app',
      androidSha256CertFingerprints: ` ${fingerprint.toLowerCase()} \n\n${fingerprint}`,
      fallbackUrl: 'https://example.com/download',
      name: 'Example',
      platform: 'android',
      slug: 'example',
    })

    expect(input.status).toBe('draft')
    expect(input.androidSha256CertFingerprints).toEqual([fingerprint.toLowerCase(), fingerprint])
    expect(input).not.toHaveProperty('iosBundleId')
  })
})
